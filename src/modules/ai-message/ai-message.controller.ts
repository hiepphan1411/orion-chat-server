import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AIMessageService } from './ai-message.service';
import { AIMessageRole } from 'src/common/enums/ai-message-role.enum';

@Controller('ai-messages')
export class AIMessageController {
  constructor(private readonly messageService: AIMessageService) {}

  @Post()
  async createMessage(
    @Body()
    body: {
      sessionId: string;
      content: string;
      aiMessageRole: AIMessageRole;
      tokenUsed?: number;
    },
  ) {
    return this.messageService.createMessage(
      body.sessionId,
      body.content,
      body.aiMessageRole,
      body.tokenUsed,
    );
  }

  @Get('session/:sessionId')
  async getMessagesBySession(@Param('sessionId') sessionId: string) {
    return this.messageService.getMessagesBySession(sessionId);
  }

  @Get(':id')
  async getMessageById(@Param('id') id: string) {
    return this.messageService.getMessageById(id);
  }

  @Delete('session/:sessionId')
  async deleteMessagesBySession(@Param('sessionId') sessionId: string) {
    return this.messageService.deleteMessagesBySession(sessionId);
  }

  @Delete(':id')
  async deleteMessage(@Param('id') id: string) {
    return this.messageService.deleteMessage(id);
  }
}
