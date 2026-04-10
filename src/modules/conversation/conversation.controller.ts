/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  async getAllByUser(@CurrentUser() user: JwtPayload) {
    if (!user?.userId) throw new BadRequestException('User ID is required');
    return this.conversationService.findAllByUserId(user.userId);
  }

  /**
   * Get or create a PRIVATE conversation with a friend
   * @route POST /conversations/private
   * @param recipientId ID của friend
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

  // ==================== Message Reactions ====================
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

  // ==================== Message Recall ====================
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

  // ==================== Message Delete ====================
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

  // ==================== Message Forward ====================
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

  // ==================== SECURITY FEATURES ====================

  /**
   * Cập nhật thời gian tự xóa tin nhắn cho conversation
   * @route PATCH /conversations/:conversationId/auto-delete-duration
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
   * Ẩn conversation bằng mật khẩu
   * @route POST /conversations/:conversationId/hide
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

  /**
   * Tiết lộ conversation bị ẩn bằng mật khẩu
   * @route POST /conversations/:conversationId/reveal
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
   * Xóa toàn bộ lịch sử chat cho user hiện tại (soft delete)
   * @route POST /conversations/:conversationId/clear-history
   */
  @Post(':conversationId/clear-history')
  async clearChatHistory(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.conversationService.clearChatHistory(
      conversationId,
      user.userId,
    );
  }

  /**
   * Chặn người dùng trong cuộc hội thoại
   * Chỉ áp dụng cho PRIVATE conversation (1:1 chat)
   * Tự động chặn người kia (vì PRIVATE conversation chỉ có 2 người)
   *
   * @route POST /conversations/:conversationId/block
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
   * Bỏ chặn người dùng trong cuộc hội thoại
   * Chỉ người chặn mới có thể bỏ chặn
   *
   * @route POST /conversations/:conversationId/unblock
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
   * Kiểm tra trạng thái chặn của conversation
   * Thông tin:
   * - isBlocked: có ai bị chặn trong conversation không
   * - blockedUserId: userId của người bị chặn (nếu có)
   * - blockedBy: userId của người chặn (nếu có)
   * - canUnblock: current user có thể bỏ chặn không (chỉ người chặn mới có thể bỏ chặn)
   * - disableCall: nếu current user bị chặn thì disable call/video features
   *
   * @route GET /conversations/:conversationId/block-status
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
      // ✅ Trạng thái chặn của conversation
      isBlocked: blockStatus.isBlocked,
      blockedUserId: blockStatus.blockedUserId, // UUID của người BỊ CHẶN
      blockedBy: blockStatus.blockedBy, // UUID của NGƯỜI CHẶN
      blockedAt: blockStatus.blockedAt,
      // ✅ Current user có thể bỏ chặn không (chỉ người chặn mới có thể)
      canUnblock:
        blockStatus.isBlocked && blockStatus.blockedBy === user.userId,
      // ✅ Current user bị chặn không (disable call/video features)
      iAmBlocked:
        blockStatus.isBlocked && blockStatus.blockedUserId === user.userId,
      // Backend helper cho FE
      iAmTheBlocker:
        blockStatus.isBlocked && blockStatus.blockedBy === user.userId,
    };
  }
}
