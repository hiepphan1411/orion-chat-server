import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import {
  ConversationParticipant,
  ParticipantRole,
} from '../conversation/entities/conversation-participant.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import { NotificationService } from '../notifications/notification.service';
import {
  GroupJoinRequest,
  GroupJoinRequestStatus,
} from '../group-invite/entities/group-join-request.entity';

const GROUP_MEMBER_LIMIT = 10;

@Injectable()
export class GroupManagementService {
  private readonly logger = new Logger(GroupManagementService.name);

  constructor(
    @InjectRepository(GroupConversation)
    private readonly groupRepo: Repository<GroupConversation>,
    @InjectRepository(GroupMember)
    private readonly memberRepo: Repository<GroupMember>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(GroupJoinRequest)
    private readonly joinRequestRepo: Repository<GroupJoinRequest>,
    private readonly notificationService: NotificationService,
  ) {}

  private async validateGroupExists(
    groupId: string,
  ): Promise<GroupConversation> {
    const group = await this.groupRepo.findOne({
      where: { conversationId: groupId },
    });

    if (!group) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }

    if (group.isDissolved) {
      throw new BadRequestException('This group has been dissolved');
    }

    return group;
  }

  private async getUserMembership(
    groupId: string,
    userId: string,
  ): Promise<GroupMember> {
    const membership = await this.memberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId },
      },
      relations: ['group', 'user'],
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }

    return membership;
  }

  private canModerateJoinRequests(role: GroupMemberRole): boolean {
    return (
      role === GroupMemberRole.OWNER ||
      role === GroupMemberRole.CO_ADMIN ||
      role === GroupMemberRole.ADMIN
    );
  }

  private isTopRole(role: GroupMemberRole): boolean {
    return role === GroupMemberRole.OWNER || role === GroupMemberRole.ADMIN;
  }

  private isOwner(role: GroupMemberRole): boolean {
    return role === GroupMemberRole.OWNER;
  }

  private async countMembers(groupId: string): Promise<number> {
    return this.memberRepo.count({
      where: {
        group: { conversationId: groupId },
      },
    });
  }

  private async ensureMemberCapacity(groupId: string): Promise<void> {
    const memberCount = await this.countMembers(groupId);
    if (memberCount >= GROUP_MEMBER_LIMIT) {
      throw new BadRequestException(
        `Group member limit reached (${GROUP_MEMBER_LIMIT})`,
      );
    }
  }

  async updateJoinApprovalSetting(
    groupId: string,
    actorUserId: string,
    joinRequireApproval: boolean,
  ) {
    await this.validateGroupExists(groupId);

    const actor = await this.getUserMembership(groupId, actorUserId);
    if (!this.canModerateJoinRequests(actor.role)) {
      throw new ForbiddenException(
        'Only group leader/deputy can update join approval setting',
      );
    }

    await this.groupRepo.update(
      { conversationId: groupId },
      { joinRequireApproval },
    );

    this.logger.log(
      `User ${actorUserId} updated joinRequireApproval=${joinRequireApproval} in group ${groupId}`,
    );

    return {
      groupId,
      joinRequireApproval,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  async getGroupDetail(groupId: string, userId: string) {
    const group = await this.validateGroupExists(groupId);

    const [membership, pendingRequest, memberCount] = await Promise.all([
      this.memberRepo.findOne({
        where: {
          group: { conversationId: groupId },
          user: { userId },
        },
      }),
      this.joinRequestRepo.findOne({
        where: {
          group: { conversationId: groupId },
          requester: { userId },
          status: GroupJoinRequestStatus.PENDING,
        },
      }),
      this.countMembers(groupId),
    ]);

    return {
      groupId: group.conversationId,
      groupName: group.groupName,
      groupAvatar: group.groupAvatar,
      ownerId: group.ownerId,
      joinRequireApproval: !!group.joinRequireApproval,
      memberCount,
      memberLimit: GROUP_MEMBER_LIMIT,
      isMember: !!membership,
      myJoinRequestStatus: pendingRequest
        ? GroupJoinRequestStatus.PENDING
        : null,
    };
  }

  async joinGroup(groupId: string, userId: string, message?: string) {
    const group = await this.validateGroupExists(groupId);

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.memberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId },
      },
    });

    if (existingMember) {
      throw new BadRequestException('You are already a group member');
    }

    if (group.joinRequireApproval) {
      const pendingRequest = await this.joinRequestRepo.findOne({
        where: {
          group: { conversationId: groupId },
          requester: { userId },
          status: GroupJoinRequestStatus.PENDING,
        },
      });

      if (pendingRequest) {
        throw new ConflictException('Pending join request already exists');
      }

      const createdRequest = this.joinRequestRepo.create({
        group,
        requester: user,
        status: GroupJoinRequestStatus.PENDING,
        message: message || null,
      });
      const saved = await this.joinRequestRepo.save(createdRequest);

      const moderators = await this.memberRepo.find({
        where: { group: { conversationId: groupId } },
        relations: ['user'],
      });

      for (const moderator of moderators.filter((m) =>
        this.canModerateJoinRequests(m.role),
      )) {
        await this.notificationService.createAndEmit({
          userId: moderator.user.userId,
          type: 'group_join_request',
          title: 'Yêu cầu tham gia nhóm mới',
          body: `${user.fullName} đã gửi yêu cầu tham gia nhóm ${group.groupName}.`,
          link: `/groups/${groupId}/join-requests`,
          metadata: {
            groupId,
            requestId: saved.requestId,
            requesterId: userId,
          },
        });
      }

      this.logger.log(
        `User ${userId} created join request for group ${groupId}`,
      );

      return {
        status: 'pending_approval',
        groupId,
        requestId: saved.requestId,
      };
    }

    await this.ensureMemberCapacity(groupId);

    await this.memberRepo.manager.transaction(async (manager) => {
      const member = manager.create(GroupMember, {
        group,
        user,
        role: GroupMemberRole.MEMBER,
      });

      const participant = manager.create(ConversationParticipant, {
        conversationId: groupId,
        userId,
        role: ParticipantRole.MEMBER,
      });

      await manager.save(GroupMember, member);
      await manager.save(ConversationParticipant, participant);
    });

    this.logger.log(`User ${userId} joined group ${groupId} directly`);

    return {
      status: 'joined',
      groupId,
      memberLimit: GROUP_MEMBER_LIMIT,
    };
  }

  async approveJoinRequest(
    groupId: string,
    requestId: string,
    approverId: string,
  ) {
    const group = await this.validateGroupExists(groupId);
    const approverMembership = await this.getUserMembership(
      groupId,
      approverId,
    );

    if (!this.canModerateJoinRequests(approverMembership.role)) {
      throw new ForbiddenException(
        'Only group leader/deputy can approve join requests',
      );
    }

    const joinRequest = await this.joinRequestRepo.findOne({
      where: { requestId, group: { conversationId: groupId } },
      relations: ['group', 'requester'],
    });

    if (!joinRequest) {
      throw new NotFoundException('Join request not found');
    }

    if (joinRequest.status !== GroupJoinRequestStatus.PENDING) {
      throw new ConflictException(
        `Join request is already ${joinRequest.status}`,
      );
    }

    const existingMember = await this.memberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId: joinRequest.requester.userId },
      },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a group member');
    }

    await this.ensureMemberCapacity(groupId);

    await this.memberRepo.manager.transaction(async (manager) => {
      joinRequest.status = GroupJoinRequestStatus.APPROVED;
      joinRequest.approvedBy = approverId;
      joinRequest.respondedAt = new Date();

      await manager.save(GroupJoinRequest, joinRequest);

      const newMember = manager.create(GroupMember, {
        group,
        user: joinRequest.requester,
        role: GroupMemberRole.MEMBER,
      });

      const newParticipant = manager.create(ConversationParticipant, {
        conversationId: groupId,
        userId: joinRequest.requester.userId,
        role: ParticipantRole.MEMBER,
      });

      await manager.save(GroupMember, newMember);
      await manager.save(ConversationParticipant, newParticipant);
    });

    await this.notificationService.createAndEmit({
      userId: joinRequest.requester.userId,
      type: 'group_join_approved',
      title: 'Yêu cầu tham gia nhóm được chấp nhận',
      body: `Yêu cầu tham gia nhóm ${group.groupName} đã được chấp nhận.`,
      link: `/groups/${groupId}`,
      metadata: {
        groupId,
        requestId,
        groupName: group.groupName,
      },
    });

    this.logger.log(
      `User ${approverId} approved join request ${requestId} in group ${groupId}`,
    );

    return {
      status: 'approved',
      groupId,
      requestId,
      member: {
        userId: joinRequest.requester.userId,
        role: GroupMemberRole.MEMBER,
      },
    };
  }

  async rejectJoinRequest(
    groupId: string,
    requestId: string,
    rejectorId: string,
  ) {
    const group = await this.validateGroupExists(groupId);
    const rejectorMembership = await this.getUserMembership(
      groupId,
      rejectorId,
    );

    if (!this.canModerateJoinRequests(rejectorMembership.role)) {
      throw new ForbiddenException(
        'Only group leader/deputy can reject join requests',
      );
    }

    const joinRequest = await this.joinRequestRepo.findOne({
      where: { requestId, group: { conversationId: groupId } },
      relations: ['requester'],
    });

    if (!joinRequest) {
      throw new NotFoundException('Join request not found');
    }

    if (joinRequest.status !== GroupJoinRequestStatus.PENDING) {
      throw new ConflictException(
        `Join request is already ${joinRequest.status}`,
      );
    }

    joinRequest.status = GroupJoinRequestStatus.REJECTED;
    joinRequest.rejectedBy = rejectorId;
    joinRequest.respondedAt = new Date();
    await this.joinRequestRepo.save(joinRequest);

    await this.notificationService.createAndEmit({
      userId: joinRequest.requester.userId,
      type: 'group_join_rejected',
      title: 'Yêu cầu tham gia nhóm bị từ chối',
      body: `Yêu cầu tham gia nhóm ${group.groupName} đã bị từ chối.`,
      link: '/groups',
      metadata: {
        groupId,
        requestId,
      },
    });

    this.logger.log(
      `User ${rejectorId} rejected join request ${requestId} in group ${groupId}`,
    );

    return {
      status: 'rejected',
      groupId,
      requestId,
      requesterId: joinRequest.requester.userId,
    };
  }

  async createJoinRequest(groupId: string, userId: string, message?: string) {
    return this.joinGroup(groupId, userId, message);
  }

  async getJoinRequests(groupId: string, userId: string) {
    const membership = await this.getUserMembership(groupId, userId);

    if (!this.canModerateJoinRequests(membership.role)) {
      throw new ForbiddenException(
        'Only group leader/deputy can view join requests',
      );
    }

    return this.joinRequestRepo.find({
      where: {
        group: { conversationId: groupId },
        status: GroupJoinRequestStatus.PENDING,
      },
      relations: ['requester'],
      order: { createdAt: 'DESC' },
    });
  }

  async promoteToAdmin(
    groupId: string,
    targetUserId: string,
    promoterId: string,
  ) {
    await this.validateGroupExists(groupId);

    if (promoterId === targetUserId) {
      throw new BadRequestException('Cannot promote yourself');
    }

    const promoterMembership = await this.getUserMembership(
      groupId,
      promoterId,
    );

    if (!this.isTopRole(promoterMembership.role)) {
      throw new ForbiddenException(
        'Only admin-level members can promote members',
      );
    }

    const targetMembership = await this.memberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId: targetUserId },
      },
      relations: ['user'],
    });

    if (!targetMembership) {
      throw new NotFoundException('Target user is not a group member');
    }

    if (targetMembership.role !== GroupMemberRole.MEMBER) {
      throw new BadRequestException(
        'User already has an elevated role in this group',
      );
    }

    targetMembership.role = GroupMemberRole.CO_ADMIN;
    await this.memberRepo.save(targetMembership);

    await this.notificationService.createAndEmit({
      userId: targetUserId,
      type: 'group_promoted',
      title: 'Được nâng cấp thành Phó nhóm',
      body: 'Bạn đã được nâng cấp lên vị trí Phó nhóm.',
      link: `/groups/${groupId}`,
      metadata: {
        groupId,
        newRole: GroupMemberRole.CO_ADMIN,
      },
    });

    this.logger.log(
      `User ${promoterId} promoted ${targetUserId} to deputy in group ${groupId}`,
    );

    return {
      success: true,
      message: `User promoted to ${GroupMemberRole.CO_ADMIN}`,
      data: targetMembership,
    };
  }

  async removeMember(groupId: string, targetUserId: string, removerId: string) {
    await this.validateGroupExists(groupId);

    if (removerId === targetUserId) {
      throw new BadRequestException(
        'Cannot remove yourself via this endpoint. Use leave endpoint instead',
      );
    }

    const removerMembership = await this.getUserMembership(groupId, removerId);

    if (!this.canModerateJoinRequests(removerMembership.role)) {
      throw new ForbiddenException('Only admins/owners can remove members');
    }

    const targetMembership = await this.memberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId: targetUserId },
      },
      relations: ['user'],
    });

    if (!targetMembership) {
      throw new NotFoundException('Target user is not a group member');
    }

    if (
      removerMembership.role === GroupMemberRole.CO_ADMIN &&
      this.isOwner(targetMembership.role)
    ) {
      throw new ForbiddenException('Co-admin cannot remove group owner');
    }

    await this.memberRepo.manager.transaction(async (manager) => {
      await manager.remove(GroupMember, targetMembership);
      await manager.delete(ConversationParticipant, {
        conversationId: groupId,
        userId: targetUserId,
      });
    });

    await this.notificationService.createAndEmit({
      userId: targetUserId,
      type: 'group_removed',
      title: 'Bị xóa khỏi nhóm',
      body: 'Bạn đã bị xóa khỏi nhóm.',
      link: '/groups',
      metadata: {
        groupId,
        removedBy: removerId,
      },
    });

    this.logger.log(
      `User ${removerId} removed ${targetUserId} from group ${groupId}`,
    );

    return {
      success: true,
      message: 'Member removed from group',
    };
  }

  async leaveGroup(groupId: string, userId: string) {
    await this.validateGroupExists(groupId);

    const membership = await this.getUserMembership(groupId, userId);

    if (this.isOwner(membership.role)) {
      const otherAdmins = await this.memberRepo.find({
        where: {
          group: { conversationId: groupId },
        },
        relations: ['user'],
      });

      const hasOtherAdmin = otherAdmins.some(
        (m) =>
          m.user.userId !== userId &&
          (this.isOwner(m.role) || m.role === GroupMemberRole.ADMIN),
      );

      if (!hasOtherAdmin) {
        throw new BadRequestException(
          'Cannot leave group as owner without another admin. Please promote someone first or disband the group.',
        );
      }
    }

    await this.memberRepo.manager.transaction(async (manager) => {
      await manager.remove(GroupMember, membership);
      await manager.delete(ConversationParticipant, {
        conversationId: groupId,
        userId,
      });
    });

    this.logger.log(`User ${userId} left group ${groupId}`);

    return {
      success: true,
      message: 'You have left the group',
    };
  }

  async disbandGroup(groupId: string, userId: string) {
    const group = await this.validateGroupExists(groupId);
    const membership = await this.getUserMembership(groupId, userId);

    if (!this.isOwner(membership.role)) {
      throw new ForbiddenException('Only group owner can disband the group');
    }

    group.isDissolved = true;
    group.dissolvedAt = new Date();
    group.dissolvedBy = userId;
    await this.groupRepo.save(group);

    const members = await this.memberRepo.find({
      where: { group: { conversationId: groupId } },
      relations: ['user'],
    });

    await this.memberRepo.manager.transaction(async (manager) => {
      if (members.length > 0) {
        await manager.remove(GroupMember, members);
      }

      await manager.delete(ConversationParticipant, {
        conversationId: groupId,
      });
    });

    for (const member of members) {
      await this.notificationService.createAndEmit({
        userId: member.user.userId,
        type: 'group_dissolved',
        title: 'Nhóm đã bị giải tán',
        body: `Nhóm ${group.groupName} đã được giải tán.`,
        link: '/groups',
        metadata: {
          groupId,
          dissolvedBy: userId,
        },
      });
    }

    this.logger.log(`User ${userId} disbanded group ${groupId}`);

    return {
      success: true,
      message: 'Group has been disbanded',
      data: {
        groupId,
        dissolvedAt: group.dissolvedAt,
      },
    };
  }
}
