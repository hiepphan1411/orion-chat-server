/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { Injectable } from '@nestjs/common';
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
