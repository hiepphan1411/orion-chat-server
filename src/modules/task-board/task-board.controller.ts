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
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('workspaces/:workspaceId/boards')
@UseGuards(JwtAuthGuard)
export class TaskBoardController {
  constructor(private readonly boardService: TaskBoardService) {}

  @Post()
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTaskBoardDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.boardService.create(workspaceId, dto, user.userId);
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
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.boardService.update(workspaceId, boardId, dto, user.userId);
  }

  @Delete(':boardId')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('boardId') boardId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.boardService.remove(workspaceId, boardId, user.userId);
  }
}
