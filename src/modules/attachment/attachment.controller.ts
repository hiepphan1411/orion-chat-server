import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AttachmentService } from './attachment.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { memoryStorage } from 'multer';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post('tasks/:taskId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file && !dto.fileUrl) {
      throw new BadRequestException('Provide either a file or fileUrl');
    }

    return this.attachmentService.create(taskId, dto, file, req.user?.userId);
  }

  @Get('tasks/:taskId/attachments')
  findByTask(@Param('taskId') taskId: string) {
    return this.attachmentService.findByTask(taskId);
  }

  @Delete('attachments/:id')
  remove(@Param('id') id: string) {
    return this.attachmentService.remove(id);
  }
}
