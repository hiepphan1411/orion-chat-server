import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Friendship,
  FriendshipStatus,
} from '../friendship/entities/friendship.entity';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import {
  CalendarEvent,
  CalendarEventCategory,
  CalendarEventRecurrence,
} from './entities/calendar-event.entity';
import {
  CalendarEventParticipant,
  CalendarParticipantType,
} from './entities/calendar-event-participant.entity';
import { In, Repository } from 'typeorm';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarParticipantDto } from './dto/calendar-participant.dto';
import {
  CalendarViewMode,
  QueryCalendarEventDto,
} from './dto/query-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Injectable()
export class CalendarEventService {
  constructor(
    @InjectRepository(CalendarEvent)
    private readonly calendarEventRepo: Repository<CalendarEvent>,
    @InjectRepository(CalendarEventParticipant)
    private readonly calendarParticipantRepo: Repository<CalendarEventParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
    @InjectRepository(GroupConversation)
    private readonly groupConversationRepo: Repository<GroupConversation>,
  ) {}

  async findAllForUser(userId: string, query: QueryCalendarEventDto) {
    const { rangeStart, rangeEnd } = this.resolveRange(query);
    const keyword = query.q?.trim();

    const qb = this.calendarEventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.owner', 'owner')
      .leftJoinAndSelect('event.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'participantUser')
      .leftJoinAndSelect('participant.group', 'participantGroup')
      .where('owner.userId = :userId', { userId })
      .andWhere('event.startTime < :rangeEnd', { rangeEnd })
      .andWhere('event.endTime >= :rangeStart', { rangeStart })
      .orderBy('event.startTime', 'ASC');

    if (keyword) {
      qb.andWhere(
        '(event.title ILIKE :keyword OR event.description ILIKE :keyword OR event.location ILIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.toResponse(row));
  }

  async getParticipantOptions(userId: string, query?: string) {
    const keyword = query?.trim().toLowerCase() || '';

    const friendshipRows = await this.friendshipRepo.find({
      where: [
        { userOne: { userId }, status: FriendshipStatus.ACTIVE },
        { userTwo: { userId }, status: FriendshipStatus.ACTIVE },
      ],
      relations: ['userOne', 'userTwo'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const friendUsers = friendshipRows
      .map((row) => (row.userOne.userId === userId ? row.userTwo : row.userOne))
      .filter((item) =>
        keyword
          ? item.fullName.toLowerCase().includes(keyword) ||
            item.phoneNumber.toLowerCase().includes(keyword)
          : true,
      );

    const groupRows = await this.groupMemberRepo.find({
      where: { user: { userId } },
      relations: ['group'],
      take: 100,
    });

    const groups = groupRows
      .map((row) => row.group)
      .filter((group) =>
        keyword ? group.groupName.toLowerCase().includes(keyword) : true,
      );

    return {
      friends: friendUsers.map((user) => ({
        id: user.userId,
        type: CalendarParticipantType.FRIEND,
        name: user.fullName,
        avatarUrl: user.avatarUrl,
      })),
      groups: groups.map((group) => ({
        id: group.conversationId,
        type: CalendarParticipantType.GROUP,
        name: group.groupName,
        avatarUrl: group.groupAvatar,
      })),
    };
  }

  async create(userId: string, dto: CreateCalendarEventDto) {
    const owner = await this.userRepo.findOne({ where: { userId } });
    if (!owner) {
      throw new NotFoundException('User not found');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.validateEventTime(startTime, endTime);

    const participants = await this.resolveParticipants(
      userId,
      dto.participants,
    );

    const event = this.calendarEventRepo.create({
      owner,
      title: dto.title,
      description: dto.description || '',
      startTime,
      endTime,
      color: dto.color || '#008080',
      location: dto.location || '',
      category: dto.category || CalendarEventCategory.PERSONAL,
      recurrence: dto.recurrence || CalendarEventRecurrence.NONE,
      notificationMinutes: dto.notificationMinutes ?? 30,
      isAllDay: dto.isAllDay ?? false,
      participants,
    });

    const saved = await this.calendarEventRepo.save(event);
    return this.toResponse(saved);
  }

  async update(userId: string, eventId: string, dto: UpdateCalendarEventDto) {
    const event = await this.calendarEventRepo.findOne({
      where: { eventId },
      relations: [
        'owner',
        'participants',
        'participants.user',
        'participants.group',
      ],
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    if (event.owner.userId !== userId) {
      throw new ForbiddenException('You can only edit your own calendar event');
    }

    const nextStart = dto.startTime ? new Date(dto.startTime) : event.startTime;
    const nextEnd = dto.endTime ? new Date(dto.endTime) : event.endTime;
    this.validateEventTime(nextStart, nextEnd);

    event.title = dto.title ?? event.title;
    event.description = dto.description ?? event.description;
    event.startTime = nextStart;
    event.endTime = nextEnd;
    event.color = dto.color ?? event.color;
    event.location = dto.location ?? event.location;
    event.category = dto.category ?? event.category;
    event.recurrence = dto.recurrence ?? event.recurrence;
    event.notificationMinutes =
      dto.notificationMinutes ?? event.notificationMinutes;
    event.isAllDay = dto.isAllDay ?? event.isAllDay;

    if (dto.participants) {
      event.participants = await this.resolveParticipants(
        userId,
        dto.participants,
      );
    }

    const saved = await this.calendarEventRepo.save(event);
    return this.toResponse(saved);
  }

  async remove(userId: string, eventId: string) {
    const event = await this.calendarEventRepo.findOne({
      where: { eventId },
      relations: ['owner'],
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    if (event.owner.userId !== userId) {
      throw new ForbiddenException(
        'You can only delete your own calendar event',
      );
    }

    await this.calendarEventRepo.remove(event);
    return { success: true };
  }

  private validateEventTime(startTime: Date, endTime: Date) {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid startTime or endTime');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  private resolveRange(query: QueryCalendarEventDto) {
    if (query.from && query.to) {
      return {
        rangeStart: new Date(query.from),
        rangeEnd: new Date(query.to),
      };
    }

    const baseDate = query.date ? new Date(query.date) : new Date();
    const view = query.view || CalendarViewMode.MONTH;
    const rangeStart = new Date(baseDate);
    const rangeEnd = new Date(baseDate);

    if (view === CalendarViewMode.DAY) {
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);
      return { rangeStart, rangeEnd };
    }

    if (view === CalendarViewMode.WEEK) {
      const day = baseDate.getDay();
      rangeStart.setDate(baseDate.getDate() - day);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setDate(rangeStart.getDate() + 6);
      rangeEnd.setHours(23, 59, 59, 999);
      return { rangeStart, rangeEnd };
    }

    if (view === CalendarViewMode.MONTH) {
      rangeStart.setDate(1);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setMonth(rangeStart.getMonth() + 1, 0);
      rangeEnd.setHours(23, 59, 59, 999);
      return { rangeStart, rangeEnd };
    }

    rangeStart.setMonth(0, 1);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setMonth(11, 31);
    rangeEnd.setHours(23, 59, 59, 999);
    return { rangeStart, rangeEnd };
  }

  private async resolveParticipants(
    ownerUserId: string,
    participants?: CalendarParticipantDto[],
  ): Promise<CalendarEventParticipant[]> {
    if (!participants || !participants.length) return [];

    const friendUserIds = Array.from(
      new Set(
        participants
          .filter((p) => p.type === CalendarParticipantType.FRIEND && p.userId)
          .map((p) => p.userId as string),
      ),
    );

    const groupIds = Array.from(
      new Set(
        participants
          .filter((p) => p.type === CalendarParticipantType.GROUP && p.groupId)
          .map((p) => p.groupId as string),
      ),
    );

    const friendUsers = friendUserIds.length
      ? await this.userRepo.find({ where: { userId: In(friendUserIds) } })
      : [];

    const groups = groupIds.length
      ? await this.groupConversationRepo.find({
          where: { conversationId: In(groupIds) },
        })
      : [];

    const friendMap = new Map(friendUsers.map((u) => [u.userId, u]));
    const groupMap = new Map(groups.map((g) => [g.conversationId, g]));

    if (friendUserIds.length) {
      const friendshipRows = await this.friendshipRepo.find({
        where: [
          {
            userOne: { userId: ownerUserId },
            userTwo: { userId: In(friendUserIds) },
            status: FriendshipStatus.ACTIVE,
          },
          {
            userTwo: { userId: ownerUserId },
            userOne: { userId: In(friendUserIds) },
            status: FriendshipStatus.ACTIVE,
          },
        ],
        relations: ['userOne', 'userTwo'],
      });

      const validFriendIds = new Set(
        friendshipRows.map((row) =>
          row.userOne.userId === ownerUserId
            ? row.userTwo.userId
            : row.userOne.userId,
        ),
      );

      for (const friendId of friendUserIds) {
        if (!validFriendIds.has(friendId)) {
          throw new BadRequestException(
            `User ${friendId} is not your friend participant`,
          );
        }
      }
    }

    if (groupIds.length) {
      const groupMemberships = await this.groupMemberRepo.find({
        where: {
          user: { userId: ownerUserId },
          group: { conversationId: In(groupIds) },
        },
        relations: ['group', 'user'],
      });

      const validGroupIds = new Set(
        groupMemberships.map((item) => item.group.conversationId),
      );
      for (const groupId of groupIds) {
        if (!validGroupIds.has(groupId)) {
          throw new BadRequestException(
            `Group ${groupId} is not in your memberships`,
          );
        }
      }
    }

    return participants.map((item) => {
      if (item.type === CalendarParticipantType.FRIEND) {
        const user = friendMap.get(item.userId as string);
        if (!user) {
          throw new BadRequestException('Friend participant not found');
        }

        return this.calendarParticipantRepo.create({
          type: CalendarParticipantType.FRIEND,
          user,
          group: null,
          displayName: item.displayName || user.fullName,
          avatarUrl: item.avatarUrl ?? user.avatarUrl ?? null,
        });
      }

      const group = groupMap.get(item.groupId as string);
      if (!group) {
        throw new BadRequestException('Group participant not found');
      }

      return this.calendarParticipantRepo.create({
        type: CalendarParticipantType.GROUP,
        user: null,
        group,
        displayName: item.displayName || group.groupName,
        avatarUrl: item.avatarUrl ?? group.groupAvatar ?? null,
      });
    });
  }

  private toResponse(event: CalendarEvent) {
    return {
      id: event.eventId,
      title: event.title,
      description: event.description,
      start: event.startTime.toISOString(),
      end: event.endTime.toISOString(),
      color: event.color,
      location: event.location,
      category: event.category,
      recurrence: event.recurrence,
      notificationMinutes: event.notificationMinutes,
      isAllDay: event.isAllDay,
      participants: (event.participants || []).map((participant) => ({
        id: participant.participantId,
        type: participant.type,
        userId: participant.user?.userId,
        groupId: participant.group?.conversationId,
        name: participant.displayName,
        avatar: participant.avatarUrl,
      })),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}
