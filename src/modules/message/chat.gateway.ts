/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, Inject, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Message, MessageDocument } from './message.schema';
import { UsersService } from '../users/users.service';
import { MessageType } from 'src/common/enums/message-type.enum';

type ChatClientMessageType = 'text' | 'image' | 'file' | 'audio' | 'video';

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

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly configService: ConfigService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
  ) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query.token as string) ||
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    if (!token) {
      this.logger.warn('No token provided in WebSocket connection');
      client.disconnect(true);
      return;
    }

    let userId: string;

    if (token.includes('.')) {
      try {
        const secret =
          this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
        const decoded = jwt.verify(token, secret) as any;
        userId = decoded.sub || decoded.userId || decoded.phoneNumber;

        if (!userId) {
          this.logger.warn('No userId found in JWT token');
          client.disconnect(true);
          return;
        }
      } catch (error) {
        this.logger.warn(`Invalid JWT token: ${error}`);
        client.disconnect(true);
        return;
      }
    } else {
      userId = token;
    }

    if (!userId) {
      client.disconnect(true);
      return;
    }

    onlineUsers.set(userId, client.id);
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
        },
      });
  }

  // Các @SubscribeMessage còn lại **giữ nguyên hoàn toàn** như code cũ của bạn
  // (handleJoinConversation, handleSendMessage, handleTyping, handleFetchMessages, ...)
  @SubscribeMessage('chat:join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requestId: string; conversationId: string },
  ) {
    try {
      this.logger.log(
        `[ChatGateway] Joining conversation: ${data.conversationId}`,
      );
      client.join(`conversation:${data.conversationId}`);

      return {
        ok: true,
        requestId: data.requestId,
        data: { conversationId: data.conversationId },
      };
    } catch (error) {
      this.logger.error('Error joining conversation:', error);
      return {
        ok: false,
        requestId: data.requestId,
        error: {
          code: 'JOIN_FAILED',
          message: error instanceof Error ? error.message : 'Join failed',
          retriable: true,
        },
      };
    }
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      requestId: string;
      clientMessageId: string;
      conversationId: string;
      receiverId: string;
      type: 'text' | 'image' | 'file' | 'audio';
      content: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
      replyToMessageId?: string;
    },
  ) {
    this.logger.log(`RECEIVED MESSAGE: ${JSON.stringify(data)}`);

    try {
      this.logger.log(
        `[ChatGateway] Sending message in conversation: ${data.conversationId}`,
      );

      // Get senderBy from JWT token
      let senderId: string = '';
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query.token as string);

      if (token?.includes('.')) {
        try {
          const secret =
            this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
          const decoded = jwt.verify(token, secret) as any;
          senderId = decoded.sub || decoded.userId || decoded.phoneNumber;
        } catch (err) {
          this.logger.warn('Failed to decode token:', err);
        }
      }

      // Create message in database
      const message = await this.messageModel.create({
        conversationId: data.conversationId,
        senderBy: senderId,
        content: data.content,
        messageType: data.type?.toUpperCase() || 'TEXT',
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        replyToMessageId: data.replyToMessageId,
        clientMessageId: data.clientMessageId,
        messageStatus: 'SENT',
      });

      this.logger.log(`[ChatGateway] Message created: ${message._id}`);

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
      });

      // ACK back to sender via return (Socket.io auto-invokes callback)
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
      return {
        ok: false,
        error: {
          code: 'SEND_FAILED',
          message: error instanceof Error ? error.message : 'Send failed',
        },
      };
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      isTyping: boolean;
    },
  ) {
    try {
      let userId: string = '';
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query.token as string);

      if (token?.includes('.')) {
        try {
          const secret =
            this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
          const decoded = jwt.verify(token, secret) as any;
          userId = decoded.sub || decoded.userId || decoded.phoneNumber;
        } catch (err) {
          this.logger.warn('Failed to decode token:', err);
        }
      }

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
}
