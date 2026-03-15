import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post('tasks/:taskId/comments')
  create(@Param('taskId') taskId: string, @Body() dto: CreateCommentDto) {
    return this.commentService.create(taskId, dto);
  }

  @Get('tasks/:taskId/comments')
  findByTask(@Param('taskId') taskId: string) {
    return this.commentService.findByTask(taskId);
  }

  @Patch('comments/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.commentService.update(id, dto);
  }

  @Delete('comments/:id')
  remove(@Param('id') id: string) {
    return this.commentService.remove(id);
  }
}
