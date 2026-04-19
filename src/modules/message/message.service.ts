/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageType } from 'src/common/enums/message-type.enum';
import { Message, MessageDocument } from './message.schema';
import { ChatGateway } from './chat.gateway';
import { ChatMembershipService } from './services/chat-membership.service';
import { ChatMediaService } from './services/chat-media.service';
import {
  Conversation,
  ConversationType,
} from '../conversation/entities/conversation.schema';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import {
  GroupMember,
  GroupMemberRole,
} from '../group-member/entities/group-member.entity';

const MESSAGE_ACTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly chatGateway: ChatGateway,
    private readonly chatMembershipService: ChatMembershipService,
    private readonly chatMediaService: ChatMediaService,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(GroupConversation)
    private readonly groupConversationRepo: Repository<GroupConversation>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepo: Repository<GroupMember>,
  ) {}

  private assertWithin24Hours(messageCreatedAt: Date, now = new Date()) {
    const messageMs = messageCreatedAt.getTime();
    const nowMs = now.getTime();

    if (messageMs - nowMs > CLOCK_SKEW_TOLERANCE_MS) {
      throw new BadRequestException('MESSAGE_TIMESTAMP_INVALID');
    }

    if (nowMs - messageMs > MESSAGE_ACTION_WINDOW_MS) {
      throw new BadRequestException('MESSAGE_EXPIRED');
    }
  }

  private isAdminRole(role: GroupMemberRole): boolean {
    return (
      role === GroupMemberRole.OWNER ||
      role === GroupMemberRole.ADMIN ||
      role === GroupMemberRole.CO_ADMIN
    );
  }

  async findAll(): Promise<MessageDocument[]> {
    return this.messageModel.find().exec();
  }

  async createMessage(payload: {
    conversationId: string;
    senderBy: string;
    content: string;
    messageType?: string;
    replyToMessageId?: string;
    clientMessageId?: string;
    mediaUrl?: string;
    fileName?: string;
    fileSize?: number;
  }) {
    await this.chatMembershipService.assertConversationMember(
      payload.senderBy,
      payload.conversationId,
    );

    const normalizedType = this.normalizeMessageType(payload.messageType);

    return this.messageModel.create({
      conversationId: payload.conversationId,
      senderBy: payload.senderBy,
      content: payload.content || '',
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      messageType: normalizedType,
      replyToMessageId: payload.replyToMessageId,
      clientMessageId: payload.clientMessageId,
      messageStatus: 'SENT',
    });
  }

  async revokeMessageForEveryone(payload: {
    messageId: string;
    revokedBy: string;
    conversationId?: string;
  }) {
    const message = await this.messageModel.findById(payload.messageId).lean<{
      _id: unknown;
      conversationId: string;
      senderBy: string;
      isRevoked: boolean;
    } | null>();

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (
      payload.conversationId &&
      payload.conversationId !== String(message.conversationId)
    ) {
      throw new BadRequestException(
        'messageId does not belong to conversation',
      );
    }

    await this.chatMembershipService.assertConversationMember(
      payload.revokedBy,
      String(message.conversationId),
    );

    if (String(message.senderBy) !== payload.revokedBy) {
      throw new ForbiddenException(
        'Only sender can revoke message for everyone',
      );
    }

    const fullMessage = await this.messageModel.findById(payload.messageId).exec();
    if (!fullMessage) {
      throw new NotFoundException('Message not found');
    }

    this.assertWithin24Hours(fullMessage.createdAt);

    const revokedAt = new Date();

    if (!message.isRevoked) {
      await this.messageModel.updateOne(
        { _id: payload.messageId },
        {
          $set: {
            isRevoked: true,
            revokedBy: payload.revokedBy,
            revokedAt: revokedAt,
          },
        },
      );
    }

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      revokedBy: payload.revokedBy,
      revokedAt: revokedAt.toISOString(),
      alreadyRevoked: !!message.isRevoked,
    };
  }

  async recallMessageWithin24Hours(payload: {
    messageId: string;
    userId: string;
  }) {
    const message = await this.messageModel.findById(payload.messageId).exec();
    if (!message) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      String(message.conversationId),
    );

    if (String(message.senderBy) !== payload.userId) {
      throw new ForbiddenException('FORBIDDEN');
    }

    this.assertWithin24Hours(message.createdAt);

    if (!message.isRevoked) {
      message.isRevoked = true;
      message.revokedBy = payload.userId;
      message.revokedAt = new Date();
      await message.save();
    }

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      revokedBy: payload.userId,
      revokedAt: (message.revokedAt || new Date()).toISOString(),
      recalled: true,
    };
  }

  async adminDeleteMessageWithin24Hours(payload: {
    messageId: string;
    userId: string;
  }) {
    const message = await this.messageModel.findById(payload.messageId).exec();
    if (!message) {
      throw new NotFoundException('MESSAGE_NOT_FOUND');
    }

    const conversation = await this.conversationRepo.findOne({
      where: { conversationId: String(message.conversationId) },
    });

    if (!conversation) {
      throw new NotFoundException('CONVERSATION_NOT_FOUND');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('NOT_GROUP_CONVERSATION');
    }

    const groupInfo = await this.groupConversationRepo.findOne({
      where: { conversationId: conversation.conversationId },
    });
    if (!groupInfo) {
      throw new NotFoundException('GROUP_NOT_FOUND');
    }
    if (groupInfo.isDissolved) {
      throw new BadRequestException('GROUP_DISSOLVED');
    }

    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      conversation.conversationId,
    );

    const actorMembership = await this.groupMemberRepo.findOne({
      where: {
        group: { conversationId: conversation.conversationId },
        user: { userId: payload.userId },
      },
      relations: ['group', 'user'],
    });

    if (!actorMembership || !this.isAdminRole(actorMembership.role)) {
      throw new ForbiddenException('FORBIDDEN');
    }

    if (String(message.senderBy) === payload.userId) {
      throw new BadRequestException('USE_RECALL_FOR_OWN_MESSAGE');
    }

    this.assertWithin24Hours(message.createdAt);

    if (!message.deletedByAdmin) {
      message.deletedByAdmin = true;
      message.adminDeletedBy = payload.userId;
      message.adminDeletedAt = new Date();
      await message.save();
    }

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      deletedBy: payload.userId,
      deletedAt: (message.adminDeletedAt || new Date()).toISOString(),
      deletedByAdmin: true,
    };
  }

  async reactToMessage(payload: {
    messageId: string;
    userId: string;
    emoji: string;
    conversationId?: string;
  }) {
    const emoji = (payload.emoji || '').trim();
    if (!emoji) {
      throw new BadRequestException('emoji is required');
    }

    const message = await this.messageModel.findById(payload.messageId).exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (
      payload.conversationId &&
      payload.conversationId !== String(message.conversationId)
    ) {
      throw new BadRequestException(
        'messageId does not belong to conversation',
      );
    }

    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      String(message.conversationId),
    );

    if (message.isDeleted) {
      throw new BadRequestException('Cannot react to revoked message');
    }

    const currentReactions = Array.isArray(message.reactions)
      ? message.reactions.filter((r) => r.userId !== payload.userId)
      : [];

    currentReactions.push({
      userId: payload.userId,
      emoji,
      reactedAt: new Date(),
    });

    message.reactions = currentReactions;
    await message.save();

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      reaction: {
        userId: payload.userId,
        emoji,
      },
      reactions: message.reactions,
    };
  }

  async removeReaction(payload: {
    messageId: string;
    userId: string;
    conversationId?: string;
  }) {
    const message = await this.messageModel.findById(payload.messageId).exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (
      payload.conversationId &&
      payload.conversationId !== String(message.conversationId)
    ) {
      throw new BadRequestException(
        'messageId does not belong to conversation',
      );
    }

    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      String(message.conversationId),
    );

    const before = Array.isArray(message.reactions) ? message.reactions : [];
    message.reactions = before.filter((r) => r.userId !== payload.userId);
    await message.save();

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      removed: before.length !== message.reactions.length,
      reactions: message.reactions,
    };
  }

  async deleteMessageForMe(payload: {
    messageId: string;
    userId: string;
    conversationId?: string;
  }) {
    const message = await this.messageModel.findById(payload.messageId).lean<{
      _id: unknown;
      conversationId: string;
      deletedForUsers?: string[];
    } | null>();

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (
      payload.conversationId &&
      payload.conversationId !== String(message.conversationId)
    ) {
      throw new BadRequestException(
        'messageId does not belong to conversation',
      );
    }

    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      String(message.conversationId),
    );

    await this.messageModel.updateOne(
      { _id: payload.messageId },
      { $addToSet: { deletedForUsers: payload.userId } },
    );

    this.chatGateway.emitMessageDeleted({
      conversationId: String(message.conversationId),
      messageId: String(payload.messageId),
      deletedBy: payload.userId,
    });

    const alreadyDeletedForMe =
      Array.isArray(message.deletedForUsers) &&
      message.deletedForUsers.includes(payload.userId);

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      deletedBy: payload.userId,
      deletedAt: new Date().toISOString(),
      alreadyDeletedForMe,
    };
  }

  async forwardMessage(payload: {
    sourceMessageId: string;
    targetConversationId: string;
    forwardedBy: string;
    clientMessageId?: string;
    content?: string;
  }) {
    const source = await this.messageModel
      .findById(payload.sourceMessageId)
      .lean<{
        _id: unknown;
        isDeleted: boolean;
        messageType?: MessageType;
        content?: string;
        mediaUrl?: string;
        fileName?: string;
        fileSize?: number;
        replyToMessageId?: string;
      } | null>();

    if (!source) {
      throw new NotFoundException('Source message not found');
    }

    if (source.isDeleted) {
      throw new BadRequestException('Cannot forward revoked message');
    }

    await this.chatMembershipService.assertConversationMember(
      payload.forwardedBy,
      payload.targetConversationId,
    );

    const sourceConversationId = String(
      (source as { conversationId?: string }).conversationId || '',
    );
    if (sourceConversationId) {
      await this.chatMembershipService.assertConversationMember(
        payload.forwardedBy,
        sourceConversationId,
      );
    }

    const created = await this.messageModel.create({
      conversationId: payload.targetConversationId,
      senderBy: payload.forwardedBy,
      content:
        typeof payload.content === 'string' ? payload.content : source.content,
      mediaUrl: source.mediaUrl,
      fileName: source.fileName,
      fileSize: source.fileSize,
      messageType: source.messageType || MessageType.TEXT,
      messageStatus: 'SENT',
      clientMessageId: payload.clientMessageId,
      replyToMessageId: undefined,
      forwardedFromMessageId: String(source._id),
    });

    return {
      messageId: String(created._id),
      conversationId: created.conversationId,
      forwardedFromMessageId: String(source._id),
      forwardedBy: payload.forwardedBy,
      createdAt: created.get('createdAt') as Date | undefined,
      content: created.content,
      messageType: created.messageType,
      clientMessageId: created.clientMessageId,
    };
  }

  async sendFileMessage(payload: {
    conversationId: string;
    senderBy: string;
    mediaUrl: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    preferredMessageType?: string;
    clientMessageId?: string;
    replyToMessageId?: string;
    content?: string;
  }) {
    await this.chatMembershipService.assertConversationMember(
      payload.senderBy,
      payload.conversationId,
    );

    const metadata = this.chatMediaService.buildMediaMetadata({
      mediaUrl: payload.mediaUrl,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      mimeType: String(payload.mimeType || 'application/octet-stream'),
      preferredMessageType: payload.preferredMessageType,
    });

    return this.messageModel.create({
      conversationId: payload.conversationId,
      senderBy: payload.senderBy,
      content: payload.content || '',
      mediaUrl: metadata.mediaUrl,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      mimeType: metadata.mimeType,
      fileExtension: metadata.fileExtension,
      fileCategory: metadata.fileCategory,
      fileIcon: metadata.fileIcon,
      messageType: metadata.messageType,
      replyToMessageId: payload.replyToMessageId,
      clientMessageId: payload.clientMessageId,
      messageStatus: 'SENT',
    });
  }

  async sendMediaBatch(payload: {
    conversationId: string;
    senderBy: string;
    files: Array<{
      mediaUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      preferredMessageType?: string;
      clientMessageId?: string;
      replyToMessageId?: string;
      content?: string;
    }>;
  }) {
    await this.chatMembershipService.assertConversationMember(
      payload.senderBy,
      payload.conversationId,
    );

    const docs = payload.files.map((file) => {
      const metadata = this.chatMediaService.buildMediaMetadata({
        mediaUrl: file.mediaUrl,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        preferredMessageType: file.preferredMessageType,
      });

      return {
        conversationId: payload.conversationId,
        senderBy: payload.senderBy,
        content: file.content || '',
        mediaUrl: metadata.mediaUrl,
        fileName: metadata.fileName,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        fileExtension: metadata.fileExtension,
        fileCategory: metadata.fileCategory,
        fileIcon: metadata.fileIcon,
        messageType: metadata.messageType,
        replyToMessageId: file.replyToMessageId,
        clientMessageId: file.clientMessageId,
        messageStatus: 'SENT',
      };
    });

    return this.messageModel.insertMany(docs, { ordered: true });
  }

  private normalizeFileMessageType(mimeType?: string): MessageType {
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime.startsWith('image/')) return MessageType.IMAGE;
    if (normalizedMime.startsWith('video/')) return MessageType.VIDEO;
    if (normalizedMime.startsWith('audio/')) return MessageType.AUDIO;
    return MessageType.FILE;
  }

  private normalizeMessageType(messageType?: string): MessageType {
    const normalized = String(messageType || MessageType.TEXT).toUpperCase();

    switch (normalized) {
      case MessageType.TEXT:
        return MessageType.TEXT;
      case MessageType.IMAGE:
        return MessageType.IMAGE;
      case MessageType.FILE:
        return MessageType.FILE;
      case MessageType.VIDEO:
        return MessageType.VIDEO;
      case MessageType.AUDIO:
        return MessageType.AUDIO;
      case MessageType.CALL:
        return 'CALL' as MessageType;
      case MessageType.VOICE_MESSAGE:
        return MessageType.VOICE_MESSAGE;
      case MessageType.STICKER:
        return MessageType.STICKER;
      default:
        return MessageType.TEXT;
    }
  }

  async getByConversation(conversationId: string, cursor?: string, limit = 30) {
    const pageSize = Math.min(Math.max(limit, 1), 100);
    const cursorDate = cursor ? new Date(cursor) : null;

    const flatFilter: {
      conversationId: string;
      isDeleted: boolean;
      createdAt?: { $lt: Date };
    } = {
      conversationId,
      isDeleted: false,
    };

    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      flatFilter.createdAt = { $lt: cursorDate };
    }

    const flatItems = await this.messageModel
      .find(flatFilter)
      .sort({ createdAt: -1 })
      .limit(pageSize * 2)
      .lean<Record<string, unknown>[]>();

    const nestedPipeline: PipelineStage[] = [
      {
        $match: {
          messages: { $exists: true, $type: 'array' },
        },
      },
      { $unwind: '$messages' },
      {
        $match: {
          'messages.conversationId': conversationId,
          'messages.isDeleted': false,
        },
      },
    ];

    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      nestedPipeline.push(
        { $addFields: { _msgCreatedAt: { $toDate: '$messages.createdAt' } } },
        { $match: { _msgCreatedAt: { $lt: cursorDate } } },
      );
    }

    nestedPipeline.push(
      { $sort: { 'messages.createdAt': -1 } },
      { $limit: pageSize * 2 },
      { $replaceRoot: { newRoot: '$messages' } },
    );

    const nestedItems = await this.messageModel
      .aggregate<Record<string, unknown>>(nestedPipeline)
      .exec();

    const merged = [...flatItems, ...nestedItems].sort((a, b) => {
      const aTime = new Date(String(a.createdAt || 0)).getTime();
      const bTime = new Date(String(b.createdAt || 0)).getTime();
      return bTime - aTime;
    });

    const seen = new Set<string>();
    const deduped: Record<string, unknown>[] = [];

    for (const item of merged) {
      const key =
        String(item.clientMessageId || '') ||
        `${String(item.senderBy || '')}-${String(item.createdAt || '')}-${String(item.content || '')}`;

      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length === pageSize) break;
    }

    const lastItem = deduped[deduped.length - 1];
    const nextCursor =
      deduped.length === pageSize && lastItem?.createdAt
        ? new Date(String(lastItem.createdAt)).toISOString()
        : null;

    return { items: deduped, nextCursor };
  }

  async getConversationMedia(payload: {
    conversationId: string;
    userId: string;
    cursor?: string;
    limit?: number;
  }) {
    await this.chatMembershipService.assertConversationMember(
      payload.userId,
      payload.conversationId,
    );

    const pageSize = Math.min(Math.max(payload.limit || 30, 1), 100);
    const cursorDate = payload.cursor ? new Date(payload.cursor) : null;

    const filter: {
      conversationId: string;
      isDeleted: boolean;
      messageType: { $in: MessageType[] };
      createdAt?: { $lt: Date };
      deletedForUsers: { $ne: string };
    } = {
      conversationId: payload.conversationId,
      isDeleted: false,
      messageType: {
        $in: [
          MessageType.IMAGE,
          MessageType.VIDEO,
          MessageType.AUDIO,
          MessageType.FILE,
        ],
      },
      deletedForUsers: { $ne: payload.userId },
    };

    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      filter.createdAt = { $lt: cursorDate };
    }

    const items = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .lean<
        Array<{
          _id: unknown;
          conversationId: string;
          senderBy: string;
          mediaUrl?: string;
          fileName?: string;
          fileSize?: number;
          mimeType?: string;
          messageType: MessageType;
          createdAt: Date;
        }>
      >();

    const nextCursor =
      items.length === pageSize
        ? new Date(items[items.length - 1].createdAt).toISOString()
        : null;

    return {
      conversationId: payload.conversationId,
      items: items.map((item) => ({
        messageId: String(item._id),
        conversationId: item.conversationId,
        senderBy: item.senderBy,
        mediaUrl: item.mediaUrl,
        fileName: item.fileName,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        messageType: item.messageType,
        createdAt: item.createdAt,
      })),
      nextCursor,
    };
  }
}
