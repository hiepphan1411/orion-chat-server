import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async getAllByUser(@Query('userId') userId?: string) {
    if (!userId) throw new BadRequestException('userId is required');
    return this.conversationService.findAllByUserId(userId);
  }
  @Get(':conversationId')
  async getConversationDetail(
    @Param('conversationId') conversationId: string,
    @Query('userId') userId?: string,
  ) {
    if (!userId) throw new BadRequestException('userId is required');
    return this.conversationService.findDetailById(conversationId, userId);
  }

  @Get(':conversationId/messages')
  getConversationMessages(
    @Param('conversationId') conversationId: string,
    @Query('userId') userId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) throw new BadRequestException('userId is required');
    return this.conversationService.getMessagesByConversation(
      conversationId,
      userId,
      cursor,
      limit ? Number(limit) : 30,
    );
  }

  @Post(':conversationId/messages')
  createConversationMessage(
    @Param('conversationId') conversationId: string,
    @Body()
    body: {
      userId?: string;
      senderBy?: string;
      content?: string;
      messageType?: string;
      replyToMessageId?: string;
      clientMessageId?: string;
    },
  ) {
    if (!body?.senderBy) {
      throw new BadRequestException('senderBy is required');
    }

    if (!body?.content) {
      throw new BadRequestException('content is required');
    }

    const actorUserId = body.userId || body.senderBy;

    return this.conversationService.createMessageInConversation(
      conversationId,
      actorUserId,
      {
        senderBy: body.senderBy,
        content: body.content,
        messageType: body.messageType,
        replyToMessageId: body.replyToMessageId,
        clientMessageId: body.clientMessageId,
      },
    );
  }
}
