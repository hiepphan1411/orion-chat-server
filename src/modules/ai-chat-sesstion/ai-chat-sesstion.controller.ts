import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AIChatSessionService } from './ai-chat-sesstion.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('ai-sessions')
@UseGuards(JwtAuthGuard)
export class AIChatSessionController {
  constructor(private readonly sessionService: AIChatSessionService) {}

  @Post()
  async createSession(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      aiModel?: string;
      systemPrompt?: string;
      title?: string;
    },
  ) {
    return this.sessionService.createSession(
      user.userId,
      body.aiModel || 'qwen2.5:7b',
      body.systemPrompt,
      body.title,
    );
  }

  @Get('me')
  async getMySessions(@CurrentUser() user: CurrentUserPayload) {
    return this.sessionService.getSessionsByUser(user.userId);
  }

  @Get('user/:userId')
  async getSessionsByUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('userId') userId: string,
  ) {
    if (user.userId !== userId) {
      return [];
    }
    return this.sessionService.getSessionsByUser(user.userId);
  }

  @Get(':id')
  async getSessionById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const session = await this.sessionService.getSessionById(id);
    if (!session) {
      return null;
    }
    if (session.userId !== user.userId) {
      throw new BadRequestException('You cannot access this session');
    }
    return session;
  }

  @Get(':id/messages')
  async getMessagesBySession(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sessionService.getMessagesBySession(id, user.userId);
  }

  @Post(':id/send')
  async sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      message?: string;
      attachment?: { mimeType: string; data: string };
    },
  ) {
    return this.sessionService.sendMessage(
      id,
      user.userId,
      body.message || '',
      body.attachment,
    );
  }

  @Patch(':id')
  async updateSession(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: Partial<{ aiModel: string; systemPrompt: string; title: string }>,
  ) {
    return this.sessionService.updateSession(id, user.userId, body);
  }

  @Delete(':id')
  async deleteSession(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.sessionService.deleteSession(id, user.userId);
  }
}
