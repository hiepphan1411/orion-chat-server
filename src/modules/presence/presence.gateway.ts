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

const onlineUsers = new Map<string, string>();

const socketAllowedOrigins = (
  process.env.SOCKET_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || ''
)
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: socketAllowedOrigins.length > 0 ? socketAllowedOrigins : true,
  },
  namespace: '/presence',
})
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('PresenceGateway');

  handleConnection(client: Socket) {
    try {
      const userId = client.handshake.query.userId as string;

      if (!userId) {
        this.logger.warn(`Client ${client.id} connected without userId`);
        client.disconnect();
        return;
      }

      onlineUsers.set(userId, client.id);
      this.logger.log(
        `Presence connected: ${userId} (${client.id}). Online: ${onlineUsers.size}`,
      );

      client.broadcast.emit('presence:user-online', { userId });
    } catch (error) {
      this.logger.error('Presence connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    try {
      let disconnectedUserId: string | null = null;

      for (const [userId, socketId] of onlineUsers.entries()) {
        if (socketId === client.id) {
          disconnectedUserId = userId;
          onlineUsers.delete(userId);
          break;
        }
      }

      if (disconnectedUserId) {
        this.logger.log(
          `Presence disconnected: ${disconnectedUserId}. Online: ${onlineUsers.size}`,
        );
        client.broadcast.emit('presence:user-offline', {
          userId: disconnectedUserId,
        });
      }
    } catch (error) {
      this.logger.error('Presence disconnect error:', error);
    }
  }

  @SubscribeMessage('presence:get-online')
  handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    client.emit('presence:online-list', {
      users: Array.from(onlineUsers.keys()),
    });
  }
}
