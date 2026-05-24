import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TaskBoardService } from './task-board.service';
import { CreateTaskBoardDto } from './dto/create-task-board.dto';
import { UpdateTaskBoardDto } from './dto/update-task-board.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/boards')
@UseGuards(JwtAuthGuard)
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
