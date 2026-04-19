/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, ValidationPipe } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Message, MessageDocument } from './message.schema';
import { UsersService } from '../users/users.service';
import { NotificationService } from '../notifications/notification.service';
import {
  Conversation,
  ConversationType,
} from '../conversation/entities/conversation.schema';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import {
  JoinConversationSocketDto,
  SendMessageSocketDto,
  TypingSocketDto,
} from './dto/chat-socket.dto';
import { ChatMembershipService } from './services/chat-membership.service';

const onlineUsers = new Map<string, string>();

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5174',
      'http://localhost:3001',
      'https://deceitfully-unquailing-haylee.ngrok-free.dev',
      'https://foveate-tristan-disepalous.ngrok-free.dev',
      'https://d1m0lu9iwqsfsh.cloudfront.net',
      'http://orion-web-chat-staging.s3-website-ap-southeast-1.amazonaws.com',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'ngrok-skip-browser-warning',
    ],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 300000, // 5 minutes - increased from 1 minute
  pingInterval: 60000, // ping every 1 minute - increased from 25 seconds
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly validationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly configService: ConfigService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
    private readonly notificationService: NotificationService,
    private readonly chatMembershipService: ChatMembershipService,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(GroupConversation)
    private readonly groupConversationRepo: Repository<GroupConversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
  ) {}

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);

    if (!userId) {
      this.logger.warn('No userId found in WebSocket connection');
      client.disconnect(true);
      return;
    }

    onlineUsers.set(userId, client.id);
    void client.join(`user:${userId}`);
    this.logger.log(`User ${userId} connected: ${client.id}`);

    client.broadcast.emit('presence:user_online', {
      userId,
      at: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    let disconnectedUserId: string | null = null;

    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === client.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      this.logger.log(`User ${disconnectedUserId} disconnected`);
      client.broadcast.emit('presence:user_offline', {
        userId: disconnectedUserId,
        at: new Date().toISOString(),
      });
    }
  }

  // ==================== Emit methods ====================

  /**
   * Broadcast khi có ai đó react/unreact vào message
   *
   * @param payload
   * messageId: ID của message bị react/unreact
   * conversationId: ID của conversation chứa message đó
   * reactions: Danh sách reactions mới nhất của message đó (sau khi đã được cập nhật)
   * actedBy: userId của người vừa react/unreact
   * action: 'set' nếu là react, 'remove' nếu là unreact
   */
  emitMessageReactionUpdated(payload: {
    conversationId: string;
    messageId: string;
    reactions: Array<{ userId: string; emoji: string; reactedAt: Date }>;
    actedBy: string;
    action: 'set' | 'remove';
    emoji?: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_reaction_updated', {
        ...payload,
        at: new Date().toISOString(),
      });
  }

  /**
   * Broadcast khi có ai đó recall (thu hồi) một message
   *
   * @param payload
   * conversationId: ID của conversation chứa message đó
   * messageId: ID của message bị recall
   * revokedBy: userId của người vừa recall message đó
   * revokedAt: timestamp khi message bị recall
   * isRevoked: true nếu message đã bị recall, false nếu đã được un-recall (hoàn tác)
   */
  emitMessageRecalled(payload: {
    conversationId: string;
    messageId: string;
    revokedBy: string;
    revokedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_recalled', {
        ...payload,
        isRevoked: true,
      });
  }

  emitMessageDeleted(payload: {
    conversationId: string;
    messageId: string;
    deletedBy: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_deleted', {
        ...payload,
        isDeleted: true,
        at: new Date().toISOString(),
      });
  }

  emitMessageAdminDeleted(payload: {
    conversationId: string;
    messageId: string;
    deletedBy: string;
    deletedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_admin_deleted', {
        ...payload,
        deletedByAdmin: true,
      });
  }

  emitGroupAdminTransferred(payload: {
    groupId: string;
    oldAdminUserId: string;
    newAdminUserId: string;
    transferredAt: string;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:admin_transferred', payload);
  }

  emitGroupMemberLeft(payload: {
    groupId: string;
    userId: string;
    leftAt: string;
    groupDeleted: boolean;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:member_left', payload);
  }

  emitGroupMembersAdded(payload: {
    groupId: string;
    addedBy: string;
    userIds: string[];
    addedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:members_added', payload);
  }

  emitGroupAutoDeleteUpdated(payload: {
    groupId: string;
    autoDeleteDuration: number;
    updatedBy: string;
    updatedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:auto_delete_updated', payload);
  }

  emitGroupDissolved(payload: {
    groupId: string;
    dissolvedBy: string;
    dissolvedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:dissolved', payload);
  }

  emitGroupInfoUpdated(payload: {
    groupId: string;
    groupName?: string;
    groupAvatar?: string;
    updatedBy: string;
    updatedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.groupId}`)
      .emit('group:info_updated', payload);
  }

  emitConversationHiddenUpdated(payload: {
    conversationId: string;
    userId: string;
    hidden: boolean;
    updatedAt: string;
  }) {
    this.server
      .to(`user:${payload.userId}`)
      .emit('conversation:hidden_updated', {
        conversationId: payload.conversationId,
        userId: payload.userId,
        hidden: payload.hidden,
        updatedAt: payload.updatedAt,
      });
  }

  emitConversationHistoryCleared(payload: {
    conversationId: string;
    userId: string;
    deletedMessagesCount: number;
    clearedAt: string;
  }) {
    this.server
      .to(`user:${payload.userId}`)
      .emit('conversation:history_cleared', {
        conversationId: payload.conversationId,
        userId: payload.userId,
        deletedMessagesCount: payload.deletedMessagesCount,
        clearedAt: payload.clearedAt,
      });
  }

  emitNewMessage(payload: {
    conversationId: string;
    messageId: string;
    senderBy: string;
    senderName?: string;
    senderAvatar?: string;
    content: string;
    messageType?: string;
    createdAt: any;
    clientMessageId?: string;
    replyToMessageId?: string;
    messageStatus?: string;
    callData?: {
      callType?: 'audio' | 'video';
      callStatus?: 'completed' | 'missed' | 'declined';
      duration?: number;
      isInitiator?: boolean;
      wasRejected?: boolean;
    } | null;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_new', {
        conversationId: payload.conversationId,
        message: {
          _id: payload.messageId,
          conversationId: payload.conversationId,
          senderBy: payload.senderBy,
          senderName: payload.senderName || payload.senderBy,
          senderAvatar: payload.senderAvatar,
          content: payload.content,
          messageType: payload.messageType,
          createdAt: payload.createdAt,
          clientMessageId: payload.clientMessageId,
          replyToMessageId: payload.replyToMessageId,
          messageStatus: payload.messageStatus,
          callData: payload.callData || null,
        },
      });
  }

  // Các @SubscribeMessage còn lại **giữ nguyên hoàn toàn** như code cũ của bạn
  @SubscribeMessage('chat:join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: JoinConversationSocketDto,
  ) {
    const requestId = String(rawData?.requestId || '');

    try {
      const data = (await this.validationPipe.transform(rawData, {
        type: 'body',
        metatype: JoinConversationSocketDto,
      })) as JoinConversationSocketDto;

      const userId = this.extractUserId(client);
      if (!userId) {
        return this.buildErrorAck(
          requestId,
          'UNAUTHORIZED',
          'Invalid token',
          false,
        );
      }

      await this.chatMembershipService.assertConversationMember(
        userId,
        data.conversationId,
      );

      this.logger.log(
        `[ChatGateway] Joining conversation: ${data.conversationId}`,
      );
      void client.join(`conversation:${data.conversationId}`);

      return this.buildSuccessAck(data.requestId, {
        conversationId: data.conversationId,
      });
    } catch (error) {
      this.logger.error('Error joining conversation:', error);
      return this.buildErrorAck(
        requestId,
        'JOIN_FAILED',
        error instanceof Error ? error.message : 'Join failed',
        true,
      );
    }
  }

  @SubscribeMessage('chat:leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: JoinConversationSocketDto,
  ) {
    const requestId = String(rawData?.requestId || '');

    try {
      const data = (await this.validationPipe.transform(rawData, {
        type: 'body',
        metatype: JoinConversationSocketDto,
      })) as JoinConversationSocketDto;

      const userId = this.extractUserId(client);
      if (!userId) {
        return this.buildErrorAck(
          requestId,
          'UNAUTHORIZED',
          'Invalid token',
          false,
        );
      }

      await this.chatMembershipService.assertConversationMember(
        userId,
        data.conversationId,
      );

      void client.leave(`conversation:${data.conversationId}`);
      return this.buildSuccessAck(data.requestId, {
        conversationId: data.conversationId,
      });
    } catch (error) {
      this.logger.error('Error leaving conversation:', error);
      return this.buildErrorAck(
        requestId,
        'LEAVE_FAILED',
        error instanceof Error ? error.message : 'Leave failed',
        true,
      );
    }
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: SendMessageSocketDto,
  ) {
    const requestId = String(rawData?.requestId || '');
    this.logger.log(`RECEIVED MESSAGE: ${JSON.stringify(rawData)}`);

    try {
      const data = (await this.validationPipe.transform(rawData, {
        type: 'body',
        metatype: SendMessageSocketDto,
      })) as SendMessageSocketDto;

      this.logger.log(
        `[ChatGateway] Sending message in conversation: ${data.conversationId}`,
      );

      const senderId = this.extractUserId(client);
      if (!senderId) {
        return this.buildErrorAck(
          data.requestId,
          'UNAUTHORIZED',
          'Invalid token',
          false,
        );
      }

      await this.chatMembershipService.assertConversationMember(
        senderId,
        data.conversationId,
      );

      // Create message in database
      const message = await this.messageModel.create({
        conversationId: data.conversationId,
        senderBy: senderId,
        content: data.content,
        messageType: data.type?.toUpperCase() || 'TEXT',
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: undefined,
        replyToMessageId: data.replyToMessageId,
        clientMessageId: data.clientMessageId,
        messageStatus: 'SENT',
        callData: data.callData || null,
      });

      this.logger.log(`[ChatGateway] Message created: ${String(message._id)}`);

      // Fetch sender info to include in message emit
      let senderName = senderId;
      let senderAvatar: string | undefined;
      try {
        const user = await this.usersService.getProfile(senderId);
        if (user?.data) {
          senderName = user.data.fullName || senderId;
          senderAvatar = user.data.avatarUrl;
        }
      } catch (err) {
        this.logger.warn(
          `[ChatGateway] Could not fetch user info for ${senderId}:`,
          err,
        );
        // Use senderId as fallback senderName
      }

      // Emit to conversation room with sender info
      this.emitNewMessage({
        conversationId: data.conversationId,
        messageId: String(message._id),
        senderBy: senderId,
        senderName: senderName,
        senderAvatar: senderAvatar,
        content: data.content,
        messageType: data.type,
        createdAt: message.createdAt,
        clientMessageId: data.clientMessageId,
        replyToMessageId: data.replyToMessageId,
        messageStatus: 'SENT',
        callData: data.callData || null,
      });

      // Gửi notification cho tất cả thành viên còn lại trong conversation
      // để hỗ trợ cả PRIVATE và GROUP chat.
      const participants = await this.participantRepo.find({
        where: { conversationId: data.conversationId },
      });

      const receiverIds = participants
        .map((item) => item.userId)
        .filter((userId) => userId && userId !== senderId);

      if (receiverIds.length > 0) {
        const conversation = await this.conversationRepo.findOne({
          where: { conversationId: data.conversationId },
        });

        const conversationType = conversation?.type || ConversationType.PRIVATE;

        const groupInfo =
          conversationType === ConversationType.GROUP
            ? await this.groupConversationRepo.findOne({
                where: { conversationId: data.conversationId },
              })
            : null;

        const contentPreview =
          data.type === 'text'
            ? data.content
            : data.type === 'call'
              ? 'Ban co mot lich su cuoc goi moi'
              : `Da gui ${data.type}`;

        await Promise.allSettled(
          receiverIds.map((receiverId) =>
            this.notificationService.createAndEmit({
              userId: receiverId,
              type: data.type === 'call' ? 'call' : 'message',
              title: senderName || '',
              body: contentPreview,
              link: '/chat',
              metadata: {
                conversationId: data.conversationId,
                senderId,
                senderName,
                messageId: String(message._id),
                messageType: data.type,
                conversationType,
                groupName: groupInfo?.groupName,
              },
            }),
          ),
        );
      }

      // ACK back to sender
      return {
        ok: true,
        requestId: data.requestId,
        data: {
          messageId: String(message._id),
          clientMessageId: data.clientMessageId,
          timestamp: message.createdAt,
        },
      };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      return this.buildErrorAck(
        requestId,
        'SEND_FAILED',
        error instanceof Error ? error.message : 'Send failed',
        true,
      );
    }
  }

  @SubscribeMessage('chat:typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: TypingSocketDto,
  ) {
    try {
      const data = (await this.validationPipe.transform(rawData, {
        type: 'body',
        metatype: TypingSocketDto,
      })) as TypingSocketDto;

      const userId = this.extractUserId(client);
      if (!userId) {
        return;
      }

      await this.chatMembershipService.assertConversationMember(
        userId,
        data.conversationId,
      );

      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('chat:typing', {
          conversationId: data.conversationId,
          userId,
          isTyping: data.isTyping,
          at: new Date().toISOString(),
        });
    } catch (error) {
      this.logger.error('Error handling typing:', error);
    }
  }

  @SubscribeMessage('chat:message_read')
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      requestId: string;
      conversationId: string;
      messageId: string;
    },
  ) {
    try {
      const userId = this.extractUserId(client);
      if (!userId) {
        return this.buildErrorAck(
          data?.requestId,
          'UNAUTHORIZED',
          'Invalid token',
          false,
        );
      }

      await this.chatMembershipService.assertConversationMember(
        userId,
        data.conversationId,
      );

      const seenAt = new Date();

      await this.messageModel.updateOne(
        { _id: data.messageId, conversationId: data.conversationId },
        {
          $pull: { seenBy: { userId } },
        },
      );

      await this.messageModel.updateOne(
        { _id: data.messageId, conversationId: data.conversationId },
        {
          $addToSet: {
            seenBy: {
              userId,
              seenAt,
            },
          },
        },
      );

      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('chat:message_seen', {
          conversationId: data.conversationId,
          messageId: data.messageId,
          userId,
          seenAt: seenAt.toISOString(),
        });

      return this.buildSuccessAck(data.requestId, {
        conversationId: data.conversationId,
        messageId: data.messageId,
        seenAt: seenAt.toISOString(),
      });
    } catch (error) {
      return this.buildErrorAck(
        data?.requestId,
        'READ_FAILED',
        error instanceof Error ? error.message : 'Read status update failed',
        true,
      );
    }
  }

  private extractUserId(client: Socket): string | null {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query.token as string) ||
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    if (!token) {
      return null;
    }

    if (!token.includes('.')) {
      return token;
    }

    try {
      const secret =
        this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
      const decoded = jwt.verify(token, secret) as {
        sub?: string;
        userId?: string;
        phoneNumber?: string;
      };

      return decoded.sub || decoded.userId || decoded.phoneNumber || null;
    } catch (error) {
      this.logger.warn(`Invalid JWT token: ${error}`);
      return null;
    }
  }

  private buildSuccessAck(requestId: string, data: unknown) {
    return {
      ok: true,
      requestId,
      data,
    };
  }

  private buildErrorAck(
    requestId: string | undefined,
    code: string,
    message: string,
    retriable: boolean,
  ) {
    return {
      ok: false,
      requestId,
      error: {
        code,
        message,
        retriable,
      },
    };
  }
}
