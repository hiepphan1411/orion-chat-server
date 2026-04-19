import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Conversation } from '../conversation/entities/conversation.schema';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group-member/entities/group-member.entity';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { ParticipantRole } from '../conversation/entities/conversation-participant.entity';
import { User } from '../users/entities/user.entity';

const GROUP_MEMBER_LIMIT = 10;

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(GroupConversation)
    private readonly groupRepo: Repository<GroupConversation>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private isAdminRole(role: GroupMemberRole): boolean {
    return (
      role === GroupMemberRole.OWNER ||
      role === GroupMemberRole.ADMIN ||
      role === GroupMemberRole.CO_ADMIN
    );
  }

  private mapRoleForClient(
    role: GroupMemberRole,
  ): 'admin' | 'co-admin' | 'member' {
    if (role === GroupMemberRole.CO_ADMIN) return 'co-admin';
    if (role === GroupMemberRole.OWNER || role === GroupMemberRole.ADMIN) {
      return 'admin';
    }
    return 'member';
  }

  private async requireGroupMembership(groupId: string, userId: string) {
    const membership = await this.groupMemberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId },
      },
      relations: ['group', 'user'],
    });

    if (!membership) {
      throw new ForbiddenException('MEMBER_NOT_FOUND');
    }

    if (membership.group.isDissolved) {
      throw new BadRequestException('GROUP_DISSOLVED');
    }

    return membership;
  }

  async getMembers(groupId: string, userId: string) {
    await this.requireGroupMembership(groupId, userId);

    const members = await this.groupMemberRepo.find({
      where: { group: { conversationId: groupId } },
      relations: ['user', 'group'],
      order: { joinedAt: 'ASC' },
    });

    return {
      groupId,
      items: members.map((m) => ({
        userId: m.user.userId,
        fullName: m.user.fullName,
        avatarUrl: m.user.avatarUrl,
        role: this.mapRoleForClient(m.role),
        joinedAt: m.joinedAt,
        isMe: m.user.userId === userId,
      })),
    };
  }

  async addMembers(groupId: string, actorUserId: string, userIds: string[]) {
    const actor = await this.requireGroupMembership(groupId, actorUserId);

    if (!this.isAdminRole(actor.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const normalizedIds = [...new Set((userIds || []).filter(Boolean))]
      .map((id) => String(id).trim())
      .filter((id) => id !== actorUserId);

    if (normalizedIds.length === 0) {
      throw new BadRequestException('NO_VALID_MEMBER_TO_ADD');
    }

    const users = await this.userRepo.find({
      where: { userId: In(normalizedIds) },
    });

    if (users.length !== normalizedIds.length) {
      throw new NotFoundException('MEMBER_NOT_FOUND');
    }

    const existingMembers = await this.groupMemberRepo.find({
      where: {
        group: { conversationId: groupId },
        user: { userId: In(normalizedIds) },
      },
      relations: ['user'],
    });

    const existingSet = new Set(existingMembers.map((m) => m.user.userId));
    const idsToAdd = normalizedIds.filter((id) => !existingSet.has(id));

    if (idsToAdd.length === 0) {
      return {
        groupId,
        addedUserIds: [],
        skippedUserIds: normalizedIds,
        addedCount: 0,
        addedAt: new Date().toISOString(),
      };
    }

    const currentMemberCount = await this.groupMemberRepo.count({
      where: { group: { conversationId: groupId } },
    });

    if (currentMemberCount + idsToAdd.length > GROUP_MEMBER_LIMIT) {
      throw new BadRequestException(
        `Group member limit reached (${GROUP_MEMBER_LIMIT})`,
      );
    }

    await this.groupMemberRepo.manager.transaction(async (manager) => {
      const groupMembers = idsToAdd.map((userId) =>
        manager.create(GroupMember, {
          group: { conversationId: groupId },
          user: { userId },
          role: GroupMemberRole.MEMBER,
          nickname: null,
        }),
      );

      const participants = idsToAdd.map((userId) =>
        manager.create(ConversationParticipant, {
          conversationId: groupId,
          userId,
          role: ParticipantRole.MEMBER,
        }),
      );

      await manager.save(GroupMember, groupMembers);
      await manager.save(ConversationParticipant, participants);
    });

    return {
      groupId,
      addedUserIds: idsToAdd,
      skippedUserIds: normalizedIds.filter((id) => !idsToAdd.includes(id)),
      addedCount: idsToAdd.length,
      addedAt: new Date().toISOString(),
    };
  }

  async transferAdmin(
    groupId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    const actor = await this.requireGroupMembership(groupId, actorUserId);

    if (!this.isAdminRole(actor.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestException('TARGET_USER_INVALID');
    }

    const target = await this.groupMemberRepo.findOne({
      where: {
        group: { conversationId: groupId },
        user: { userId: targetUserId },
      },
      relations: ['group', 'user'],
    });

    if (!target) {
      throw new NotFoundException('MEMBER_NOT_FOUND');
    }

    await this.groupMemberRepo.manager.transaction(async (manager) => {
      await manager.update(
        GroupConversation,
        { conversationId: groupId },
        { ownerId: targetUserId },
      );

      await manager.update(
        GroupMember,
        { id: actor.id },
        { role: GroupMemberRole.MEMBER },
      );
      await manager.update(
        GroupMember,
        { id: target.id },
        { role: GroupMemberRole.OWNER },
      );

      await manager.update(
        ConversationParticipant,
        { conversationId: groupId, userId: actorUserId },
        { role: ParticipantRole.MEMBER },
      );
      await manager.update(
        ConversationParticipant,
        { conversationId: groupId, userId: targetUserId },
        { role: ParticipantRole.ADMIN },
      );
    });

    return {
      groupId,
      oldAdminUserId: actorUserId,
      newAdminUserId: targetUserId,
      transferredAt: new Date().toISOString(),
    };
  }

  async leaveGroup(
    groupId: string,
    actorUserId: string,
    newAdminUserId?: string,
  ) {
    const actor = await this.requireGroupMembership(groupId, actorUserId);

    const members = await this.groupMemberRepo.find({
      where: { group: { conversationId: groupId } },
      relations: ['user'],
    });

    const remainingMembers = members.filter(
      (m) => m.user.userId !== actorUserId,
    );

    if (this.isAdminRole(actor.role) && remainingMembers.length > 0) {
      if (!newAdminUserId) {
        throw new BadRequestException('ADMIN_TRANSFER_REQUIRED');
      }

      const exists = remainingMembers.some(
        (m) => m.user.userId === newAdminUserId,
      );
      if (!exists) {
        throw new NotFoundException('MEMBER_NOT_FOUND');
      }

      await this.transferAdmin(groupId, actorUserId, newAdminUserId);
    }

    await this.groupMemberRepo.manager.transaction(async (manager) => {
      await manager.delete(GroupMember, { id: actor.id });

      await manager.delete(ConversationParticipant, {
        conversationId: groupId,
        userId: actorUserId,
      });

      if (remainingMembers.length === 0) {
        await manager.delete(GroupConversation, { conversationId: groupId });
        await manager.delete(Conversation, { conversationId: groupId });
      }
    });

    return {
      groupId,
      leftUserId: actorUserId,
      leftAt: new Date().toISOString(),
      groupDeleted: remainingMembers.length === 0,
    };
  }

  async updateAutoDelete(
    groupId: string,
    actorUserId: string,
    autoDeleteDuration: number,
  ) {
    const actor = await this.requireGroupMembership(groupId, actorUserId);

    if (!this.isAdminRole(actor.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    await this.conversationRepo.update(
      { conversationId: groupId },
      { autoDeleteDuration },
    );

    return {
      groupId,
      autoDeleteDuration,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  async dissolveGroup(groupId: string, actorUserId: string) {
    const actor = await this.requireGroupMembership(groupId, actorUserId);

    if (!this.isAdminRole(actor.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    await this.groupRepo.update(
      { conversationId: groupId },
      {
        isDissolved: true,
        dissolvedAt: new Date(),
        dissolvedBy: actorUserId,
      },
    );

    return {
      groupId,
      dissolvedBy: actorUserId,
      dissolvedAt: new Date().toISOString(),
      status: 'dissolved',
    };
  }
}
