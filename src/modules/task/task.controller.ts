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

/**
 * API Tasks
 *
 * === Board-scoped endpoints ===
 *
 * POST   /boards/:boardId/tasks                 → Tạo task trong board
 *   - Body: { title, description?, priority, status, startDate?, dueDate?,
 *             boardId, columnId?, createdById, assigneeIds?[], labelIds?[] }
 *   - Tự động tính order (thêm vào cuối column)
 *   - Trả về task đầy đủ kèm relations
 *
 * GET    /boards/:boardId/tasks                 → Lấy tất cả tasks trong board
 *   - Kèm: column, assignees (user), labels, createdBy
 *   - Sắp xếp theo order
 *
 * === Direct task endpoints ===
 *
 * GET    /tasks/:id                              → Chi tiết task
 *   - Kèm tất cả relations
 *
 * PATCH  /tasks/:id                              → Cập nhật task
 *   - Body: bất kỳ field của CreateTaskDto
 *   - Nếu truyền assigneeIds → thay thế danh sách assignees
 *   - Nếu truyền labelIds → thay thế danh sách labels
 *
 * PATCH  /tasks/:id/move                         → Di chuyển task (kéo thả)
 *   - Body: { columnId, status, order? }
 *   - Dùng khi kéo thả task giữa các column trên Kanban board
 *
 * DELETE /tasks/:id                              → Xóa task
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  // === Board-scoped ===

  @Post('boards/:boardId/tasks')
  create(@Param('boardId') boardId: string, @Body() dto: CreateTaskDto) {
    return this.taskService.create(boardId, dto);
  }

  @Get('boards/:boardId/tasks')
  findByBoard(@Param('boardId') boardId: string) {
    return this.taskService.findByBoard(boardId);
  }

  // === Direct task ===

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
