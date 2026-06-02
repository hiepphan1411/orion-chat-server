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
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto, MoveTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('boards/:boardId/tasks')
  create(@Param('boardId') boardId: string, @Body() dto: CreateTaskDto) {
    return this.taskService.create(boardId, dto);
  }

  @Get('boards/:boardId/tasks')
  findByBoard(@Param('boardId') boardId: string) {
    return this.taskService.findByBoard(boardId);
  }

  @Get('tasks')
  findAll() {
    return this.taskService.findAll();
  }

  @Get('tasks/:id')
  findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }

  @Patch('tasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.taskService.update(id, dto);
  }

  @Patch('tasks/:id/move')
  moveTask(@Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.taskService.moveTask(id, dto);
  }

  @Delete('tasks/:id')
  remove(@Param('id') id: string) {
    return this.taskService.remove(id);
  }
}
