import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { AIChatSessionService } from './ai-chat-sesstion.service';

@Controller('ai-sessions')
export class AIChatSessionController {
  constructor(private readonly sessionService: AIChatSessionService) {}

  @Post()
  async createSession(
    @Body()
    body: {
      userId: string;
      aiModel: string;
      systemPrompt?: string;
    },
  ) {
    return this.sessionService.createSession(
      body.userId,
      body.aiModel,
      body.systemPrompt,
    );
  }

  @Get('user/:userId')
  async getSessionsByUser(@Param('userId') userId: string) {
    return this.sessionService.getSessionsByUser(userId);
  }

  @Get(':id')
  async getSessionById(@Param('id') id: string) {
    return this.sessionService.getSessionById(id);
  }

  @Patch(':id')
  async updateSession(
    @Param('id') id: string,
    @Body() body: Partial<{ aiModel: string; systemPrompt: string }>,
  ) {
    return this.sessionService.updateSession(id, body);
  }

  @Delete(':id')
  async deleteSession(@Param('id') id: string) {
    return this.sessionService.deleteSession(id);
  }
}
