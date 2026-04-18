import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

const onlineUsers = new Map<string, Set<string>>();

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  handleConnection(client: Socket) {
    const userId = (client.handshake.query.userId as string) || '';
    if (!userId) {
      client.disconnect();
      return;
    }

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set<string>());
    }

    onlineUsers.get(userId)?.add(client.id);
    client.join(`user:${userId}`);
    this.logger.log(`Notification socket connected: ${userId} (${client.id})`);
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketIds] of onlineUsers.entries()) {
      if (socketIds.has(client.id)) {
        socketIds.delete(client.id);
        if (socketIds.size === 0) {
          onlineUsers.delete(userId);
        }
        this.logger.log(
          `Notification socket disconnected: ${userId} (${client.id})`,
        );
        break;
      }
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitUnreadCount(userId: string) {
    this.server.to(`user:${userId}`).emit('notifications:refresh_unread', {
      userId,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('notifications:join')
  handleJoin(@ConnectedSocket() client: Socket, payload: { userId?: string }) {
    if (!payload?.userId) return;
    client.join(`user:${payload.userId}`);
  }
}
