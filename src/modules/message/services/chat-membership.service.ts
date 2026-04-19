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

@Injectable()
export class ChatMembershipService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(GroupConversation)
    private readonly groupConversationRepo: Repository<GroupConversation>,
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
}
