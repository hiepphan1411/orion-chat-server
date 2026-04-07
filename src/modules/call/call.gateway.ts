import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { CallService } from './call.service';
import { CallType } from 'src/common/enums/call-type.enum';
import { CallInitiateDto } from './dto/call-initiate.dto';
import {
  CallOfferDto,
  CallAnswerDto,
  IceCandidateDto,
} from './dto/call-signal.dto';
import { CallActionDto, ToggleMediaDto } from './dto/call-action.dto';
import { CallDocument } from './call.schema';

// map để tracking user online và socketId
const onlineUsers = new Map<string, string>(); // userId -> socketId
const activeCalls = new Map<string, { callerId: string; receiverId: string }>(); // callId -> {callerId, receiverId},

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/call', // namespace riêng cho call
  pingTimeout: 300000, // 5 minutes
  pingInterval: 60000, // ping every 1 minute
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('CallGateway');

  constructor(private readonly callService: CallService) {}

  // xử lý khi client connect
  handleConnection(client: Socket) {
    try {
      // lấy userId từ handshake query hoặc auth token
      const userId = client.handshake.query.userId as string;

      if (!userId) {
        this.logger.warn(`Client ${client.id} connected without userId`);
        client.disconnect();
        return;
      }

      // lưu mapping userId -> socketId
      onlineUsers.set(userId, client.id);
      this.logger.log(
        `User ${userId} connected with socketId ${client.id}. Total online: ${onlineUsers.size}`,
      );

      // broadcast user online status - optional
      client.broadcast.emit('user:online', { userId });
    } catch (error) {
      this.logger.error('Connection error: ', error);
      client.disconnect();
    }
  }

  // Xử lý khi client disconnect
  async handleDisconnect(client: Socket) {
    try {
      // tìm userId từ socketId
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
          `User ${disconnectedUserId} disconnected. Total online: ${onlineUsers.size}`,
        );

        // kết thúc các cuộc gọi đang active của user này
        for (const [callId, participants] of activeCalls.entries()) {
          if (
            participants.callerId === disconnectedUserId ||
            participants.receiverId === disconnectedUserId
          ) {
            // notify người còn lại
            const otherUserId =
              participants.callerId === disconnectedUserId
                ? participants.receiverId
                : participants.callerId;

            const otherSocketId = onlineUsers.get(otherUserId);
            if (otherSocketId) {
              this.server.to(otherSocketId).emit('call:ended', {
                callId,
                reason: 'peer_disconnected',
              });
            }

            // cleanup
            await this.callService.endCall(callId);
            activeCalls.delete(callId);
          }
        }

        // broadcast user offline
        client.broadcast.emit('user:offline', { userId: disconnectedUserId });
      }
    } catch (error) {
      this.logger.error('Disconnect error:', error);
    }
  }

  // event 1: khởi tạo cuộc gọi
  @SubscribeMessage('call:initiate')
  async handleCallInitiate(
    @MessageBody() data: CallInitiateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const callerId = client.handshake.query.userId as string;
      const { conversationId, receiverId, callType, callerName, callerAvatar } =
        data;

      this.logger.log(
        `Call initiated by ${callerId} to ${receiverId} (${callType})`,
      );

      // kiểm tra receiver có online không
      const receiverSocketId = onlineUsers.get(receiverId);
      if (!receiverSocketId) {
        client.emit('call:error', {
          message: 'User is offline',
          code: 'USER_OFFLINE',
        });
        return;
      }

      // tạo call record trong database
      const call: CallDocument = await this.callService.createCall(
        conversationId,
        callType === 'video' ? CallType.ONE_TO_ONE : CallType.ONE_TO_ONE,
      );

      // Sử dụng MongoDB's _id thay vì callId
      const callId = call._id.toString();

      // lưu active call
      activeCalls.set(callId, { callerId, receiverId });

      // gửi notification đển receiver
      this.logger.log(
        `Sending call:incoming to ${receiverId} (socketId: ${receiverSocketId})`,
      );
      this.server.to(receiverSocketId).emit('call:incoming', {
        callId,
        callerId,
        conversationId,
        callType,
        callerName,
        callerAvatar,
      });
      this.logger.log(`Event call:incoming emitted successfully`);

      // confirm lại cho caller
      client.emit('call:initiated', {
        callId,
        receiverId,
        callType,
      });

      this.logger.log(`Call ${callId} initiated successfully`);
    } catch (error) {
      this.logger.error('Error initiating call:', error);
      client.emit('call:error', {
        message: 'Failed to initiate call',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // event 2: gửi WebRTC Offer
  @SubscribeMessage('call:offer')
  handleCallOffer(
    @MessageBody() data: CallOfferDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, receiverId, offer } = data;

      this.logger.log(`Offer sent for call ${callId}`);

      const receiverSocketId = onlineUsers.get(receiverId);
      if (!receiverSocketId) {
        client.emit('call:error', {
          callId,
          message: 'Receiver is offline',
        });
        return;
      }

      // forward offer đến receiver
      this.server.to(receiverSocketId).emit('call:offer', {
        callId,
        offer,
        callerId: client.handshake.query.userId,
      });
    } catch (error) {
      this.logger.error('Error sending offer:', error);
      client.emit('call:error', {
        message: 'Failed to send offer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // event 3: gửi WebRTC answer
  @SubscribeMessage('call:answer')
  handleCallAnswer(
    @MessageBody() data: CallAnswerDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, callerId, answer } = data;

      this.logger.log(`Answer sent for call ${callId}`);

      const callerSocketId = onlineUsers.get(callerId);
      if (!callerSocketId) {
        client.emit('call:error', {
          callId,
          message: 'Caller is offline',
        });
        return;
      }

      // forward answer đến caller
      this.server.to(callerSocketId).emit('call:answer', {
        callId,
        answer,
        receiverId: client.handshake.query.userId,
      });
    } catch (error) {
      this.logger.error('Error sending answer:', error);
      client.emit('call:error', {
        message: 'Failed to send answer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // event 4: trao đổi ICE candidates
  @SubscribeMessage('call:ice-candidate')
  handleIceCandidate(
    @MessageBody() data: IceCandidateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, candidate } = data;

      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) {
        return; // không cần báo lỗi, ice candidates có thể fail silent
      }

      // forward ICE candidate đến target user
      this.server.to(targetSocketId).emit('call:ice-candidate', {
        callId,
        candidate,
        fromUserId: client.handshake.query.userId,
      });
    } catch (error) {
      this.logger.error('Error handling ICE candidate:', error);
    }
  }

  // event 5: chấp nhận cuộc gọi
  @SubscribeMessage('call:accept')
  handleCallAccept(
    @MessageBody() data: CallActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId } = data;

      this.logger.log(`Call ${callId} accepted`);

      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        this.server.to(targetSocketId).emit('call:accept', {
          callId,
          receiverId: client.handshake.query.userId,
        });
      }
    } catch (error) {
      this.logger.error('Error accepting call:', error);
    }
  }

  // event 6: từ chối cuộc gọi
  @SubscribeMessage('call:reject')
  async handleCallReject(
    @MessageBody() data: CallActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId } = data;

      this.logger.log(`Call ${callId} rejected`);

      // Cleanup
      await this.callService.endCall(callId);
      activeCalls.delete(callId);

      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        this.server.to(targetSocketId).emit('call:reject', {
          callId,
          rejectedBy: client.handshake.query.userId,
        });
      }
    } catch (error) {
      this.logger.error('Error rejecting call:', error);
    }
  }

  // event 7: kết thúc cuộc gọi
  @SubscribeMessage('call:end')
  async handleCallEnd(
    @MessageBody() data: CallActionDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId } = data;

      this.logger.log(`Call ${callId} ended`);

      // update database
      await this.callService.endCall(callId);
      activeCalls.delete(callId);

      // notify target user
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        this.server.to(targetSocketId).emit('call:ended', {
          callId,
          endedBy: client.handshake.query.userId,
        });
      }
    } catch (error) {
      this.logger.error('Error ending call:', error);
    }
  }

  // event 8: toggle video/audio
  @SubscribeMessage('call:toggle-media')
  handleToggleMedia(
    @MessageBody() data: ToggleMediaDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, mediaType, enabled } = data;

      this.logger.log(
        `Call ${callId}: ${mediaType} ${enabled ? 'enabled' : 'disabled'}`,
      );

      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) {
        this.server.to(targetSocketId).emit('call:media-toggled', {
          callId,
          userId: client.handshake.query.userId,
          mediaType,
          enabled,
        });
      }
    } catch (error) {
      this.logger.error('Error toggling media:', error);
    }
  }
}
