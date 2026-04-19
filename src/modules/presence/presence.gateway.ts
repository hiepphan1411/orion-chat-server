import {
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

// Track multiple socket connections per user
// Map<userId, Set<socketId>>
const onlineUsers = new Map<string, Set<string>>();
const socketToUser = new Map<string, string>();
const userLastSeen = new Map<string, number>();
const HEARTBEAT_TIMEOUT_MS = 120000;
const PRESENCE_SWEEP_INTERVAL_MS = 30000;

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/presence',
})
export class PresenceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('PresenceGateway');
  private sweepTimer: NodeJS.Timeout | null = null;

  afterInit() {
    this.sweepTimer = setInterval(() => {
      this.pruneStaleUsers();
    }, PRESENCE_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

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
      const userSockets = onlineUsers.get(userId) ?? new Set<string>();
      const wasOffline = userSockets.size === 0;
      userSockets.add(client.id);
      onlineUsers.set(userId, userSockets);
      socketToUser.set(client.id, userId);
      userLastSeen.set(userId, Date.now());

      // Join user-specific room for targeted messaging
      void client.join(`user:${userId}`);

      // Join platform-specific room so only same platform receives conflict events
      void client.join(`user:${userId}:${platform}`);

      console.log(
        `[handleConnection] Socket ${client.id} joined rooms: user:${userId}, user:${userId}:${platform}`,
      );

      this.logger.log(
        `Presence connected: ${userId} (${client.id}) [${platform}]. Devices: ${onlineUsers.get(userId)!.size}, Total online: ${onlineUsers.size}`,
      );

      // Only broadcast online when user transitions from offline -> online.
      if (wasOffline) {
        client.broadcast.emit('presence:user-online', { userId });
      }
    } catch (error) {
      this.logger.error('Presence connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    try {
      const userId = socketToUser.get(client.id);
      if (!userId) {
        return;
      }

      socketToUser.delete(client.id);
      const socketIds = onlineUsers.get(userId);
      if (!socketIds) {
        return;
      }

      socketIds.delete(client.id);

      if (socketIds.size === 0) {
        onlineUsers.delete(userId);
        userLastSeen.set(userId, Date.now());
        this.logger.log(`Presence disconnected: ${userId}. Online: ${onlineUsers.size}`);
        client.broadcast.emit('presence:user-offline', { userId });
      } else {
        this.logger.log(
          `Presence socket disconnected: ${userId} (${client.id}). Remaining devices: ${socketIds.size}`,
        );
      }
    } catch (error) {
      this.logger.error('Presence disconnect error:', error);
    }
  }

  @SubscribeMessage('presence:get-online')
  handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
    this.pruneStaleUsers();

    const now = Date.now();
    const users = Array.from(onlineUsers.keys());

    client.emit('presence:online-list', {
      users,
      onlineCount: users.length,
      serverTime: now,
    });
  }

  private pruneStaleUsers() {
    if (!this.server?.sockets?.sockets) {
      return;
    }

    const now = Date.now();
    for (const [userId, socketIds] of onlineUsers.entries()) {
      for (const socketId of Array.from(socketIds)) {
        const isSocketAlive = this.server.sockets.sockets.has(socketId);
        if (!isSocketAlive) {
          socketIds.delete(socketId);
          socketToUser.delete(socketId);
        }
      }

      const lastSeen = userLastSeen.get(userId) ?? 0;
      const staleByHeartbeat = now - lastSeen > HEARTBEAT_TIMEOUT_MS;

      if (socketIds.size === 0 || staleByHeartbeat) {
        onlineUsers.delete(userId);
        userLastSeen.set(userId, now);
        this.server.emit('presence:user-offline', { userId });
      }
    }
  }

  @SubscribeMessage('presence:heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    payload?: { userId?: string },
  ) {
    const resolvedUserId = socketToUser.get(client.id) ?? payload?.userId;
    if (!resolvedUserId) {
      return;
    }

    userLastSeen.set(resolvedUserId, Date.now());
    client.emit('presence:heartbeat:ack', {
      userId: resolvedUserId,
      serverTime: Date.now(),
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
