import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose'; // Thêm Mongoose
import { Model, PipelineStage } from 'mongoose';
import { Repository } from 'typeorm';
import { MessageType } from 'src/common/enums/message-type.enum';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message, MessageDocument } from '../message/message.schema'; // Import schema Mongo
import { User } from '../users/entities/user.entity';

type MessageDetail = {
  content?: string;
  senderBy?: string;
  senderName?: string;
  senderAvatar?: string;
  conversationId?: string;
  clientMessageId?: string;
  messageType?: string;
  messageStatus?: string;
  isPinned?: boolean;
  isDeleted?: boolean;
  replyToMessageId?: string | null;
  seenBy?: Array<{ userId: string; seenAt: Date | string }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
};

type LastMessageAggregateRow = {
  _id: string;
  lastMessage: MessageDetail;
};

type ConversationMessagesResult = {
  conversationId: string;
  items: MessageDetail[];
  nextCursor: string | null;
};

type CreateConversationMessagePayload = {
  senderBy: string;
  content: string;
  messageType?: string;
  replyToMessageId?: string;
  clientMessageId?: string;
};

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  async findAllByUserId(userId: string) {
    const memberships = await this.participantRepo.find({
      where: { userId },
      relations: [
        'conversation',
        'conversation.groupInfo',
        'conversation.participants',
        'conversation.participants.user',
      ],
      order: { conversation: { createdAt: 'DESC' } },
    });

    if (memberships.length === 0) return [];

    const conversationIds = memberships.map(
      (m) => m.conversation.conversationId,
    );

    const messageMap = await this.getLastMessageMap(conversationIds, userId);

    return memberships.map((m) => {
      const convId = m.conversation.conversationId;
      const latestMsg = messageMap.get(convId);

      return this.toConversationView(m, latestMsg ?? null);
    });
  }

  async findDetailById(conversationId: string, userId: string) {
    const membership = await this.requireMembership(conversationId, userId);

    const lastMessageArr = await this.fetchConversationMessages(
      conversationId,
      undefined,
      1,
      userId,
    );

    const latestMsg = lastMessageArr.length > 0 ? lastMessageArr[0] : null;
    return this.toConversationView(membership, latestMsg);
  }

  async getMessagesByConversation(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit = 30,
  ): Promise<ConversationMessagesResult> {
    await this.requireMembership(conversationId, userId);

    const pageSize = Math.min(Math.max(limit, 1), 100);
    const items = await this.fetchConversationMessages(
      conversationId,
      cursor,
      pageSize,
      userId,
    );

    const lastItem = items[items.length - 1];
    const nextCursor =
      items.length === pageSize && this.toDate(lastItem?.createdAt)
        ? this.toDate(lastItem?.createdAt)!.toISOString()
        : null;

    return {
      conversationId,
      items,
      nextCursor,
    };
  }

  async createMessageInConversation(
    conversationId: string,
    actorUserId: string,
    payload: CreateConversationMessagePayload,
  ): Promise<MessageDocument> {
    await this.requireMembership(conversationId, actorUserId);

    if (payload.senderBy !== actorUserId) {
      throw new ForbiddenException('senderBy must match userId');
    }

    const normalizedType = this.normalizeMessageType(payload.messageType);

    return this.messageModel.create({
      conversationId,
      senderBy: payload.senderBy,
      content: payload.content,
      messageType: normalizedType,
      replyToMessageId: payload.replyToMessageId,
      clientMessageId: payload.clientMessageId,
      messageStatus: 'SENT',
    });
  }

  private normalizeMessageType(messageType?: string): MessageType {
    const normalized = String(messageType || MessageType.TEXT).toUpperCase();

    const values = Object.values(MessageType) as string[];
    if (values.includes(normalized)) {
      return normalized as MessageType;
    }

    return MessageType.TEXT;
  }

  private async requireMembership(conversationId: string, userId: string) {
    const membership = await this.participantRepo.findOne({
      where: { conversationId, userId },
      relations: [
        'conversation',
        'conversation.groupInfo',
        'conversation.participants',
        'conversation.participants.user',
      ],
    });

    if (membership) {
      return membership;
    }

    const exists = await this.participantRepo.findOne({
      where: { conversationId },
    });

    if (!exists) {
      throw new NotFoundException('Conversation not found');
    }

    throw new ForbiddenException(
      'You are not a participant of this conversation',
    );
  }

  private async getLastMessageMap(conversationIds: string[], userId?: string) {
    const flatLastMessages = await this.messageModel
      .aggregate<LastMessageAggregateRow>([
        {
          $match: {
            conversationId: { $in: conversationIds },
            isDeleted: false,
            ...(userId ? { deletedForUsers: { $ne: userId } } : {}),
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$conversationId',
            lastMessage: { $first: '$$ROOT' },
          },
        },
      ])
      .exec();

    const nestedLastMessages = await this.messageModel
      .aggregate<LastMessageAggregateRow>([
        {
          $match: {
            messages: { $exists: true, $type: 'array' },
          },
        },
        { $unwind: '$messages' },
        {
          $match: {
            'messages.conversationId': { $in: conversationIds },
            'messages.isDeleted': false,
            ...(userId ? { 'messages.deletedForUsers': { $ne: userId } } : {}),
          },
        },
        { $sort: { 'messages.createdAt': -1 } },
        {
          $group: {
            _id: '$messages.conversationId',
            lastMessage: { $first: '$messages' },
          },
        },
      ])
      .exec();

    const messageMap = new Map<string, MessageDetail>();

    for (const item of [...flatLastMessages, ...nestedLastMessages]) {
      const normalized = this.normalizeMessage(item.lastMessage);
      const existing = messageMap.get(item._id);

      if (!existing) {
        messageMap.set(item._id, normalized);
        continue;
      }

      const existingTime = this.toDate(existing.createdAt)?.getTime() ?? 0;
      const candidateTime = this.toDate(normalized.createdAt)?.getTime() ?? 0;

      if (candidateTime >= existingTime) {
        messageMap.set(item._id, normalized);
      }
    }

    return messageMap;
  }

  private async fetchConversationMessages(
    conversationId: string,
    cursor?: string,
    limit = 30,
    userId?: string,
  ): Promise<MessageDetail[]> {
    const pageSize = Math.min(Math.max(limit, 1), 100);
    const cursorDate = cursor ? new Date(cursor) : null;

    const flatFilter: {
      conversationId: string;
      isDeleted: boolean;
      deletedForUsers?: { $ne: string };
      createdAt?: { $lt: Date };
    } = {
      conversationId,
      isDeleted: false,
    };

    if (userId) {
      flatFilter.deletedForUsers = { $ne: userId };
    }

    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      flatFilter.createdAt = { $lt: cursorDate };
    }

    const flatItems = await this.messageModel
      .find(flatFilter)
      .sort({ createdAt: -1 })
      .limit(pageSize * 2)
      .lean<MessageDetail[]>();

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
          ...(userId ? { 'messages.deletedForUsers': { $ne: userId } } : {}),
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
      .aggregate<MessageDetail>(nestedPipeline)
      .exec();

    const merged = [...flatItems, ...nestedItems]
      .map((m) => this.normalizeMessage(m))
      .filter((m) => {
        if (!cursorDate || Number.isNaN(cursorDate.getTime())) {
          return true;
        }

        const createdAt = this.toDate(m.createdAt);
        return !!createdAt && createdAt < cursorDate;
      })
      .sort((a, b) => {
        const timeA = this.toDate(a.createdAt)?.getTime() ?? 0;
        const timeB = this.toDate(b.createdAt)?.getTime() ?? 0;
        return timeB - timeA;
      });

    const seen = new Set<string>();
    const deduped: MessageDetail[] = [];

    for (const item of merged) {
      const key =
        item.clientMessageId ||
        `${String(item.senderBy || '')}-${String(item.createdAt || '')}-${String(item.content || '')}`;

      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);

      if (deduped.length === pageSize) break;
    }

    // Populate sender user info (fullName, avatarUrl)
    const senderPhoneNumbers = [
      ...new Set(deduped.map((m) => m.senderBy).filter(Boolean)),
    ] as string[];

    if (senderPhoneNumbers.length > 0) {
      const users = await this.userRepo.find({
        where: senderPhoneNumbers.map((phoneNumber) => ({
          phoneNumber,
        })),
      });

      const userMap = new Map(users.map((u) => [u.phoneNumber, u]));

      deduped.forEach((msg) => {
        if (msg.senderBy && userMap.has(msg.senderBy)) {
          const user = userMap.get(msg.senderBy)!;
          msg.senderName = user.fullName;
          msg.senderAvatar = user.avatarUrl;
        }
      });
    }

    return deduped;
  }

  private normalizeMessage(message: MessageDetail): MessageDetail {
    return {
      ...message,
      createdAt: this.toDate(message.createdAt) || message.createdAt,
      updatedAt: this.toDate(message.updatedAt) || message.updatedAt,
      seenBy: Array.isArray(message.seenBy)
        ? message.seenBy.map((s) => ({
            userId: s.userId,
            seenAt: this.toDate(s.seenAt) || s.seenAt,
          }))
        : [],
    };
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private toConversationView(
    membership: ConversationParticipant,
    latestMsg: MessageDetail | null,
  ) {
    const c = membership.conversation;

    return {
      conversationId: c.conversationId,
      type: c.type,
      autoDeleteDuration: c.autoDeleteDuration,
      createdAt: c.createdAt,
      myRole: membership.role,
      myJoinedAt: membership.joinedAt,
      lastMessage: latestMsg
        ? {
            content: latestMsg.content,
            messageType: latestMsg.messageType,
            senderBy: latestMsg.senderBy,
            createdAt: latestMsg.createdAt,
            messageStatus: latestMsg.messageStatus,
          }
        : null,
      groupInfo: c.groupInfo
        ? {
            groupName: c.groupInfo.groupName,
            groupAvatar: c.groupInfo.groupAvatar,
            ownerId: c.groupInfo.ownerId,
          }
        : null,
      participants: c.participants.map((p) => ({
        userId: p.userId,
        fullName: p.user?.fullName ?? null,
        avatarUrl: p.user?.avatarUrl ?? null,
        role: p.role,
        joinedAt: p.joinedAt,
        lastReadMessageId: p.lastReadMessageId,
      })),
    };
  }
}
