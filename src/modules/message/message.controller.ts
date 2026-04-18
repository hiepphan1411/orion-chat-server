/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { JwtPayload } from 'jsonwebtoken';
import { S3UploadService } from 'src/common/services/s3-upload.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ChatGateway } from './chat.gateway';
import { MessageService } from './message.service';
import { ChatMediaService } from './services/chat-media.service';
import { ChatMembershipService } from './services/chat-membership.service';

type CreatedMediaMessage = {
  _id: unknown;
  senderBy: string;
  content: string;
  messageType: string;
  createdAt: Date;
  clientMessageId?: string;
  replyToMessageId?: string;
  messageStatus?: string;
};

const MAX_FILES_PER_MESSAGE = 5;
const MAX_TOTAL_FILES_SIZE = 50 * 1024 * 1024;

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly s3UploadService: S3UploadService,
    private readonly chatGateway: ChatGateway,
    private readonly chatMediaService: ChatMediaService,
    private readonly chatMembershipService: ChatMembershipService,
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

  @Post(':messageId/recall')
  async recallMessage(
    @CurrentUser() user: JwtPayload,
    @Param('messageId') messageId: string,
  ) {
    if (!messageId) {
      throw new BadRequestException('messageId is required');
    }

    const handler = this.messageService as {
      recallMessageWithin24Hours: (payload: {
        messageId: string;
        userId: string;
      }) => Promise<{
        messageId: string;
        conversationId: string;
        revokedBy: string;
        revokedAt: string;
        recalled: boolean;
      }>;
    };

    const result = await handler.recallMessageWithin24Hours({
      messageId,
      userId: String(user.userId),
    });

    this.chatGateway.emitMessageRecalled({
      conversationId: result.conversationId,
      messageId: result.messageId,
      revokedBy: result.revokedBy,
      revokedAt: result.revokedAt,
    });

    return result;
  }

  @Post(':messageId/admin-delete')
  async adminDeleteMessage(
    @CurrentUser() user: JwtPayload,
    @Param('messageId') messageId: string,
  ) {
    if (!messageId) {
      throw new BadRequestException('messageId is required');
    }

    const handler = this.messageService as {
      adminDeleteMessageWithin24Hours: (payload: {
        messageId: string;
        userId: string;
      }) => Promise<{
        messageId: string;
        conversationId: string;
        deletedBy: string;
        deletedAt: string;
        deletedByAdmin: boolean;
      }>;
    };

    const result = await handler.adminDeleteMessageWithin24Hours({
      messageId,
      userId: String(user.userId),
    });

    const gateway = this.chatGateway as {
      emitMessageAdminDeleted: (payload: {
        conversationId: string;
        messageId: string;
        deletedBy: string;
        deletedAt: string;
      }) => void;
    };

    gateway.emitMessageAdminDeleted({
      conversationId: result.conversationId,
      messageId: result.messageId,
      deletedBy: result.deletedBy,
      deletedAt: result.deletedAt,
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
      messageType?: string;
    },
  ) {
    const userId = String(user?.userId || '');

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    await this.chatMembershipService.assertConversationMember(
      userId,
      body.conversationId,
    );

    this.chatMediaService.validateUpload(file);

    const keyPrefix = `chats/${body.conversationId}/${userId}`;

    const uploaded = await this.s3UploadService.uploadFile(file, keyPrefix);

    return this.chatMediaService.buildMediaMetadata({
      mediaUrl: uploaded.url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      preferredMessageType: body.messageType,
    });
  }

  @Post('upload-batch')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 5 },
    }),
  )
  async uploadForChatBatch(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      conversationId: string;
      messageType?: string;
    },
  ) {
    const userId = String(user?.userId || '');

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    await this.chatMembershipService.assertConversationMember(
      userId,
      body.conversationId,
    );

    const safeFiles = files || [];
    if (safeFiles.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    if (safeFiles.length > MAX_FILES_PER_MESSAGE) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_MESSAGE} files are allowed per message`,
      );
    }
    let totalFileSize = 0;
    for (const item of safeFiles) {
      this.chatMediaService.validateUpload(item);
      totalFileSize += item.size;
    }
    if (totalFileSize > MAX_TOTAL_FILES_SIZE) {
      throw new BadRequestException('Total upload size exceeds 50MB');
    }

    const keyPrefix = `chats/${body.conversationId}/${userId}`;
    const uploadedList = await this.s3UploadService.uploadFilesConcurrently(
      safeFiles,
      keyPrefix,
    );

    return {
      conversationId: body.conversationId,
      items: uploadedList.map((uploaded) => {
        const file = safeFiles[uploaded.index];
        return this.chatMediaService.buildMediaMetadata({
          mediaUrl: uploaded.url,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          preferredMessageType: body.messageType,
        });
      }),
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
      messageType?: string;
    },
  ) {
    const userId = String(user?.userId || '');

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    await this.chatMembershipService.assertConversationMember(
      userId,
      body.conversationId,
    );

    this.chatMediaService.validateUpload(file);

    const keyPrefix = `chats/${body.conversationId}/${userId}`;
    const uploaded = await this.s3UploadService.uploadFile(file, keyPrefix);

    return this.messageService.sendFileMessage({
      conversationId: body.conversationId,
      senderBy: userId,
      mediaUrl: uploaded.url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      preferredMessageType: body.messageType,
      clientMessageId: body.clientMessageId,
      replyToMessageId: body.replyToMessageId,
      content: body.content,
    });
  }

  @Post('send-files')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 5 },
    }),
  )
  async sendFiles(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      conversationId?: string;
      messageType?: string;
      content?: string;
      replyToMessageId?: string;
      clientMessageIdPrefix?: string;
    },
  ) {
    const userId = String(user?.userId || '');

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    if (!body?.conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    await this.chatMembershipService.assertConversationMember(
      userId,
      body.conversationId,
    );

    const safeFiles = files || [];
    if (safeFiles.length === 0) {
      throw new BadRequestException('At least one file is required');
    }
    if (safeFiles.length > MAX_FILES_PER_MESSAGE) {
      throw new BadRequestException(
        `Maximum ${MAX_FILES_PER_MESSAGE} files are allowed per message`,
      );
    }
    let totalFileSize = 0;
    for (const item of safeFiles) {
      this.chatMediaService.validateUpload(item);
      totalFileSize += item.size;
    }
    if (totalFileSize > MAX_TOTAL_FILES_SIZE) {
      throw new BadRequestException('Total upload size exceeds 50MB');
    }

    const keyPrefix = `chats/${body.conversationId}/${userId}`;
    const uploadedList = await this.s3UploadService.uploadFilesConcurrently(
      safeFiles,
      keyPrefix,
    );

    const created = (await Promise.all(
      uploadedList.map((uploaded) => {
        const file = safeFiles[uploaded.index];
        const idPrefix = body.clientMessageIdPrefix || 'batch';
        return this.messageService.sendFileMessage({
          conversationId: body.conversationId as string,
          senderBy: userId,
          mediaUrl: uploaded.url,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          preferredMessageType: body.messageType,
          content: body.content,
          replyToMessageId: body.replyToMessageId,
          clientMessageId: `${idPrefix}-${Date.now()}-${uploaded.index}`,
        });
      }),
    )) as CreatedMediaMessage[];

    for (const message of created) {
      this.chatGateway.emitNewMessage({
        conversationId: body.conversationId,
        messageId: String(message._id),
        senderBy: message.senderBy,
        content: message.content,
        messageType: message.messageType,
        createdAt: message.createdAt,
        clientMessageId: message.clientMessageId,
        replyToMessageId: message.replyToMessageId,
        messageStatus: message.messageStatus,
      });
    }

    return {
      conversationId: body.conversationId,
      count: created.length,
      items: created,
    };
  }
}
