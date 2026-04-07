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
import { MessageType } from 'src/common/enums/message-type.enum';
import { Message, MessageDocument } from './message.schema';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

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
      isDeleted: boolean;
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

    if (String(message.senderBy) !== payload.revokedBy) {
      throw new ForbiddenException(
        'Only sender can revoke message for everyone',
      );
    }

    if (!message.isDeleted) {
      await this.messageModel.updateOne(
        { _id: payload.messageId },
        {
          $set: {
            isDeleted: true,
            content: '',
          },
          $unset: {
            mediaUrl: '',
            fileName: '',
            fileSize: '',
            replyToMessageId: '',
          },
        },
      );
    }

    return {
      messageId: String(message._id),
      conversationId: String(message.conversationId),
      revokedBy: payload.revokedBy,
      revokedAt: new Date().toISOString(),
      alreadyRevoked: !!message.isDeleted,
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

    await this.messageModel.updateOne(
      { _id: payload.messageId },
      { $addToSet: { deletedForUsers: payload.userId } },
    );

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
    clientMessageId?: string;
    replyToMessageId?: string;
    content?: string;
  }) {
    const normalizedType = this.normalizeFileMessageType(payload.mimeType);

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
}
