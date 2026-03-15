import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { AttachmentService } from './attachment.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @Post('tasks/:taskId/attachments')
  create(@Param('taskId') taskId: string, @Body() dto: CreateAttachmentDto) {
    return this.attachmentService.create(taskId, dto);
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
