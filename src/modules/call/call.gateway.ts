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
const activeCalls = new Map<string, { callerId: string; receiverId: string }>(); // callId -> {callerId, receiverId}
// Group call tracking
const activeGroupCalls = new Map<
  string,
  {
    initiatorId: string;
    participants: Set<string>;
    conversationId: string;
    callType: string;
    participantNames: Map<string, string>;
  }
>(); // callId -> group call info

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
  server!: Server;

  private logger = new Logger('CallGateway');

  // gửi sự kiện đến đúng các participant trong group call
  private emitToGroupParticipants(
    callId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const groupCall = activeGroupCalls.get(callId);
    if (!groupCall) {
      return;
    }

    for (const participantId of groupCall.participants) {
      const participantSocketId = onlineUsers.get(participantId);
      if (participantSocketId) {
        this.server.to(participantSocketId).emit(event, payload);
      }
    }
  }

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

  // event 9: gửi yêu cầu nâng cấp từ audio call lên video call
  @SubscribeMessage('call:request-video-upgrade')
  handleRequestVideoUpgrade(
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId } = data;
      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) return;

      this.server.to(targetSocketId).emit('call:video-upgrade-request', {
        callId,
        requesterId: client.handshake.query.userId,
      });
    } catch (error) {
      this.logger.error('Error requesting video upgrade:', error);
    }
  }

  // event 10: phản hồi yêu cầu nâng cấp video call
  @SubscribeMessage('call:respond-video-upgrade')
  handleRespondVideoUpgrade(
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
      accepted: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, accepted } = data;
      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) return;

      this.server.to(targetSocketId).emit('call:video-upgrade-response', {
        callId,
        responderId: client.handshake.query.userId,
        accepted,
      });
    } catch (error) {
      this.logger.error('Error responding video upgrade:', error);
    }
  }

  // ===================== GROUP CALL HANDLERS =====================

  // Group call event 1: initiate group call
  @SubscribeMessage('groupcall:initiate')
  async handleGroupCallInitiate(
    @MessageBody()
    data: {
      conversationId: string;
      participantIds: string[];
      participantNames?: Record<string, string>; // Map of userId -> userName
      callType: string;
      initiatorName: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const initiatorId = client.handshake.query.userId as string;
      const {
        conversationId,
        participantIds,
        participantNames,
        callType,
        initiatorName,
      } = data;

      this.logger.log(
        `Group call initiated by ${initiatorId} for ${participantIds.length} participants`,
      );

      // Generate callId
      const callId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Tạo group call record
      const call: CallDocument = await this.callService.createCall(
        conversationId,
        CallType.GROUP,
      );
      const groupCallId = call._id.toString();

      // Track active group call
      const participants = new Set([initiatorId, ...participantIds]);
      const participantNameMap = new Map<string, string>();

      // lưu tên participant để đồng bộ UI giữa web/mobile
      participantNameMap.set(
        initiatorId,
        initiatorName || `User ${initiatorId}`,
      );
      for (const id of participantIds) {
        participantNameMap.set(id, participantNames?.[id] || `User ${id}`);
      }

      activeGroupCalls.set(groupCallId, {
        initiatorId,
        participants,
        conversationId,
        callType,
        participantNames: participantNameMap,
      });

      // Prepare participants data - use real names if provided, fallback to generic names
      const participantsPayload = [
        {
          id: initiatorId,
          name: participantNameMap.get(initiatorId) || `User ${initiatorId}`,
          isHost: true,
        },
        ...participantIds.map((id) => ({
          id,
          name: participantNameMap.get(id) || `User ${id}`,
          isHost: false,
        })),
      ];

      this.logger.log(`Participants data:`, participantsPayload);

      // Send call:initiated acknowledgment to initiator
      client.emit('groupcall:initiated', {
        callId: groupCallId,
        participants: participantsPayload,
      });

      // Send incoming call notifications to all participants
      for (const participantId of participantIds) {
        const participantSocketId = onlineUsers.get(participantId);
        if (participantSocketId) {
          // Include all participant data (excluding themselves for client-side filtering)
          this.server.to(participantSocketId).emit('groupcall:incoming', {
            callId: groupCallId,
            conversationId,
            callType,
            initiatorId,
            initiatorName,
            participants: participantsPayload,
            participantCount: participantsPayload.length,
          });
        }
      }

      this.logger.log(`Group call ${groupCallId} initiated successfully`);
    } catch (error) {
      this.logger.error('Error initiating group call:', error);
      client.emit('groupcall:error', {
        message: 'Failed to initiate group call',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Group call event 2: join group call
  @SubscribeMessage('groupcall:join')
  handleGroupCallJoin(
    @MessageBody()
    data: { callId: string; conversationId: string; userName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.handshake.query.userId as string;
      const { callId } = data;

      const groupCall = activeGroupCalls.get(callId);
      if (!groupCall) {
        client.emit('groupcall:error', {
          callId,
          message: 'Group call not found',
        });
        return;
      }

      // Add user to participants + lưu tên để broadcast đồng bộ
      groupCall.participants.add(userId);
      groupCall.participantNames.set(
        userId,
        data.userName ||
          groupCall.participantNames.get(userId) ||
          `User ${userId}`,
      );

      this.logger.log(`User ${userId} joined group call ${callId}`);

      // Notify all participants that someone joined
      const participantsList = Array.from(groupCall.participants).map((id) => ({
        id,
        name: groupCall.participantNames.get(id) || `User ${id}`,
      }));

      // chỉ broadcast trong nhóm hiện tại
      this.emitToGroupParticipants(callId, 'groupcall:participant-joined', {
        callId,
        userId,
        userName: groupCall.participantNames.get(userId) || `User ${userId}`,
        isHost: groupCall.initiatorId === userId,
        participants: participantsList,
      });
    } catch (error) {
      this.logger.error('Error joining group call:', error);
      client.emit('groupcall:error', {
        message: 'Failed to join group call',
      });
    }
  }

  // Group call event 3: send offer
  @SubscribeMessage('groupcall:offer')
  handleGroupCallOffer(
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
      offer: RTCSessionDescription;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, offer } = data;
      const senderId = client.handshake.query.userId as string;

      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) {
        return;
      }

      this.server.to(targetSocketId).emit('groupcall:offer', {
        callId,
        callerId: senderId,
        targetUserId,
        offer,
      });
    } catch (error) {
      this.logger.error('Error sending group call offer:', error);
    }
  }

  // Group call event 4: send answer
  @SubscribeMessage('groupcall:answer')
  handleGroupCallAnswer(
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
      answer: RTCSessionDescription;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, answer } = data;
      const senderId = client.handshake.query.userId as string;

      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) {
        return;
      }

      this.server.to(targetSocketId).emit('groupcall:answer', {
        callId,
        responderId: senderId,
        targetUserId,
        answer,
      });
    } catch (error) {
      this.logger.error('Error sending group call answer:', error);
    }
  }

  // Group call event 5: send ICE candidate
  @SubscribeMessage('groupcall:ice-candidate')
  handleGroupCallIceCandidate(
    @MessageBody()
    data: {
      callId: string;
      targetUserId: string;
      candidate: RTCIceCandidate;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, targetUserId, candidate } = data;
      const fromUserId = client.handshake.query.userId as string;

      const targetSocketId = onlineUsers.get(targetUserId);
      if (!targetSocketId) {
        return;
      }

      this.server.to(targetSocketId).emit('groupcall:ice-candidate', {
        callId,
        fromUserId,
        candidate,
      });
    } catch (error) {
      this.logger.error('Error sending group call ICE candidate:', error);
    }
  }

  // Group call event 6: toggle media
  @SubscribeMessage('groupcall:toggle-media')
  handleGroupCallToggleMedia(
    @MessageBody()
    data: {
      callId: string;
      mediaType: 'audio' | 'video';
      enabled: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { callId, mediaType, enabled } = data;
      const userId = client.handshake.query.userId as string;

      const groupCall = activeGroupCalls.get(callId);
      if (!groupCall) {
        return;
      }

      // chỉ broadcast trong nhóm hiện tại để tránh nhiễu call khác
      this.emitToGroupParticipants(callId, 'groupcall:media-toggled', {
        callId,
        userId,
        mediaType,
        enabled,
      });
    } catch (error) {
      this.logger.error('Error toggling group call media:', error);
    }
  }

  // Group call event 7: leave group call
  @SubscribeMessage('groupcall:leave')
  async handleGroupCallLeave(
    @MessageBody() data: { callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.handshake.query.userId as string;
      const { callId } = data;

      const groupCall = activeGroupCalls.get(callId);
      if (!groupCall) {
        return;
      }

      // Remove participant
      groupCall.participants.delete(userId);

      // Notify remaining participants (not globally)
      const remainingParticipants = Array.from(groupCall.participants);
      for (const participantId of remainingParticipants) {
        const participantSocketId = onlineUsers.get(participantId);
        if (participantSocketId) {
          this.server
            .to(participantSocketId)
            .emit('groupcall:participant-left', {
              callId,
              userId,
              participantName:
                groupCall.participantNames.get(userId) || `User ${userId}`,
            });
        }
      }

      // If no participants left, cleanup
      if (groupCall.participants.size === 0) {
        activeGroupCalls.delete(callId);
        await this.callService.endCall(callId);
      }
    } catch (error) {
      this.logger.error('Error leaving group call:', error);
    }
  }

  // Group call event 8: end group call (only host)
  @SubscribeMessage('groupcall:end')
  async handleGroupCallEnd(
    @MessageBody() data: { callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.handshake.query.userId as string;
      const { callId } = data;

      const groupCall = activeGroupCalls.get(callId);
      if (!groupCall) {
        return;
      }

      // Only initiator can end call
      if (groupCall.initiatorId !== userId) {
        client.emit('groupcall:error', {
          callId,
          message: 'Only host can end group call',
        });
        return;
      }

      // Notify all participants in this group call (not globally)
      const allParticipants = Array.from(groupCall.participants);
      for (const participantId of allParticipants) {
        const participantSocketId = onlineUsers.get(participantId);
        if (participantSocketId) {
          this.server.to(participantSocketId).emit('groupcall:ended', {
            callId,
            endedBy: userId,
            reason: 'host_ended',
          });
        }
      }

      // Cleanup
      activeGroupCalls.delete(callId);
      await this.callService.endCall(callId);
    } catch (error) {
      this.logger.error('Error ending group call:', error);
    }
  }
}
