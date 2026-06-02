import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Friendship,
  FriendshipStatus,
} from '../friendship/entities/friendship.entity';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import {
  CalendarEvent,
  CalendarEventCategory,
  CalendarEventRecurrence,
} from './entities/calendar-event.entity';
import {
  CalendarEventParticipant,
  CalendarParticipantType,
  CalendarParticipantStatus,
} from './entities/calendar-event-participant.entity';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { CalendarParticipantDto } from './dto/calendar-participant.dto';
import {
  CalendarViewMode,
  QueryCalendarEventDto,
} from './dto/query-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { NotificationService } from '../notifications/notification.service';
import { MessageService } from '../message/message.service';
import { ChatGateway } from '../message/chat.gateway';
import { MessageType } from 'src/common/enums/message-type.enum';

@Injectable()
export class CalendarEventService implements OnModuleInit, OnModuleDestroy {
  private reminderTimer: NodeJS.Timeout | null = null;

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
    private readonly notificationService: NotificationService,
    private readonly messageService: MessageService,
    private readonly chatGateway: ChatGateway,
  ) {}

  onModuleInit() {
    this.reminderTimer = setInterval(() => {
      this.sendDueReminders().catch(() => undefined);
    }, 30000);
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  async findAllForUser(userId: string, query: QueryCalendarEventDto) {
    const { rangeStart, rangeEnd } = this.resolveRange(query);
    const keyword = query.q?.trim();
    const joinedGroupIds = await this.getJoinedGroupIds(userId);

    const qb = this.calendarEventRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.owner', 'owner')
      .leftJoinAndSelect('event.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'participantUser')
      .leftJoinAndSelect('participant.group', 'participantGroup')
      .where(
        new Brackets((whereQb) => {
          whereQb
            .where('owner.userId = :userId', { userId })
            .orWhere(
              'participantUser.userId = :userId AND participant.status = :accepted',
              {
                userId,
                accepted: CalendarParticipantStatus.ACCEPTED,
              },
            );

          if (joinedGroupIds.length) {
            whereQb.orWhere(
              'participantGroup.conversationId IN (:...groupIds) AND participant.status = :accepted',
              {
                groupIds: joinedGroupIds,
                accepted: CalendarParticipantStatus.ACCEPTED,
              },
            );
          }
        }),
      )
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
      .filter((row) => this.isGroupAdminRole(row.role))
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
      [],
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
      reminderSentAt: null,
      participants,
    });

    const saved = await this.calendarEventRepo.save(event);
    await this.notifyEventInvitees(saved, new Set<string>());
    await this.sendGroupEventMessages(saved, new Set<string>());
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

    const previousInvitees = await this.resolvePendingInviteRecipientIds(event);
    const previousGroupIds = this.getGroupParticipantIds(event);

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
    event.reminderSentAt = null;

    if (dto.participants) {
      event.participants = await this.resolveParticipants(
        userId,
        dto.participants,
        event.participants,
      );
    }

    const saved = await this.calendarEventRepo.save(event);
    await this.notifyEventInvitees(saved, new Set(previousInvitees));
    await this.sendGroupEventMessages(saved, new Set(previousGroupIds));
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
    existingParticipants: CalendarEventParticipant[] = [],
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

      const membershipByGroup = new Map(
        groupMemberships.map((item) => [item.group.conversationId, item]),
      );

      for (const groupId of groupIds) {
        const membership = membershipByGroup.get(groupId);
        if (!membership) {
          throw new BadRequestException(
            `Group ${groupId} is not in your memberships`,
          );
        }

        if (!this.isGroupAdminRole(membership.role)) {
          throw new ForbiddenException(
            `Group ${groupId} requires owner/admin permissions to add events`,
          );
        }
      }
    }

    const existingMap = new Map(
      existingParticipants.map((participant) => [
        this.getParticipantKey(participant),
        participant,
      ]),
    );

    return participants.map((item) => {
      if (item.type === CalendarParticipantType.FRIEND) {
        const user = friendMap.get(item.userId as string);
        if (!user) {
          throw new BadRequestException('Friend participant not found');
        }

        const key = this.getParticipantKey(item);
        const existing = existingMap.get(key);
        const status = existing
          ? existing.status === CalendarParticipantStatus.DECLINED
            ? CalendarParticipantStatus.PENDING
            : existing.status
          : CalendarParticipantStatus.PENDING;

        return this.calendarParticipantRepo.create({
          type: CalendarParticipantType.FRIEND,
          user,
          group: null,
          displayName: item.displayName || user.fullName,
          avatarUrl: item.avatarUrl ?? user.avatarUrl ?? null,
          status,
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
        status: CalendarParticipantStatus.ACCEPTED,
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
      reminderSentAt: event.reminderSentAt,
      participants: (event.participants || []).map((participant) => ({
        id: participant.participantId,
        type: participant.type,
        userId: participant.user?.userId,
        groupId: participant.group?.conversationId,
        name: participant.displayName,
        avatar: participant.avatarUrl,
        status: participant.status,
      })),
      owner: event.owner
        ? {
            userId: event.owner.userId,
            fullName: event.owner.fullName,
            avatarUrl: event.owner.avatarUrl,
          }
        : null,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private async getJoinedGroupIds(userId: string): Promise<string[]> {
    const rows = await this.groupMemberRepo.find({
      where: { user: { userId } },
      relations: ['group'],
      take: 200,
    });

    return Array.from(
      new Set(
        rows
          .map((row) => row.group?.conversationId)
          .filter((id): id is string => !!id),
      ),
    );
  }

  private async resolveParticipantRecipientIds(event: CalendarEvent) {
    const recipientIds = new Set<string>();

    for (const participant of event.participants || []) {
      if (
        participant.type === CalendarParticipantType.FRIEND &&
        participant.user?.userId &&
        participant.status === CalendarParticipantStatus.ACCEPTED
      ) {
        recipientIds.add(participant.user.userId);
      }
    }

    const groupIds = Array.from(
      new Set(
        (event.participants || [])
          .filter(
            (participant) => participant.type === CalendarParticipantType.GROUP,
          )
          .map((participant) => participant.group?.conversationId)
          .filter((id): id is string => !!id),
      ),
    );

    if (groupIds.length) {
      const memberships = await this.groupMemberRepo.find({
        where: { group: { conversationId: In(groupIds) } },
        relations: ['user'],
      });

      for (const membership of memberships) {
        if (membership.user?.userId) {
          recipientIds.add(membership.user.userId);
        }
      }
    }

    recipientIds.delete(event.owner?.userId);
    return Array.from(recipientIds);
  }

  private async resolvePendingInviteRecipientIds(event: CalendarEvent) {
    const recipientIds = new Set<string>();

    for (const participant of event.participants || []) {
      if (
        participant.type === CalendarParticipantType.FRIEND &&
        participant.user?.userId &&
        participant.status === CalendarParticipantStatus.PENDING
      ) {
        recipientIds.add(participant.user.userId);
      }
    }

    recipientIds.delete(event.owner?.userId);
    return Array.from(recipientIds);
  }

  private async notifyEventInvitees(
    event: CalendarEvent,
    existingRecipientIds: Set<string>,
  ) {
    const recipientIds = await this.resolvePendingInviteRecipientIds(event);
    const newRecipients = recipientIds.filter(
      (id) => !existingRecipientIds.has(id),
    );

    for (const userId of newRecipients) {
      await this.notificationService.createAndEmit({
        userId,
        type: 'event_invite',
        title: 'You are invited to an event',
        body: `${event.owner.fullName} has invited you to the event "${event.title}"`,
        link: '/calendar',
        metadata: {
          eventId: event.eventId,
          startTime: event.startTime,
          invitedBy: event.owner.userId,
        },
      });
    }
  }

  private getGroupParticipantIds(event: CalendarEvent) {
    return Array.from(
      new Set(
        (event.participants || [])
          .filter(
            (participant) => participant.type === CalendarParticipantType.GROUP,
          )
          .map((participant) => participant.group?.conversationId)
          .filter((id): id is string => !!id),
      ),
    );
  }

  private isGroupAdminRole(role: GroupMemberRole) {
    return (
      role === GroupMemberRole.OWNER ||
      role === GroupMemberRole.ADMIN ||
      role === GroupMemberRole.CO_ADMIN
    );
  }

  private getParticipantKey(
    participant: CalendarParticipantDto | CalendarEventParticipant,
  ) {
    if (participant.type === CalendarParticipantType.FRIEND) {
      const userId =
        participant instanceof CalendarEventParticipant
          ? participant.user?.userId
          : participant.userId;
      return `friend:${userId ?? ''}`;
    }

    const groupId =
      participant instanceof CalendarEventParticipant
        ? participant.group?.conversationId
        : participant.groupId;
    return `group:${groupId ?? ''}`;
  }

  private async sendGroupEventMessages(
    event: CalendarEvent,
    previousGroupIds: Set<string>,
  ) {
    const groupIds = this.getGroupParticipantIds(event).filter(
      (id) => !previousGroupIds.has(id),
    );

    if (!groupIds.length || !event.owner) return;

    const messageContent = `${event.owner.fullName} has scheduled an event "${event.title}" for this group.`;

    for (const groupId of groupIds) {
      try {
        const message = await this.messageService.createMessage({
          conversationId: groupId,
          senderBy: event.owner.userId,
          content: messageContent,
          messageType: MessageType.SYSTEM,
        });

        this.chatGateway.emitNewMessage({
          conversationId: groupId,
          messageId: String(message._id),
          senderBy: event.owner.userId,
          senderName: event.owner.fullName,
          senderAvatar: event.owner.avatarUrl || undefined,
          content: message.content ?? messageContent,
          messageType: message.messageType,
          createdAt: message.createdAt,
          clientMessageId: message.clientMessageId,
          messageStatus: message.messageStatus,
        });
      } catch (error) {
        // Swallow errors to avoid blocking event creation.
        continue;
      }
    }
  }

  private async sendDueReminders() {
    const now = new Date();
    const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const candidates = await this.calendarEventRepo.find({
      where: {
        reminderSentAt: IsNull(),
      },
      relations: [
        'owner',
        'participants',
        'participants.user',
        'participants.group',
      ],
      take: 200,
      order: { startTime: 'ASC' },
    });

    const dueEvents = candidates.filter((event) => {
      if (!event.owner?.userId) return false;
      if (event.startTime <= now || event.startTime > nextDay) return false;

      const reminderTime = new Date(
        event.startTime.getTime() - event.notificationMinutes * 60 * 1000,
      );

      return reminderTime <= now;
    });

    for (const event of dueEvents) {
      const recipientIds = new Set<string>([event.owner.userId]);
      const participantRecipientIds =
        await this.resolveParticipantRecipientIds(event);
      participantRecipientIds.forEach((id) => recipientIds.add(id));

      for (const recipientId of recipientIds) {
        await this.notificationService.createAndEmit({
          userId: recipientId,
          type: 'event_reminder',
          title: 'Event reminder',
          body: `${event.title} will start at ${event.startTime.toLocaleTimeString()}`,
          link: '/calendar',
          metadata: {
            eventId: event.eventId,
            startTime: event.startTime,
            notificationMinutes: event.notificationMinutes,
          },
        });
      }

      event.reminderSentAt = new Date();
      await this.calendarEventRepo.save(event);
    }
  }

  async findPendingInvites(userId: string) {
    const participants = await this.calendarParticipantRepo.find({
      where: {
        user: { userId },
        type: CalendarParticipantType.FRIEND,
        status: CalendarParticipantStatus.PENDING,
      },
      relations: [
        'event',
        'event.owner',
        'event.participants',
        'event.participants.user',
        'event.participants.group',
      ],
      order: { participantId: 'DESC' },
    });

    const events = new Map<string, CalendarEvent>();
    for (const participant of participants) {
      if (participant.event?.eventId) {
        events.set(participant.event.eventId, participant.event);
      }
    }

    return Array.from(events.values()).map((event) => this.toResponse(event));
  }

  async respondToInvite(
    userId: string,
    eventId: string,
    status:
      | CalendarParticipantStatus.ACCEPTED
      | CalendarParticipantStatus.DECLINED,
  ) {
    const participant = await this.calendarParticipantRepo.findOne({
      where: {
        event: { eventId },
        user: { userId },
        type: CalendarParticipantType.FRIEND,
      },
      relations: [
        'event',
        'event.owner',
        'event.participants',
        'event.participants.user',
        'event.participants.group',
      ],
    });

    if (!participant) {
      throw new NotFoundException('Event invite not found');
    }

    participant.status = status;
    await this.calendarParticipantRepo.save(participant);

    return this.toResponse(participant.event);
  }
}
