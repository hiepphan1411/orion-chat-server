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

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

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
      type: 'text' | 'image' | 'file' | 'audio';
      content: string;
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
      replyToMessageId,
    } = payload || {};

    if (
      !senderId ||
      !requestId ||
      !clientMessageId ||
      !conversationId ||
      !receiverId ||
      !type ||
      !content
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
      content,
      messageType: type,
      replyToMessageId: replyToMessageId,
      messageStatus: 'sent',
      clientMessageId,
    });

    const message = {
      messageId: String(created._id),
      clientMessageId,
      conversationId,
      senderId,
      type,
      content,
      replyToMessageId: created.replyToMessageId,
      status: created.messageStatus,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      createdAt: (created as any).createdAt,
    };

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

    const filter: any = { conversationId, isDelete: false };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const items = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .lean();

    const nextCursor =
      items.length === pageSize
        ? // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
          new Date((items[items.length - 1] as any).createdAt).toISOString()
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
}
