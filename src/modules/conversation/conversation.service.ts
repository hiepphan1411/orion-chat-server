/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose'; // Thêm Mongoose
import { Model, PipelineStage } from 'mongoose';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { MessageType } from 'src/common/enums/message-type.enum';
import { Conversation, ConversationType } from './entities/conversation.schema';
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
  isRevoked?: boolean;
  revokedBy?: string;
  revokedAt?: Date | string;
  replyToMessageId?: string | null;
  seenBy?: Array<{ userId: string; seenAt: Date | string }>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  callData?: {
    callType?: 'audio' | 'video';
    callStatus?: 'completed' | 'missed' | 'declined';
    duration?: number;
    isInitiator?: boolean;
    wasRejected?: boolean;
  } | null;
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

type ConversationView = {
  conversationId: string;
  type: string;
  autoDeleteDuration: number;
  createdAt: Date;
  myRole: string;
  myJoinedAt: Date;
  myIsHidden: boolean;
  myIsBlocked?: boolean;
  myBlockedAt?: Date | null;
  myBlockedBy?: string | null;
  lastMessage: {
    content?: string;
    messageType?: string;
    senderBy?: string;
    createdAt?: Date | string;
    messageStatus?: string;
  } | null;
  groupInfo: {
    groupName: string;
    groupAvatar?: string;
    ownerId: string;
  } | null;
  blockStatus: {
    isBlocked: boolean;
    blockedUserId: string | null;
    blockedBy: string | null;
    blockedAt: Date | null;
  };
  canUnblock?: boolean;
  participants: Array<{
    userId: string;
    fullName: string | null;
    avatarUrl: string | null;
    role: any;
    joinedAt: Date;
    lastReadMessageId: string | null;
    isHidden: boolean;
    isBlocked: boolean;
    blockedAt: Date | null;
    blockedBy: string | null;
  }>;
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
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
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
      order: {
        isPinned: 'DESC',
        pinnedAt: 'DESC',
        conversation: { createdAt: 'DESC' },
      },
    });

    if (memberships.length === 0) return [];

    const conversationIds = memberships.map(
      (m) => m.conversation.conversationId,
    );

    const messageMap = await this.getLastMessageMap(conversationIds, userId);

    // ✅ Lấy block status của từng conversation
    const blockStatusMap = new Map<
      string,
      {
        isBlocked: boolean;
        blockedUserId: string | null;
        blockedBy: string | null;
        blockedAt: Date | null;
      }
    >();
    for (const convId of conversationIds) {
      const blockStatus = await this.getConversationBlockStatus(convId);
      blockStatusMap.set(convId, blockStatus);
    }

    return memberships.map((m) => {
      const convId = m.conversation.conversationId;
      const latestMsg = messageMap.get(convId);
      const blockStatus = blockStatusMap.get(convId);

      return this.toConversationView(m, latestMsg ?? null, blockStatus);
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

    // ✅ Lấy block status của conversation
    const blockStatus = await this.getConversationBlockStatus(conversationId);

    return this.toConversationView(membership, latestMsg, blockStatus);
  }

  /**
   * Lấy hoặc tạo PRIVATE conversation giữa current user và recipient
   * @param currentUserId ID của user hiện tại
   * @param recipientId ID của recipient
   * @returns Conversation view hoặc null nếu recipient không tồn tại
   */
  async getOrCreatePrivateConversation(
    currentUserId: string,
    recipientId: string,
  ): Promise<ConversationView | null> {
    if (!currentUserId || !recipientId) {
      throw new BadRequestException(
        'currentUserId and recipientId are required',
      );
    }

      if (currentUserId === recipientId) {
          throw new BadRequestException('Cannot create conversation with yourself');
      }

    // Validate UUIDs
    this.validateUUID(currentUserId, 'currentUserId');
    this.validateUUID(recipientId, 'recipientId');

    // Check if recipient exists
    const recipient = await this.userRepo.findOne({
      where: { userId: recipientId },
    });

    if (!recipient) {
      throw new NotFoundException(`Recipient not found: ${recipientId}`);
    }

    // Try to find existing PRIVATE conversation
    const existingConversations = await this.participantRepo.find({
      where: { userId: currentUserId },
      relations: ['conversation', 'conversation.participants'],
    });

    const existingPrivate = existingConversations.find((conv) => {
      const conversation = conv.conversation;

      // Must be PRIVATE type
      if (conversation.type !== ConversationType.PRIVATE) return false;

      // Check if other participant is recipientId
      return conversation.participants.length === 2;
    });

    if (existingPrivate) {
      // Verify the other participant is recipientId
      const otherParticipantExists = await this.participantRepo.findOne({
        where: {
          conversationId: existingPrivate.conversation.conversationId,
          userId: recipientId,
        },
      });

      if (otherParticipantExists) {
        // Return existing conversation detail
        return this.findDetailById(
          existingPrivate.conversation.conversationId,
          currentUserId,
        );
      }
    }

    // Create NEW private conversation
    const newConversation = this.conversationRepo.create({
      type: ConversationType.PRIVATE,
    });
    const savedConversation = await this.conversationRepo.save(newConversation);

    // Add participants
    await this.participantRepo.save([
      {
        conversationId: savedConversation.conversationId,
        userId: currentUserId,
      },
      {
        conversationId: savedConversation.conversationId,
        userId: recipientId,
      },
    ]);

    // Return conversation detail with block status
    const membership = await this.participantRepo.findOne({
      where: {
        conversationId: savedConversation.conversationId,
        userId: currentUserId,
      },
      relations: [
        'conversation',
        'conversation.participants',
        'conversation.participants.user',
      ],
    });

    if (!membership) {
      throw new Error('Failed to create conversation');
    }

    const blockStatus = await this.getConversationBlockStatus(
      savedConversation.conversationId,
    );

    return this.toConversationView(membership, null, blockStatus);
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
    // ✅ Verify user là member của conversation (throws nếu không phải member)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _membership = await this.requireMembership(
      conversationId,
      actorUserId,
    );

    if (payload.senderBy !== actorUserId) {
      throw new ForbiddenException('senderBy must match userId');
    }

    // ✅ Kiểm tra trạng thái chặn của conversation
    const blockStatus = await this.getConversationBlockStatus(conversationId);

    // Nếu conversation bị chặn
    if (blockStatus.isBlocked) {
      // Nếu current user là người BỊ CHẶN: không thể gửi tin nhắn
      if (blockStatus.blockedUserId === actorUserId) {
        throw new ForbiddenException(
          `You are blocked from sending messages in this conversation. Blocked by: ${blockStatus.blockedBy}`,
        );
      }

      // Nếu current user là người CHẶN: cũng không thể gửi (logic: nếu chặn thì không nên gửi)
      if (blockStatus.blockedBy === actorUserId) {
        throw new ForbiddenException(
          'You blocked this user. Unblock them to send messages.',
        );
      }
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

  private validateUUID(id: string, fieldName: string): void {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new BadRequestException(`Invalid ${fieldName}: ${id}`);
    }
  }

  private async requireMembership(conversationId: string, userId: string) {
    // Validate UUIDs before database query
    this.validateUUID(conversationId, 'conversationId');
    this.validateUUID(userId, 'userId');

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
    // Handle both UUID (new) and phoneNumber (legacy) senderBy values
    const senderIdentifiers = [
      ...new Set(deduped.map((m) => m.senderBy).filter(Boolean)),
    ] as string[];

    if (senderIdentifiers.length > 0) {
      // Separate identifiers into UUIDs and phone numbers
      // UUID format: 8-4-4-4-12 hex characters (36 chars with dashes)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuids = senderIdentifiers.filter((id) => uuidRegex.test(id));
      const phoneNumbers = senderIdentifiers.filter(
        (id) => !uuidRegex.test(id),
      );

      const userMap = new Map<string, User>();

      // Query users by UUID (new format)
      if (uuids.length > 0) {
        const usersByUuid = await this.userRepo.find({
          where: { userId: In(uuids) },
        });
        usersByUuid.forEach((u) => {
          userMap.set(u.userId, u);
        });
      }

      // Query users by phoneNumber (legacy format)
      if (phoneNumbers.length > 0) {
        const usersByPhone = await this.userRepo.find({
          where: { phoneNumber: In(phoneNumbers) },
        });
        usersByPhone.forEach((user) => {
          userMap.set(user.phoneNumber, user);
          userMap.set(user.userId, user); // Also add UUID key for consistency
        });
      }

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

  /**
   * Lấy trạng thái chặn của conversation (kiểm tra tất cả participants)
   * Trả về: ai bị chặn, ai là người chặn
   */
  private async getConversationBlockStatus(conversationId: string) {
    // Query tất cả participants của conversation
    const participants = await this.participantRepo.find({
      where: { conversationId },
    });

    // Tìm participant nào có isBlocked = true
    const blockedParticipant = participants.find((p) => p.isBlocked);

    if (blockedParticipant) {
      return {
        isBlocked: true,
        blockedUserId: blockedParticipant.userId,
        blockedBy: blockedParticipant.blockedBy,
        blockedAt: blockedParticipant.blockedAt,
      };
    }

    return {
      isBlocked: false,
      blockedUserId: null,
      blockedBy: null,
      blockedAt: null,
    };
  }

  private toConversationView(
    membership: ConversationParticipant,
    latestMsg: MessageDetail | null,
    blockStatus?: {
      isBlocked: boolean;
      blockedUserId: string | null;
      blockedBy: string | null;
      blockedAt: Date | null;
    },
  ) {
    const c = membership.conversation;

    return {
      conversationId: c.conversationId,
      type: c.type,
      autoDeleteDuration: c.autoDeleteDuration,
      createdAt: c.createdAt,
      myRole: membership.role,
      myJoinedAt: membership.joinedAt,
      // ✅ Security status của current user
      myIsHidden: membership.isHidden,
      myIsBlocked:
        blockStatus?.isBlocked &&
        blockStatus?.blockedUserId === membership.userId,
      myBlockedAt:
        blockStatus?.isBlocked &&
        blockStatus?.blockedUserId === membership.userId
          ? blockStatus?.blockedAt
          : null,
      myBlockedBy:
        blockStatus?.isBlocked &&
        blockStatus?.blockedUserId === membership.userId
          ? blockStatus?.blockedBy
          : null,
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
      // ✅ Trạng thái CHẶN của cuộc hội thoại (ai chặn ai)
      blockStatus: blockStatus || {
        isBlocked: false,
        blockedUserId: null,
        blockedBy: null,
        blockedAt: null,
      },
      // ✅ Current user có thể bỏ chặn không (chỉ người chặn mới có thể bỏ chặn)
      canUnblock:
        blockStatus?.isBlocked && blockStatus?.blockedBy === membership.userId,
      // ==================== Pin Status ====================
      myIsPinned: membership.isPinned,
      myPinnedAt: membership.pinnedAt,
      // Danh sách participants
      participants: c.participants.map((p) => ({
        userId: p.userId,
        fullName: p.user?.fullName ?? null,
        avatarUrl: p.user?.avatarUrl ?? null,
        role: p.role,
        joinedAt: p.joinedAt,
        lastReadMessageId: p.lastReadMessageId,
        isHidden: p.isHidden,
        // ✅ Block status của participant khác
        isBlocked: p.isBlocked,
        blockedAt: p.blockedAt,
        blockedBy: p.blockedBy,
      })),
    };
  }

  // ==================== SECURITY FEATURES ====================

  /**
   * Cập nhật thời gian tự xóa tin nhắn cho conversation
   * @param conversationId ID của conversation
   * @param userId ID của user hiện tại (verify membership)
   * @param autoDeleteDuration Số ngày (0 = không tự xóa)
   */
  async updateAutoDeleteDuration(
    conversationId: string,
    userId: string,
    autoDeleteDuration: number,
  ) {
    // Verify user là thành viên của conversation
    await this.requireMembership(conversationId, userId);

    // Cập nhật autoDeleteDuration trong Conversation entity
    await this.conversationRepo.update(
      { conversationId },
      { autoDeleteDuration },
    );

    return {
      success: true,
      conversationId,
      autoDeleteDuration,
      message: 'Auto delete duration updated successfully',
    };
  }

  /**
   * Ẩn conversation bằng mật khẩu
   */
  async hideConversation(
    conversationId: string,
    userId: string,
    password: string,
  ) {
    const membership = await this.requireMembership(conversationId, userId);

    if (!membership) {
      throw new ForbiddenException('User is not a member of this conversation');
    }

    // Hash mật khẩu bằng bcrypt (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Cập nhật vào database
    await this.participantRepo.update(
      { conversationId, userId },
      { isHidden: true, hidePasswordHash: hashedPassword },
    );

    return {
      success: true,
      conversationId,
      message: 'Conversation hidden successfully',
    };
  }

  /**
   * Tiết lộ conversation bị ẩn bằng mật khẩu
   */
  async revealConversation(
    conversationId: string,
    userId: string,
    password: string,
  ) {
    const membership = await this.requireMembership(conversationId, userId);

    if (!membership) {
      throw new ForbiddenException('User is not a member of this conversation');
    }

    if (!membership.isHidden) {
      throw new BadRequestException('This conversation is not hidden');
    }

    // Verify mật khẩu
    const isPasswordValid = await bcrypt.compare(
      password,
      membership.hidePasswordHash || '',
    );

    if (!isPasswordValid) {
      throw new ForbiddenException('Invalid password');
    }

    // Cập nhật vào database
    await this.participantRepo.update(
      { conversationId, userId },
      { isHidden: false, hidePasswordHash: null },
    );

    return {
      success: true,
      conversationId,
      message: 'Conversation revealed successfully',
    };
  }

  /**
   * Xóa toàn bộ lịch sử chat cho user hiện tại (soft delete)
   * Logic: Thêm userId vào deletedForUsers của tất cả message trong conversation
   */
  async clearChatHistory(conversationId: string, userId: string) {
    const membership = await this.requireMembership(conversationId, userId);

    if (!membership) {
      throw new ForbiddenException('User is not a member of this conversation');
    }

    // Update tất cả message của conversation: thêm userId vào deletedForUsers
    const result = await this.messageModel.updateMany(
      { conversationId },
      {
        $addToSet: { deletedForUsers: userId }, // Add user to deletedForUsers array (nếu chưa có)
      },
    );

    return {
      success: true,
      conversationId,
      deletedMessagesCount: result.modifiedCount,
      message: 'Chat history cleared successfully',
    };
  }

  /**
   * Xác minh mật khẩu của conversation bị ẩn
   * @returns true nếu mật khẩu đúng
   */
  async verifyHiddenConversationPassword(
    conversationId: string,
    userId: string,
    password: string,
  ): Promise<boolean> {
    const membership = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });

    if (!membership || !membership.isHidden) {
      return false;
    }

    return bcrypt.compare(password, membership.hidePasswordHash || '');
  }

  /**
   * Kiểm tra xem user có bị chặn trong conversation không
   */
  async isUserBlocked(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const membership = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });

    return membership?.isBlocked ?? false;
  }

  /**
   * Lấy chi tiết về trạng thái block (ai block ai)
   */
  async getBlockDetails(
    conversationId: string,
    userId: string,
  ): Promise<{
    isBlocked: boolean;
    blockedBy?: string | null;
    blockedAt?: Date | null;
  }> {
    const membership = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });

    return {
      isBlocked: membership?.isBlocked ?? false,
      blockedBy: membership?.blockedBy,
      blockedAt: membership?.blockedAt,
    };
  }

  /**
   * Chặn người dùng kia trong PRIVATE conversation
   * Tự động lấy người kia từ danh sách participants
   *
   * @param conversationId ID của conversation
   * @param requesterId ID của người yêu cầu chặn
   */
  async blockUserInConversation(conversationId: string, requesterId: string) {
    // Verify membership và lấy conversation detail
    const membership = await this.requireMembership(
      conversationId,
      requesterId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Verify conversation là PRIVATE (chỉ áp dụng cho 1:1 chat)
    const conversation = membership.conversation;
    if (conversation.type !== ConversationType.PRIVATE) {
      throw new ForbiddenException(
        'Block feature is only available for private conversations',
      );
    }

    // Lấy người kia từ participants (PRIVATE conversation chỉ có 2 người)
    const otherUser = conversation.participants?.find(
      (p) => p.userId !== requesterId,
    );

    if (!otherUser) {
      throw new NotFoundException(
        'Other participant not found in conversation',
      );
    }

    // Gọi blockUser với targetUserId của người kia
    return this.blockUser(conversationId, requesterId, otherUser.userId);
  }

  /**
   * Bỏ chặn người dùng kia trong PRIVATE conversation
   * Tự động lấy người kia từ danh sách participants
   * Chỉ người đã chặn mới có thể bỏ chặn
   *
   * @param conversationId ID của conversation
   * @param requesterId ID của người yêu cầu bỏ chặn
   */
  async unblockUserInConversation(conversationId: string, requesterId: string) {
    // Verify membership và lấy conversation detail
    const membership = await this.requireMembership(
      conversationId,
      requesterId,
    );

    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Verify conversation là PRIVATE
    if (membership.conversation.type !== ConversationType.PRIVATE) {
      throw new ForbiddenException(
        'Unblock feature is only available for private conversations',
      );
    }

    // Lấy người kia từ participants
    const otherUser = membership.conversation.participants?.find(
      (p) => p.userId !== requesterId,
    );

    if (!otherUser) {
      throw new NotFoundException(
        'Other participant not found in conversation',
      );
    }

    // Gọi unblockUser với targetUserId của người kia
    return this.unblockUser(conversationId, requesterId, otherUser.userId);
  }

  /**
   * @param requesterId ID của người yêu cầu (must be member)
   * @param targetUserId ID của người bị chặn
   */
  async blockUser(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ) {
    const requesterMembership = await this.requireMembership(
      conversationId,
      requesterId,
    );

    if (!requesterMembership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Verify conversation là PRIVATE (chỉ áp dụng cho 1-1 chat)
    const conversation = requesterMembership.conversation;
    if (conversation.type !== ConversationType.PRIVATE) {
      throw new ForbiddenException(
        'Block feature is only available for private conversations',
      );
    }

    // Verify target user là thành viên
    const targetMembership = await this.participantRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });

    if (!targetMembership) {
      throw new NotFoundException(
        'Target user is not a member of this conversation',
      );
    }

    // Không được chặn chính mình
    if (requesterId === targetUserId) {
      throw new BadRequestException('You cannot block yourself');
    }

    // Cập nhật vào database - lưu ai chặn người này
    await this.participantRepo.update(
      { conversationId, userId: targetUserId },
      { isBlocked: true, blockedAt: new Date(), blockedBy: requesterId },
    );

    return {
      success: true,
      conversationId,
      blockedUserId: targetUserId,
      blockedBy: requesterId,
      message: `User ${targetUserId} has been blocked`,
    };
  }

  /**
   * Bỏ chặn người dùng trong conversation
   * CHỈ NGƯỜI CHẶN MỚI CÓ THỂ BỎ CHẶN (verify blockedBy == requesterId)
   */
  async unblockUser(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ) {
    const requesterMembership = await this.requireMembership(
      conversationId,
      requesterId,
    );

    if (!requesterMembership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Verify conversation là PRIVATE
    if (requesterMembership.conversation.type !== ConversationType.PRIVATE) {
      throw new ForbiddenException(
        'Unblock feature is only available for private conversations',
      );
    }

    // Verify target user là thành viên và bị chặn
    const targetMembership = await this.participantRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });

    if (!targetMembership) {
      throw new NotFoundException(
        'Target user is not a member of this conversation',
      );
    }

    // Verify user bị chặn
    if (!targetMembership.isBlocked) {
      throw new BadRequestException('User is not blocked');
    }

    // ✅ CHỈ CÓ NGƯỜI CHẶN MỚI CÓ THỂ BỎ CHẶN
    if (targetMembership.blockedBy !== requesterId) {
      throw new ForbiddenException(
        'Only the person who blocked this user can unblock them',
      );
    }

    // Cập nhật vào database
    await this.participantRepo.update(
      { conversationId, userId: targetUserId },
      { isBlocked: false, blockedAt: null, blockedBy: null },
    );

    return {
      success: true,
      conversationId,
      unblockedUserId: targetUserId,
      message: `User ${targetUserId} has been unblocked`,
    };
  }

  // ==================== Pin Conversation ====================

  /**
   * Ghim cuộc hội thoại lên đầu danh sách
   * Cuộc hội thoại được ghim sau sẽ hiển thị trên
   * @param conversationId ID của cuộc hội thoại
   * @param userId ID của user hiện tại
   */
  async pinConversation(conversationId: string, userId: string) {
    // Verify membership
    const membership = await this.requireMembership(conversationId, userId);

    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Check if already pinned
    if (membership.isPinned) {
      throw new BadRequestException('This conversation is already pinned');
    }

    // Update the conversation participant to pin it with current timestamp
    const now = new Date();
    await this.participantRepo.update(
      { conversationId, userId },
      { isPinned: true, pinnedAt: now },
    );

    return {
      success: true,
      conversationId,
      isPinned: true,
      pinnedAt: now,
      message: 'Conversation pinned successfully',
    };
  }

  /**
   * Bỏ ghim cuộc hội thoại
   * @param conversationId ID của cuộc hội thoại
   * @param userId ID của user hiện tại
   */
  async unpinConversation(conversationId: string, userId: string) {
    // Verify membership
    const membership = await this.requireMembership(conversationId, userId);

    if (!membership) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Check if already unpinned
    if (!membership.isPinned) {
      throw new BadRequestException('This conversation is not pinned');
    }

    // Update the conversation participant to unpin it
    await this.participantRepo.update(
      { conversationId, userId },
      { isPinned: false, pinnedAt: null },
    );

    return {
      success: true,
      conversationId,
      isPinned: false,
      message: 'Conversation unpinned successfully',
    };
  }
}
