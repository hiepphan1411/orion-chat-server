/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { JwtPayload } from 'jsonwebtoken';
import { MessageType } from 'src/common/enums/message-type.enum';
import { S3UploadService } from 'src/common/services/s3-upload.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ChatGateway } from './chat.gateway';
import { MessageService } from './message.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly s3UploadService: S3UploadService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get()
  findAll() {
    return this.messageService.findAll();
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      conversationId: string;
      content: string;
      messageType?: string;
      replyToMessageId?: string;
      clientMessageId?: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
    },
  ) {
    if (!body?.conversationId)
      throw new BadRequestException('conversationId is required');
    if (!body?.content?.trim())
      throw new BadRequestException('content is required');

    return this.messageService.createMessage({
      conversationId: body.conversationId,
      senderBy: user.userId,
      content: body.content.trim(),
      messageType: body.messageType,
      replyToMessageId: body.replyToMessageId,
      clientMessageId: body.clientMessageId,
      mediaUrl: body.mediaUrl,
      fileName: body.fileName,
      fileSize: body.fileSize,
    });
  }

  @Post('revoke-for-everyone')
  async revokeForEveryone(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      messageId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    const result = await this.messageService.revokeMessageForEveryone({
      messageId: body.messageId,
      revokedBy: user.userId,
      conversationId: body.conversationId,
    });

    this.chatGateway.emitMessageRecalled({
      conversationId: result.conversationId,
      messageId: result.messageId,
      revokedBy: result.revokedBy,
      revokedAt: result.revokedAt,
    });

    return result;
  }

  @Post('emoji')
  async reactToMessage(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      messageId?: string;
      emoji?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    if (!body?.emoji) {
      throw new BadRequestException('emoji is required');
    }

    const result = await this.messageService.reactToMessage({
      messageId: body.messageId,
      userId: user.userId,
      emoji: body.emoji,
      conversationId: body.conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId: result.conversationId,
      messageId: result.messageId,
      reactions: result.reactions,
      actedBy: user.userId,
      action: 'set',
      emoji: body.emoji,
    });

    return result;
  }

  @Post('emoji/remove')
  async removeReaction(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      messageId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    const result = await this.messageService.removeReaction({
      messageId: body.messageId,
      userId: user.userId,
      conversationId: body.conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId: result.conversationId,
      messageId: result.messageId,
      reactions: result.reactions,
      actedBy: user.userId,
      action: 'remove',
    });

    return result;
  }

  @Post('delete-for-me')
  deleteForMe(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      messageId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    return this.messageService.deleteMessageForMe({
      messageId: body.messageId,
      userId: user.userId,
      conversationId: body.conversationId,
    });
  }

  @Post('forward')
  forwardMessage(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      sourceMessageId?: string;
      targetConversationId?: string;
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

    if (!body?.targetConversationId) {
      throw new BadRequestException('targetConversationId is required');
    }

    return this.messageService.forwardMessage({
      sourceMessageId: body.sourceMessageId,
      targetConversationId: body.targetConversationId,
      forwardedBy: user.userId,
      clientMessageId: body.clientMessageId,
      content: body.content,
    });
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async uploadForChat(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      conversationId: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const keyPrefix = `chats/${body.conversationId}/${user.userId}`;

    const uploaded = await this.s3UploadService.uploadFile(file, keyPrefix);

    return {
      mediaUrl: uploaded.url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      messageType: this.detectMessageType(file.mimetype),
    };
  }

  @Post('send-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async sendFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      conversationId?: string;
      clientMessageId?: string;
      replyToMessageId?: string;
      content?: string;
    },
  ) {
    if (!user?.userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const keyPrefix = `chats/${body.conversationId}/${user.userId}`;
    const uploaded = await this.s3UploadService.uploadFile(file, keyPrefix);

    return this.messageService.sendFileMessage({
      conversationId: body.conversationId,
      senderBy: user.userId,
      mediaUrl: uploaded.url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      clientMessageId: body.clientMessageId,
      replyToMessageId: body.replyToMessageId,
      content: body.content,
    });
  }

  private detectMessageType(mimeType: string): MessageType {
    if (mimeType.startsWith('image/')) return MessageType.IMAGE;
    if (mimeType.startsWith('video/')) return MessageType.VIDEO;
    if (mimeType.startsWith('audio/')) return MessageType.AUDIO;
    return MessageType.FILE;
  }
}
