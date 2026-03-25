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
import { MessageService } from './message.service';

@Controller('messages')
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly s3UploadService: S3UploadService,
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

  private detectMessageType(mimeType: string): MessageType {
    if (mimeType.startsWith('image/')) return MessageType.IMAGE;
    if (mimeType.startsWith('video/')) return MessageType.VIDEO;
    if (mimeType.startsWith('audio/')) return MessageType.AUDIO;
    return MessageType.FILE;
  }
}
