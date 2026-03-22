import {
  Controller,
  Get,
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
}
