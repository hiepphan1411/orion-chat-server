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
import { v4 as uuidv4 } from 'uuid';

// Track multiple socket connections per user
// Map<userId, Set<socketId>>
const onlineUsers = new Map<string, Set<string>>();

@WebSocketGateway({
  cors: {
    origin: '*',
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
      const platform = (client.handshake.query.platform as string) || 'web';

      if (!userId) {
        this.logger.warn(`Client ${client.id} connected without userId`);
        client.disconnect();
        return;
      }

      // Add socket ID to user's connections
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId)!.add(client.id);

      // Join user-specific room for targeted messaging
      void client.join(`user:${userId}`);

      // Join platform-specific room so only same platform receives conflict events
      void client.join(`user:${userId}:${platform}`);

      this.logger.log(
        `Presence connected: ${userId} (${client.id}) [${platform}]. Devices: ${onlineUsers.get(userId)!.size}, Total online: ${onlineUsers.size}`,
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

      for (const [userId, socketIds] of onlineUsers.entries()) {
        if (socketIds.has(client.id)) {
          socketIds.delete(client.id);
          disconnectedUserId = userId;

          // Clean up user entry if no more sockets
          if (socketIds.size === 0) {
            onlineUsers.delete(userId);
          }
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

  /**
   * Disconnect all sockets of a specific user and platform
   * Used when old session is invalidated due to new login
   */
  disconnectUserPlatformSockets(userId: string, platform: string): void {
    try {
      if (
        !this.server ||
        !this.server.sockets ||
        !this.server.sockets.adapter
      ) {
        this.logger.warn(
          '[Disconnect] Socket server not fully initialized, skipping disconnect',
        );
        return;
      }

      this.logger.log(
        `[Disconnect] Disconnecting all ${platform} sockets for user ${userId}`,
      );

      // Get all sockets in the platform-specific room
      const room = this.server.sockets.adapter.rooms.get(
        `user:${userId}:${platform}`,
      );

      if (room && room.size > 0) {
        // Disconnect each socket in the room
        for (const socketId of room) {
          const socket = this.server.sockets.sockets.get(socketId);
          if (socket) {
            this.logger.log(
              `[Disconnect] Force disconnecting socket ${socketId} (user: ${userId}, platform: ${platform})`,
            );
            socket.disconnect(true); // true = server-initiated disconnect
          }
        }
      }
    } catch (error) {
      this.logger.error('Error disconnecting platform sockets:', error);
    }
  }

  /**
   * Emit session conflict prompt to old device and wait for response
   * @param userId The user ID
   * @param newPlatform The platform trying to login ('web' or 'mobile')
   * @returns Promise<boolean> - true if old device chose logout, false if reject or timeout
   */
  async emitSessionConflictWithPrompt(
    userId: string,
    newPlatform: string,
  ): Promise<boolean> {
    const requestId = uuidv4();

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.logger.warn(
          `[Session Conflict] Timeout waiting for response from user ${userId}`,
        );
        // Default to allowing new login on timeout
        resolve(true);
      }, 10000); // 10 second timeout

      // Emit prompt to old device (broadcast to user's room, excluding any current connection)
      this.server.to(`user:${userId}`).emit('session:conflict-prompt', {
        message: `Tài khoản của bạn đang được đăng nhập từ thiết bị khác (${newPlatform}).`,
        newPlatform,
        requestId,
      });

      this.logger.log(
        `[Socket] Emitted session:conflict-prompt to user ${userId} (platform: ${newPlatform})`,
      );

      // Listen for response from old device
      const responseHandler = (data: {
        requestId: string;
        action: 'logout' | 'reject';
      }) => {
        if (data.requestId === requestId) {
          clearTimeout(timeoutId);

          if (data.action === 'logout') {
            this.logger.log(
              `[Session Conflict] User ${userId} chose to logout`,
            );
            resolve(true);
          } else if (data.action === 'reject') {
            this.logger.log(
              `[Session Conflict] User ${userId} chose to keep login`,
            );
            resolve(false);
          }

          // Remove listener after response
          this.server.removeListener(
            'session:conflict-response',
            responseHandler,
          );
        }
      };

      // Set up one-time listener for response
      this.server.on('session:conflict-response', responseHandler);
    });
  }
}
