/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { MessageType } from 'src/common/enums/message-type.enum';
import { Message, MessageDocument } from './message.schema';

const onlineUsers = new Map<string, string>();

type AckSuccess<T> = {
  ok: true;
  requestId: string;
  data: T;
};

type AckError = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    retriable: boolean;
    details?: Record<string, unknown>;
  };
};

type Ack<T> = AckSuccess<T> | AckError;

type ChatClientMessageType = 'text' | 'image' | 'file' | 'audio' | 'video';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  handleConnection(client: Socket) {
    const userId =
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    if (!userId) {
      client.disconnect();
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
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        reactions: payload.reactions,
        actedBy: payload.actedBy,
        action: payload.action,
        emoji: payload.emoji,
        at: new Date().toISOString(),
      });
  }

  emitMessageRecalled(payload: {
    conversationId: string;
    messageId: string;
    revokedBy: string;
    revokedAt: string;
  }) {
    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('chat:message_recalled', {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        revokedBy: payload.revokedBy,
        revokedAt: payload.revokedAt,
        isDeleted: true,
      });
  }

  @SubscribeMessage('chat:join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { requestId: string; conversationId: string },
  ) {
    const { requestId, conversationId } = payload || {};

    if (!requestId || !conversationId) {
      const ack: Ack<null> = {
        ok: false,
        requestId: requestId || '',
        error: {
          code: 'CHAT_INVALID_PAYLOAD',
          message: 'requestId and conversationId are required',
          retriable: false,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    client.join(`conversation:${conversationId}`);

    const ack: Ack<{ conversationId: string; joinedAt: string }> = {
      ok: true,
      requestId,
      data: {
        conversationId,
        joinedAt: new Date().toISOString(),
      },
    };

    client.emit('chat:ack', ack);
    client.emit('chat:conversation_joined', {
      conversationId,
      joinedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('chat:send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      requestId: string;
      clientMessageId: string;
      conversationId: string;
      receiverId: string;
      type: 'text' | 'image' | 'file' | 'audio' | 'video';
      content?: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
      replyToMessageId?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const senderId =
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    const {
      requestId,
      clientMessageId,
      conversationId,
      receiverId,
      type,
      content,
      mediaUrl,
      fileName,
      fileSize,
      replyToMessageId,
      meta,
    } = payload || {};

    const normalizedType = this.normalizeMessageType(type || MessageType.TEXT);
    const normalizedContent = (content || '').trim();
    const normalizedMediaUrl = (
      mediaUrl ||
      this.getStringMeta(meta, 'mediaUrl') ||
      ''
    ).trim();
    const normalizedFileName = (
      fileName ||
      this.getStringMeta(meta, 'fileName') ||
      ''
    ).trim();
    const normalizedFileSize =
      fileSize || Number(this.getStringMeta(meta, 'fileSize') || 0);
    const requiresMedia = this.requiresMedia(normalizedType);
    const normalizedContentForMedia =
      requiresMedia && normalizedContent === normalizedMediaUrl
        ? ''
        : normalizedContent;

    if (
      !senderId ||
      !requestId ||
      !clientMessageId ||
      !conversationId ||
      !receiverId ||
      !type
    ) {
      const ack: Ack<null> = {
        ok: false,
        requestId: requestId || '',
        error: {
          code: 'CHAT_INVALID_PAYLOAD',
          message: 'missing required fields',
          retriable: false,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    if (normalizedType === MessageType.TEXT && !normalizedContent) {
      const ack: Ack<null> = {
        ok: false,
        requestId,
        error: {
          code: 'CHAT_INVALID_PAYLOAD',
          message: 'content is required for text message',
          retriable: false,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    if (requiresMedia && !normalizedMediaUrl) {
      const ack: Ack<null> = {
        ok: false,
        requestId,
        error: {
          code: 'CHAT_INVALID_PAYLOAD',
          message: 'mediaUrl is required for media message',
          retriable: false,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    const duplicated = await this.messageModel
      .findOne({
        conversationId,
        senderBy: senderId,
        clientMessageId,
      })
      .lean();

    if (duplicated) {
      const ack: Ack<{ messageId: string; duplicated: true }> = {
        ok: true,
        requestId,
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          messageId: String((duplicated as any)._id),
          duplicated: true,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    const created = await this.messageModel.create({
      conversationId,
      senderBy: senderId,
      content: normalizedContentForMedia,
      mediaUrl: normalizedMediaUrl || undefined,
      fileName: normalizedFileName || undefined,
      fileSize: normalizedFileSize > 0 ? normalizedFileSize : undefined,
      messageType: normalizedType,
      replyToMessageId: replyToMessageId,
      messageStatus: 'SENT',
      clientMessageId,
    });

    const message = this.toClientMessage(created, senderId);

    const ack: Ack<{ message: typeof message }> = {
      ok: true,
      requestId,
      data: { message },
    };
    client.emit('chat:ack', ack);

    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      this.server.to(receiverSocketId).emit('chat:message_new', {
        conversationId,
        message,
      });
    }

    client.to(`conversation:${conversationId}`).emit('chat:message_new', {
      conversationId,
      message,
    });
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { conversationId: string; isTyping: boolean },
  ) {
    const userId =
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    if (!payload?.conversationId || !userId) return;

    client.to(`conversation:${payload.conversationId}`).emit('chat:typing', {
      conversationId: payload.conversationId,
      userId,
      isTyping: !!payload.isTyping,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('chat:fetch_messages')
  async handleFetchMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      requestId: string;
      conversationId: string;
      cursor?: string | null;
      limit?: number;
    },
  ) {
    const { requestId, conversationId, cursor, limit } = payload || {};
    const pageSize = Math.min(Math.max(limit || 30, 1), 100);
    const requesterUserId =
      (client.handshake.auth?.userId as string) ||
      (client.handshake.query.userId as string);

    if (!requestId || !conversationId) {
      const ack: Ack<null> = {
        ok: false,
        requestId: requestId || '',
        error: {
          code: 'CHAT_INVALID_PAYLOAD',
          message: 'requestId and conversationId are required',
          retriable: false,
        },
      };
      client.emit('chat:ack', ack);
      return;
    }

    const filter: any = { conversationId, isDeleted: false };
    if (requesterUserId) {
      filter.deletedForUsers = { $ne: requesterUserId };
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const rawItems = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .lean();

    const items = rawItems.map((item) => this.toClientMessage(item));

    const nextCursor =
      rawItems.length === pageSize
        ? new Date(
            (rawItems[rawItems.length - 1] as any).createdAt,
          ).toISOString()
        : null;

    const ack: Ack<{
      conversationId: string;
      items: any[];
      nextCursor: string | null;
    }> = {
      ok: true,
      requestId,
      data: {
        conversationId,
        items,
        nextCursor,
      },
    };

    client.emit('chat:ack', ack);
  }

  private normalizeMessageType(messageType: string): MessageType {
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

  private getStringMeta(
    meta: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = meta?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private requiresMedia(messageType: MessageType): boolean {
    return (
      messageType === MessageType.IMAGE ||
      messageType === MessageType.FILE ||
      messageType === MessageType.AUDIO ||
      messageType === MessageType.VIDEO ||
      messageType === MessageType.VOICE_MESSAGE
    );
  }

  private toClientMessage(message: any, fallbackSenderId?: string) {
    const mediaUrl = String(message.mediaUrl || '');
    const messageType = this.toClientType(
      String(message.messageType || 'TEXT'),
    );

    return {
      messageId: String(message._id || ''),
      clientMessageId: String(message.clientMessageId || ''),
      conversationId: String(message.conversationId || ''),
      senderId: String(message.senderBy || fallbackSenderId || ''),
      type: messageType,
      content: String(message.content || ''),
      mediaUrl: mediaUrl || undefined,
      imageUrl: messageType === 'image' ? mediaUrl || undefined : undefined,
      fileName: message.fileName,
      fileSize: message.fileSize,
      forwardedFromMessageId: message.forwardedFromMessageId,
      reactions: Array.isArray(message.reactions) ? message.reactions : [],
      replyToMessageId: message.replyToMessageId,
      status: message.messageStatus,
      createdAt: message.createdAt,
    };
  }

  private toClientType(messageType: string): ChatClientMessageType {
    switch (String(messageType || '').toUpperCase()) {
      case MessageType.IMAGE:
        return 'image';
      case MessageType.FILE:
        return 'file';
      case MessageType.AUDIO:
      case MessageType.VOICE_MESSAGE:
        return 'audio';
      case MessageType.VIDEO:
        return 'video';
      default:
        return 'text';
    }
  }
}
