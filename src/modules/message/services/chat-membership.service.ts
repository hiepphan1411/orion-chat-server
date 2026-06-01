import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Conversation,
  ConversationType,
} from 'src/modules/conversation/entities/conversation.schema';
import { ConversationParticipant } from 'src/modules/conversation/entities/conversation-participant.entity';
import { GroupConversation } from 'src/modules/conversation/entities/group-conversation.entity';
import {
  Friendship,
  FriendshipStatus,
} from 'src/modules/friendship/entities/friendship.entity';

@Injectable()
export class ChatMembershipService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(GroupConversation)
    private readonly groupConversationRepo: Repository<GroupConversation>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {}

  async assertConversationMember(
    userId: string,
    conversationId: string,
    options?: { requireGroup?: boolean },
  ): Promise<Conversation> {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const conversation = await this.conversationRepo.findOne({
      where: { conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (options?.requireGroup && conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Conversation is not a group conversation');
    }

    if (conversation.type === ConversationType.GROUP) {
      const group = await this.groupConversationRepo.findOne({
        where: { conversationId },
      });

      if (group?.isDissolved) {
        throw new BadRequestException('GROUP_DISSOLVED');
      }
    }

    const membership = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You are not allowed to access this conversation',
      );
    }

    return conversation;
  }

  async assertConversationNotBlockedForMessaging(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.assertConversationMember(
      userId,
      conversationId,
    );

    if (conversation.type !== ConversationType.PRIVATE) {
      return;
    }

    const participants = await this.participantRepo.find({
      where: { conversationId },
      select: ['userId'],
    });
    const otherParticipant = participants.find((item) => item.userId !== userId);

    if (otherParticipant) {
      const blockedFriendship = await this.friendshipRepo.findOne({
        where: [
          {
            userOne: { userId },
            userTwo: { userId: otherParticipant.userId },
            status: FriendshipStatus.BLOCKED,
          },
          {
            userOne: { userId: otherParticipant.userId },
            userTwo: { userId },
            status: FriendshipStatus.BLOCKED,
          },
        ],
      });

      if (blockedFriendship) {
        if (blockedFriendship.blockedByUserId === userId) {
          throw new ForbiddenException(
            'You blocked this user. Unblock them to send messages.',
          );
        }
        throw new ForbiddenException(
          'You cannot send messages because this user blocked you.',
        );
      }
    }

    const blockedParticipant = await this.participantRepo.findOne({
      where: { conversationId, isBlocked: true },
    });

    if (!blockedParticipant) {
      return;
    }

    if (blockedParticipant.userId === userId) {
      throw new ForbiddenException(
        'You are blocked from sending messages in this conversation.',
      );
    }

    if (blockedParticipant.blockedBy === userId) {
      throw new ForbiddenException(
        'You blocked this user. Unblock them to send messages.',
      );
    }

    throw new ForbiddenException(
      'This conversation is blocked and cannot receive messages.',
    );
  }
}
