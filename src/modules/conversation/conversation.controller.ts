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
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import type { JwtPayload } from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { ChatGateway } from '../message/chat.gateway';
import { MessageService } from '../message/message.service';

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
  @Get(':conversationId')
  async getConversationDetail(
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') conversationId: string,
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
    @Param('conversationId') targetConversationId: string,
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
}
