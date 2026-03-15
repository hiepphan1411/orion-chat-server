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
import { SubTaskService } from './sub-task.service';
import { CreateSubTaskDto } from './dto/create-sub-task.dto';
import { UpdateSubTaskDto } from './dto/update-sub-task.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class SubTaskController {
  constructor(private readonly subTaskService: SubTaskService) {}

  @Post('tasks/:taskId/subtasks')
  create(@Param('taskId') taskId: string, @Body() dto: CreateSubTaskDto) {
    return this.subTaskService.create(taskId, dto);
  }

  @Get('tasks/:taskId/subtasks')
  findByTask(@Param('taskId') taskId: string) {
    return this.subTaskService.findByTask(taskId);
  }

  @Patch('subtasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSubTaskDto) {
    return this.subTaskService.update(id, dto);
  }

  @Delete('subtasks/:id')
  remove(@Param('id') id: string) {
    return this.subTaskService.remove(id);
  }
}
