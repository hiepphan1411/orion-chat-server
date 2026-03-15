import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { TaskBoardService } from './task-board.service';
import { CreateTaskBoardDto } from './dto/create-task-board.dto';
import { UpdateTaskBoardDto } from './dto/update-task-board.dto';

/**
 * API Task Board
 *
 * POST   /workspaces/:workspaceId/boards             → Tạo board mới
 *   - Body: { boardName, description?, backgroundColor?, icon? }
 *   - Tự động tạo 4 columns mặc định: To Do, In Progress, Review, Done
 *   - Trả về board kèm columns
 *
 * GET    /workspaces/:workspaceId/boards             → Danh sách boards trong workspace
 *   - Trả về mảng board kèm columns
 *   - Sắp xếp theo ngày tạo (mới nhất trước)
 *
 * GET    /workspaces/:workspaceId/boards/:boardId    → Chi tiết board
 *   - Trả về board kèm columns (sắp xếp theo order) và tasks
 *
 * PATCH  /workspaces/:workspaceId/boards/:boardId    → Cập nhật board
 *   - Body: bất kỳ field nào (boardName, description, backgroundColor, icon)
 *
 * DELETE /workspaces/:workspaceId/boards/:boardId    → Xóa board
 *   - Cascade xóa columns, tasks
 */
@Controller('workspaces/:workspaceId/boards')
export class TaskBoardController {
  constructor(private readonly boardService: TaskBoardService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTaskBoardDto,
  ) {
    return this.boardService.create(workspaceId, dto);
  }

  @Get()
  findAll(@Param('workspaceId') workspaceId: string) {
    return this.boardService.findAllByWorkspace(workspaceId);
  }

  @Get(':boardId')
  findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardService.findOne(workspaceId, boardId);
  }

  @Patch(':boardId')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @Body() dto: UpdateTaskBoardDto,
  ) {
    return this.boardService.update(workspaceId, boardId, dto);
  }

  @Delete(':boardId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.boardService.remove(workspaceId, boardId);
  }
}
