/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
  Param,
  Delete,
  Patch,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { ChatGateway } from '../message/chat.gateway';
import { MessageService } from '../message/message.service';
import { UpdateAutoDeleteDTO } from './dto/update-auto-delete.dto';
import {
  HideConversationDTO,
  RevealConversationDTO,
} from './dto/hide-conversation.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CONVERSATION MANAGEMENT - Lấy/Tạo conversations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lấy danh sách all conversations của user hiện tại
   *
   * @route GET /conversations
   * @returns {ConversationResponse[]} Mảng các conversations (private + group)
   *
   * Response fields:
   * - conversationId: UUID của conversation
   * - type: "PRIVATE" hoặc "GROUP"
   * - participants: Danh sách participants
   * - lastMessage: Tin nhắn cuối (nếu có)
   * - blockStatus: Trạng thái block
   */
  @Get()
  async getAllByUser(@CurrentUser() user: JwtPayload) {
    if (!user?.userId) throw new BadRequestException('User ID is required');
    return this.conversationService.findAllByUserId(user.userId);
  }

  @Post()
  async createConversation(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateConversationDto,
  ) {
    const currentUserId = String(user?.userId || '');

    if (!currentUserId) {
      throw new BadRequestException('User ID is required');
    }

    if (!body?.type) {
      throw new BadRequestException('type is required');
    }

    if (body.type === 'PRIVATE') {
      if (!body.recipientId) {
        throw new BadRequestException('recipientId is required for PRIVATE');
      }

      return this.conversationService.getOrCreatePrivateConversation(
        currentUserId,
        body.recipientId,
      );
    }

    const groupHandler = this.conversationService as {
      createGroupConversation: (payload: {
        creatorId: string;
        groupName: string;
        memberIds?: string[];
        memberNicknames?: Array<{ userId: string; nickname?: string }>;
      }) => Promise<unknown>;
    };

    const conversation = await groupHandler.createGroupConversation({
      creatorId: currentUserId,
      groupName: String(body.groupName || ''),
      memberIds: body.memberIds,
      memberNicknames: body.memberNicknames,
    });

    // Emit group created event to all members
    if (conversation && typeof conversation === 'object') {
      const conv = conversation as any;
      if (conv.conversationId && conv.participants) {
        const memberIds = conv.participants.map((p: any) => p.userId);
        this.chatGateway.emitGroupCreated({
          groupId: conv.conversationId,
          groupName: conv.groupInfo?.groupName || '',
          createdBy: currentUserId,
          memberIds,
        });
      }
    }

    return conversation;
  }

  /**
   * Lấy HOẶC TẠO mới PRIVATE conversation (1:1 chat) với một bạn bè
   *
   * @route POST /conversations/private
   * @param {string} recipientId UUID của friend muốn chat với
   * @returns {ConversationResponse} Conversation object
   *
   * Response fields:
   * - conversationId
   * - type: "PRIVATE" TODO: luôn là private conversation
   * - participants: 2 users với full info (userId, fullName, avatarUrl, etc)
   * - lastMessage: Tin nhắn cuối (nếu có)
   * - blockStatus: Thông tin block (quan trọng cho security)
   * - canUnblock: Có thể bỏ block không
   */
  @Post('private')
  async getOrCreatePrivateConversation(
    @CurrentUser() user: JwtPayload,
    @Body('recipientId') recipientId: string,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!recipientId) {
      throw new BadRequestException('recipientId is required');
    }

    try {
      return await this.conversationService.getOrCreatePrivateConversation(
        user.userId,
        recipientId,
      );
    } catch (error) {
      console.error('=== ERROR getOrCreatePrivateConversation ===');
      console.error(error);
      throw error;
    }
  }

  /**
   * Lấy chi tiết MỘT conversation (bao gồm block status, settings, etc)
   *
   * @route GET /conversations/:conversationId
   * @param {string} conversationId UUID của conversation
   * @returns {ConversationResponse} Chi tiết conversation + trạng thái của current user
   *
   */
  @Get(':conversationId')
  async getConversationDetail(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User not found in token');
    }
    try {
      return await this.conversationService.findDetailById(
        conversationId,
        user.userId,
      );
    } catch (error) {
      console.error('=== ERROR getConversationDetail ===');
      console.error(error);
      throw error; // giữ nguyên để NestJS xử lý
    }
  }

  /**
   * Lấy danh sách TIN NHẮN trong một conversation (pagination)
   *
   * @route GET /conversations/:conversationId/messages?limit=50&cursor=lastMessageId
   * @param {string} conversationId
   * @param {string} cursor Message ID
   * @param {string} limit Số tin nhắn muốn lấy (default = 30)
   * @returns {MessageResponse[]} Mảng tin nhắn
   *
   * Message response fields:
   * - messageId / _id: UUID của message
   * - senderBy: UUID của người gửi
   * - content: Nội dung tin nhắn
   * - messageType: "TEXT" | "IMAGE" | etc
   * - messageStatus: "SENT" | "READ" | etc
   * - createdAt: Timestamp
   */
  @Get(':conversationId/messages')
  async getConversationMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }
    try {
      return await this.conversationService.getMessagesByConversation(
        conversationId,
        user.userId,
        cursor,
        limit ? Number(limit) : 30,
      );
    } catch (error) {
      console.error('=== ERROR getMessagesByConversation ===');
      console.error(error);
      throw error;
    }
  }

  @Get(':conversationId/media')
  async getConversationMedia(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.messageService.getConversationMedia({
      conversationId,
      userId: user.userId,
      cursor,
      limit: limit ? Number(limit) : 30,
    });
  }

  /**
   * Gửi TIN NHẮN mới trong conversation (REST API fallback)
   *
   * Note: Frontend nên dùng WebSocket (socket.io) cho real-time
   *          Endpoint này là fallback khi WebSocket chưa sẵn sàng
   *
   * Luồng:
   * 1. Server lưu message vào MongoDB
   * 2. Server trả về response với messageId (server-side ID)
   * 3. Server emit real-time event qua WebSocket cho tất cả users trong conversation
   *
   * @route POST /conversations/:conversationId/messages
   * @param {string} conversationId UUID của conversation
   * @param {string} content Nội dung tin nhắn (bắt buộc)
   * @param {string} messageType "TEXT" | "IMAGE" | "FILE" (default = "TEXT")
   * @param {string} clientMessageId UUID tạo bởi client (cho tracking)
   * @returns {MessageResponse} Tin nhắn vừa tạo
   *
   * Response:
   * - messageId: Server ID (frontend update local ID thành cái này)
   * - senderBy: UUID người gửi
   * - content: Nội dung
   * - createdAt: Timestamp server
   */
  @Post(':conversationId/messages')
  async createConversationMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      content?: string;
      messageType?: string;
      replyToMessageId?: string;
      clientMessageId?: string;
    },
  ) {
    if (!body?.content) {
      throw new BadRequestException('content is required');
    }
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const message = await this.conversationService.createMessageInConversation(
      conversationId,
      user.userId,
      {
        senderBy: user.userId,
        content: body.content,
        messageType: body.messageType,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
      },
    );

    // Emit real-time event để notify users trong conversation
    this.chatGateway.emitNewMessage({
      conversationId,
      messageId: String(message._id),
      senderBy: message.senderBy ?? '',
      content: message.content ?? '',
      messageType: message.messageType,
      createdAt: message.createdAt,
      clientMessageId: message.clientMessageId,
      replyToMessageId: message.replyToMessageId,
      messageStatus: message.messageStatus,
    });

    return message;
  }

  /**
   * Pin một tin nhắn quan trọng trong conversation
   * @route POST /conversations/:conversationId/messages/:messageId/pin
   */
  @Post(':conversationId/messages/:messageId/pin')
  async pinMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.messageService.pinMessage({
      conversationId,
      messageId,
      userId: user.userId,
    });
  }

  /**
   * Gỡ pin tin nhắn trong conversation
   * @route DELETE /conversations/:conversationId/messages/:messageId/pin
   */
  @Delete(':conversationId/messages/:messageId/pin')
  async unpinMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.messageService.unpinMessage({
      conversationId,
      messageId,
      userId: user.userId,
    });
  }

  /**
   * Lấy danh sách tin nhắn đang được pin
   * @route GET /conversations/:conversationId/pinned-messages
   */
  @Get(':conversationId/pinned-messages')
  async getPinnedMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.messageService.getPinnedMessages(conversationId, user.userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE REACTIONS - Thêm/xóa emoji reaction
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Thêm EMOJI reaction cho một tin nhắn
   *
   * @route POST /conversations/:conversationId/messages/:messageId/reactions
   * @param {string} emoji
   * @returns {reactions[]} Danh sách tất cả reactions trên message đó
   */
  @Post(':conversationId/messages/:messageId/reactions')
  async reactToMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { emoji: string },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }
    if (!body?.emoji) {
      throw new BadRequestException('emoji is required');
    }

    const result = await this.messageService.reactToMessage({
      messageId,
      userId: user.userId,
      emoji: body.emoji,
      conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId,
      messageId,
      reactions: result.reactions,
      actedBy: user.userId,
      action: 'set',
      emoji: body.emoji,
    });

    return result;
  }

  /**
   * XÓA reaction của bạn khỏi một tin nhắn
   *
   * @route DELETE /conversations/:conversationId/messages/:messageId/reactions
   */
  @Delete(':conversationId/messages/:messageId/reactions')
  async removeReaction(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.messageService.removeReaction({
      messageId,
      userId: user.userId,
      conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId,
      messageId,
      reactions: result.reactions,
      actedBy: user.userId,
      action: 'remove',
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE MANAGEMENT - Recall, Delete, Forward
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * THU HỒI tin nhắn (xóa cho TẤT CẢ users)
   *
   * Constraint: Chỉ người gửi mới có thể thu hồi + trong 5 phút
   *
   * @route POST /conversations/:conversationId/messages/:messageId/recall
   * @returns {success: boolean}
   */
  @Post(':conversationId/messages/:messageId/recall')
  async recallMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.messageService.revokeMessageForEveryone({
      messageId,
      revokedBy: user.userId,
      conversationId,
    });

    this.chatGateway.emitMessageRecalled({
      conversationId,
      messageId,
      revokedBy: user.userId,
      revokedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * XÓA tin nhắn CHỈ cho bản thân (hide message)
   *
   * Khác với RECALL:
   * - Delete: Chỉ bạn không thấy nó (soft delete)
   * - Recall: Tất cả users không thấy nó (hard delete)
   *
   * @route DELETE /conversations/:conversationId/messages/:messageId
   * @returns {success: boolean}
   */
  @Delete(':conversationId/messages/:messageId')
  async deleteMessage(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.messageService.deleteMessageForMe({
      messageId,
      userId: user.userId,
      conversationId,
    });

    return result;
  }

  /**
   * FORWARD tin nhắn từ conversation này sang conversation khác
   *
   * @route POST /conversations/:conversationId/messages/forward
   * @param {string} sourceMessageId Message ID cần forward (từ conversation khác)
   * @param {string} content Nội dung append thêm (optional)
   * @returns {MessageResponse} Tin nhắn forward mới
   */
  @Post(':conversationId/messages/forward')
  async forwardMessage(
    @Param('conversationId', ParseUUIDPipe) targetConversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      sourceMessageId: string;
      clientMessageId?: string;
      content?: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }
    if (!body?.sourceMessageId) {
      throw new BadRequestException('sourceMessageId is required');
    }

    const result = await this.messageService.forwardMessage({
      sourceMessageId: body.sourceMessageId,
      targetConversationId,
      forwardedBy: user.userId,
      clientMessageId: body.clientMessageId,
      content: body.content,
    });

    this.chatGateway.emitNewMessage({
      conversationId: targetConversationId,
      messageId: result.messageId,
      senderBy: user.userId,
      content: result.content ?? '',
      messageType: result.messageType,
      createdAt: result.createdAt,
      clientMessageId: result.clientMessageId,
      messageStatus: 'SENT',
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY FEATURES - Auto-delete, Hide, Block/Unblock
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cập nhật TIME TỰ XÓA tin nhắn cho conversation
   *
   * Ứng dụng: Conversation bảo mật (disappearing messages)
   * Khi enable: Tin nhắn sẽ tự xóa sau X giây
   *
   * @route PATCH /conversations/:conversationId/auto-delete-duration
   * @param {number} autoDeleteDuration Thời gian tính bằng giây (0 = disable)
   */
  @Patch(':conversationId/auto-delete-duration')
  async updateAutoDeleteDuration(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAutoDeleteDTO,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.updateAutoDeleteDuration(
      conversationId,
      user.userId,
      dto.autoDeleteDuration,
    );
  }

  /**
   * ẨN conversation bằng mật khẩu
   *
   * @route POST /conversations/:conversationId/hide
   * @param {string} password Mật khẩu để ẩn
   */
  @Post(':conversationId/hide')
  async hideConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: HideConversationDTO,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.hideConversation(
      conversationId,
      user.userId,
      dto.password,
    );
  }

  @Patch(':conversationId/hidden')
  updateHiddenConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { hidden?: boolean },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    if (typeof body?.hidden !== 'boolean') {
      throw new BadRequestException('hidden must be boolean');
    }

    const handler = this.conversationService as {
      setConversationHidden: (
        conversationId: string,
        userId: string,
        hidden: boolean,
      ) => Promise<unknown>;
    };

    const userId = String(user.userId);

    const resultPromise = handler.setConversationHidden(
      conversationId,
      userId,
      body.hidden,
    );

    return resultPromise.then((result) => {
      const updatedAt =
        typeof result === 'object' && result && 'updatedAt' in result
          ? String(
              (result as { updatedAt?: string }).updatedAt ||
                new Date().toISOString(),
            )
          : new Date().toISOString();

      this.chatGateway.emitConversationHiddenUpdated({
        conversationId,
        userId,
        hidden: body.hidden as boolean,
        updatedAt,
      });

      return result;
    });
  }

  /**
   * MỞ KHÓA conversation (tiết lộ sau khi ẩn)
   *
   * @route POST /conversations/:conversationId/reveal
   * @param {string} password Mật khẩu để mở khóa
   */
  @Post(':conversationId/reveal')
  async revealConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RevealConversationDTO,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.revealConversation(
      conversationId,
      user.userId,
      dto.password,
    );
  }

  /**
   * XÓA TOÀN BỘ lịch sử chat (chỉ cho bản thân)
   *
   * Chú ý: Chỉ soft delete - tin nhắn vẫn có trong DB (tồn tại cho người khác)
   *
   * @route POST /conversations/:conversationId/clear-history
   * @returns {success: boolean}
   */
  @Post(':conversationId/clear-history')
  async clearChatHistory(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.conversationService.clearChatHistory(
      conversationId,
      user.userId,
    );

    this.chatGateway.emitConversationHistoryCleared({
      conversationId,
      userId: String(user.userId),
      deletedMessagesCount:
        typeof result?.deletedMessagesCount === 'number'
          ? result.deletedMessagesCount
          : 0,
      clearedAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * CHẶN người dùng trong conversation
   *
   * Chỉ áp dụng cho PRIVATE conversation (1:1 chat):
   * - Chặn: Không nhận được tin nhắn từ người bị chặn
   * - Người bị chặn vẫn có thể nhắn nhưng tin nhắn sẽ bị mute
   *
   * @route POST /conversations/:conversationId/block
   * @returns {blockStatus} Trạng thái block sau khi chặn
   */
  @Post(':conversationId/block')
  async blockUser(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.blockUserInConversation(
      conversationId,
      user.userId,
    );
  }

  /**
   * BỎ CHẶN người dùng (unblock)
   *
   * Constraint: Chỉ NGƯỜI CHẶN mới có thể bỏ chặn
   *
   * @route POST /conversations/:conversationId/unblock
   * @returns {blockStatus} Trạng thái block sau khi bỏ chặn
   */
  @Post(':conversationId/unblock')
  async unblockUser(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.unblockUserInConversation(
      conversationId,
      user.userId,
    );
  }

  /**
   * KIỂM TRA trạng thái block của conversation
   *
   * Response fields:
   * - isBlocked: Có ai bị chặn trong conversation không
   * - blockedUserId: UUID của NGƯỜI BỊ CHẶN (nếu có)
   * - blockedBy: UUID của NGƯỜI CHẶN (nếu có)
   * - canUnblock: Current user có thể bỏ chặn không? (chỉ người chặn mới có thể)
   * - iAmBlocked: Current user bị chặn không? (dùng để disable call/video)
   * - iAmTheBlocker: Current user là người chặn không?
   *
   * @route GET /conversations/:conversationId/block-status
   * @returns {blockStatus} Chi tiết trạng thái block
   */
  @Get(':conversationId/block-status')
  async getMyBlockStatus(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    const membership = await this.conversationService.findDetailById(
      conversationId,
      user.userId,
    );

    if (!membership) {
      throw new NotFoundException('Conversation not found');
    }

    const blockStatus = membership.blockStatus;

    return {
      conversationId,
      // Trạng thái chặn của conversation
      isBlocked: blockStatus.isBlocked,
      blockedUserId: blockStatus.blockedUserId, // UUID của người BỊ CHẶN
      blockedBy: blockStatus.blockedBy, // UUID của NGƯỜI CHẶN
      blockedAt: blockStatus.blockedAt,
      // Current user có thể bỏ chặn không (chỉ người chặn mới có thể)
      canUnblock:
        blockStatus.isBlocked && blockStatus.blockedBy === user.userId,
      // Current user bị chặn không (disable call/video features)
      iAmBlocked:
        blockStatus.isBlocked && blockStatus.blockedUserId === user.userId,
      // Backend helper cho FE
      iAmTheBlocker:
        blockStatus.isBlocked && blockStatus.blockedBy === user.userId,
    };
  }

  // ==================== PIN CONVERSATION ====================

  /**
   * Ghim cuộc hội thoại lên đầu danh sách
   * Cuộc hội thoại được ghim sau sẽ hiển thị trên (dựa theo pinnedAt timestamp)
   * @route POST /conversations/:conversationId/pin
   */
  @Post(':conversationId/pin')
  async pinConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return await this.conversationService.pinConversation(
      conversationId,
      user.userId,
    );
  }

  /**
   * Bỏ ghim cuộc hội thoại
   * @route POST /conversations/:conversationId/unpin
   */
  @Post(':conversationId/unpin')
  async unpinConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return await this.conversationService.unpinConversation(
      conversationId,
      user.userId,
    );
  }
}
