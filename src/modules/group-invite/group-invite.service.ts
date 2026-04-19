import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupInvite, GroupInviteStatus } from './entities/group-invite.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import { NotificationService } from '../notifications/notification.service';

const GROUP_MEMBER_LIMIT = 10;

@Injectable()
export class GroupInviteService {
  constructor(
    @InjectRepository(GroupInvite)
    private readonly inviteRepo: Repository<GroupInvite>,
    @InjectRepository(GroupConversation)
    private readonly groupRepo: Repository<GroupConversation>,
    @InjectRepository(GroupMember)
    private readonly memberRepo: Repository<GroupMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
  ) {}

  async sendInvite(
    groupId: string,
    inviterId: string,
    inviteeId: string,
  ): Promise<GroupInvite> {
    if (inviterId === inviteeId) {
      throw new BadRequestException('Cannot invite yourself');
    }

    const [group, inviter, invitee] = await Promise.all([
      this.groupRepo.findOne({ where: { conversationId: groupId } }),
      this.userRepo.findOne({ where: { userId: inviterId } }),
      this.userRepo.findOne({ where: { userId: inviteeId } }),
    ]);

    if (!group) throw new NotFoundException('Group not found');
    if (!inviter || !invitee) throw new NotFoundException('User not found');

    const [inviterMembership, inviteeMembership] = await Promise.all([
      this.memberRepo.findOne({
        where: {
          group: { conversationId: groupId },
          user: { userId: inviterId },
        },
      }),
      this.memberRepo.findOne({
        where: {
          group: { conversationId: groupId },
          user: { userId: inviteeId },
        },
      }),
    ]);

    if (!inviterMembership) {
      throw new BadRequestException('Inviter is not a group member');
    }

    if (inviteeMembership) {
      throw new BadRequestException('Invitee is already a group member');
    }

    const currentMemberCount = await this.memberRepo.count({
      where: { group: { conversationId: groupId } },
    });

    if (currentMemberCount >= GROUP_MEMBER_LIMIT) {
      throw new BadRequestException(
        `Group member limit reached (${GROUP_MEMBER_LIMIT})`,
      );
    }

    const existing = await this.inviteRepo.findOne({
      where: {
        group: { conversationId: groupId },
        invitee: { userId: inviteeId },
        status: GroupInviteStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException('Pending group invite already exists');
    }

    const invite = this.inviteRepo.create({
      group,
      inviter,
      invitee,
      status: GroupInviteStatus.PENDING,
      respondedAt: null,
    });

    const savedInvite = await this.inviteRepo.save(invite);

    await this.notificationService.createAndEmit({
      userId: invitee.userId,
      type: 'group_invite',
      title: 'Loi moi vao nhom moi',
      body: `${inviter.fullName} da moi ban vao nhom ${group.groupName}.`,
      link: '/chat/group',
      metadata: {
        inviteId: savedInvite.inviteId,
        groupId: group.conversationId,
        groupName: group.groupName,
        inviterId: inviter.userId,
        inviteeId: invitee.userId,
      },
    });

    return savedInvite;
  }

  async getIncomingInvites(inviteeId: string): Promise<GroupInvite[]> {
    return this.inviteRepo.find({
      where: {
        invitee: { userId: inviteeId },
        status: GroupInviteStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getMyGroups(userId: string) {
    const memberships = await this.memberRepo.find({
      where: { user: { userId } },
      relations: ['group'],
      order: { joinedAt: 'DESC' },
    });

    const result = await Promise.all(
      memberships.map(async (membership) => {
        const memberCount = await this.memberRepo.count({
          where: { group: { conversationId: membership.group.conversationId } },
        });

        return {
          id: membership.group.conversationId,
          name: membership.group.groupName,
          avatar: membership.group.groupAvatar,
          memberCount,
          isPublic: true,
          type: 'COMMUNITY' as const,
          description: '',
        };
      }),
    );

    return result;
  }

  async acceptInvite(inviteId: string, inviteeId: string) {
    const invite = await this.inviteRepo.findOne({
      where: { inviteId },
      relations: ['group', 'invitee', 'inviter'],
    });

    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.invitee.userId !== inviteeId) {
      throw new BadRequestException('Not allowed to accept this invite');
    }

    if (invite.status !== GroupInviteStatus.PENDING) {
      throw new BadRequestException('Invite is not pending');
    }

    const existingMember = await this.memberRepo.findOne({
      where: {
        group: { conversationId: invite.group.conversationId },
        user: { userId: inviteeId },
      },
    });

    const currentMemberCount = await this.memberRepo.count({
      where: { group: { conversationId: invite.group.conversationId } },
    });

    if (!existingMember && currentMemberCount >= GROUP_MEMBER_LIMIT) {
      throw new BadRequestException(
        `Group member limit reached (${GROUP_MEMBER_LIMIT})`,
      );
    }

    if (!existingMember) {
      const user = await this.userRepo.findOne({
        where: { userId: inviteeId },
      });
      if (!user) throw new NotFoundException('User not found');

      const member = this.memberRepo.create({
        group: invite.group,
        user,
        role: GroupMemberRole.MEMBER,
      });

      await this.memberRepo.save(member);
    }

    invite.status = GroupInviteStatus.ACCEPTED;
    invite.respondedAt = new Date();
    await this.inviteRepo.save(invite);

    if (invite.inviter?.userId) {
      await this.notificationService.createAndEmit({
        userId: invite.inviter.userId,
        type: 'group_invite',
        title: 'Loi moi vao nhom duoc chap nhan',
        body: `${invite.invitee.fullName} da tham gia nhom ${invite.group.groupName}.`,
        link: '/chat/group',
        metadata: {
          inviteId: invite.inviteId,
          groupId: invite.group.conversationId,
          inviteeId: invite.invitee.userId,
          status: invite.status,
        },
      });
    }

    return { success: true };
  }

  async declineInvite(inviteId: string, inviteeId: string) {
    const invite = await this.inviteRepo.findOne({
      where: { inviteId },
      relations: ['group', 'invitee', 'inviter'],
    });

    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.invitee.userId !== inviteeId) {
      throw new BadRequestException('Not allowed to decline this invite');
    }

    if (invite.status !== GroupInviteStatus.PENDING) {
      throw new BadRequestException('Invite is not pending');
    }

    invite.status = GroupInviteStatus.DECLINED;
    invite.respondedAt = new Date();
    await this.inviteRepo.save(invite);

    if (invite.inviter?.userId) {
      await this.notificationService.createAndEmit({
        userId: invite.inviter.userId,
        type: 'group_invite',
        title: 'Loi moi vao nhom bi tu choi',
        body: `${invite.invitee.fullName} da tu choi loi moi vao nhom ${invite.group.groupName}.`,
        link: '/chat/group',
        metadata: {
          inviteId: invite.inviteId,
          groupId: invite.group.conversationId,
          inviteeId: invite.invitee.userId,
          status: invite.status,
        },
      });
    }

    return { success: true };
  }
}
