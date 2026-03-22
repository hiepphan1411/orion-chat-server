import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { BoardColumnService } from './board-column.service';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('boards/:boardId/columns')
@UseGuards(JwtAuthGuard)
export class BoardColumnController {
  constructor(private readonly columnService: BoardColumnService) {}

  @Post()
  create(@Param('boardId') boardId: string, @Body() dto: CreateBoardColumnDto) {
    return this.columnService.create(boardId, dto);
  }

  @Patch('reorder')
  reorder(
    @Param('boardId') boardId: string,
    @Body('columnIds') columnIds: string[],
  ) {
    return this.columnService.reorder(boardId, columnIds);
  }

  @Patch(':columnId')
  update(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateBoardColumnDto,
  ) {
    return this.columnService.update(boardId, columnId, dto);
  }

  @Delete(':columnId')
  remove(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
  ) {
    return this.columnService.remove(boardId, columnId);
  }
}
