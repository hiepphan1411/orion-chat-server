/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessageType } from 'src/common/enums/message-type.enum';
import { S3UploadService } from 'src/common/services/s3-upload.service';
import { ChatGateway } from './chat.gateway';
import { MessageService } from './message.service';

@Controller('messages')
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
    @Body()
    body: {
      conversationId: string;
      senderBy: string;
      content: string;
      messageType?: string;
      replyToMessageId?: string;
      clientMessageId?: string;
      mediaUrl?: string;
      fileName?: string;
      fileSize?: number;
    },
  ) {
    return this.messageService.createMessage(body);
  }

  @Post('revoke-for-everyone')
  async revokeForEveryone(
    @Body()
    body: {
      messageId?: string;
      userId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    if (!body?.userId) {
      throw new BadRequestException('userId is required');
    }

    const result = await this.messageService.revokeMessageForEveryone({
      messageId: body.messageId,
      revokedBy: body.userId,
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
    @Body()
    body: {
      messageId?: string;
      userId?: string;
      emoji?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    if (!body?.userId) {
      throw new BadRequestException('userId is required');
    }

    if (!body?.emoji) {
      throw new BadRequestException('emoji is required');
    }

    const result = await this.messageService.reactToMessage({
      messageId: body.messageId,
      userId: body.userId,
      emoji: body.emoji,
      conversationId: body.conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId: result.conversationId,
      messageId: result.messageId,
      reactions: result.reactions,
      actedBy: body.userId,
      action: 'set',
      emoji: body.emoji,
    });

    return result;
  }

  @Post('emoji/remove')
  async removeReaction(
    @Body()
    body: {
      messageId?: string;
      userId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    if (!body?.userId) {
      throw new BadRequestException('userId is required');
    }

    const result = await this.messageService.removeReaction({
      messageId: body.messageId,
      userId: body.userId,
      conversationId: body.conversationId,
    });

    this.chatGateway.emitMessageReactionUpdated({
      conversationId: result.conversationId,
      messageId: result.messageId,
      reactions: result.reactions,
      actedBy: body.userId,
      action: 'remove',
    });

    return result;
  }

  @Post('delete-for-me')
  deleteForMe(
    @Body()
    body: {
      messageId?: string;
      userId?: string;
      conversationId?: string;
    },
  ) {
    if (!body?.messageId) {
      throw new BadRequestException('messageId is required');
    }

    if (!body?.userId) {
      throw new BadRequestException('userId is required');
    }

    return this.messageService.deleteMessageForMe({
      messageId: body.messageId,
      userId: body.userId,
      conversationId: body.conversationId,
    });
  }

  @Post('forward')
  forwardMessage(
    @Body()
    body: {
      sourceMessageId?: string;
      targetConversationId?: string;
      forwardedBy?: string;
      clientMessageId?: string;
      content?: string;
    },
  ) {
    if (!body?.sourceMessageId) {
      throw new BadRequestException('sourceMessageId is required');
    }

    if (!body?.targetConversationId) {
      throw new BadRequestException('targetConversationId is required');
    }

    if (!body?.forwardedBy) {
      throw new BadRequestException('forwardedBy is required');
    }

    return this.messageService.forwardMessage({
      sourceMessageId: body.sourceMessageId,
      targetConversationId: body.targetConversationId,
      forwardedBy: body.forwardedBy,
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
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      conversationId: string;
      senderBy?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const keyPrefix = body.senderBy
      ? `chats/${body.conversationId}/${body.senderBy}`
      : `chats/${body.conversationId}`;

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
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      conversationId?: string;
      senderBy?: string;
      clientMessageId?: string;
      replyToMessageId?: string;
      content?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    if (!body?.senderBy) {
      throw new BadRequestException('senderBy is required');
    }

    const keyPrefix = `chats/${body.conversationId}/${body.senderBy}`;
    const uploaded = await this.s3UploadService.uploadFile(file, keyPrefix);

    return this.messageService.sendFileMessage({
      conversationId: body.conversationId,
      senderBy: body.senderBy,
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
