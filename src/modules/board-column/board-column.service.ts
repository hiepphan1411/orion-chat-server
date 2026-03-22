import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardColumn } from './entities/board-column.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';

@Injectable()
export class BoardColumnService {
  constructor(
    @InjectRepository(BoardColumn)
    private columnRepo: Repository<BoardColumn>,
    @InjectRepository(TaskBoard)
    private boardRepo: Repository<TaskBoard>,
  ) {}

  async create(boardId: string, dto: CreateBoardColumnDto) {
    const board = await this.boardRepo.findOne({ where: { boardId } });
    if (!board) throw new NotFoundException('Board not found');

    const count = await this.columnRepo.count({
      where: { board: { boardId } },
    });

    const column = this.columnRepo.create({
      name: dto.name,
      status: dto.status,
      color: dto.color ?? '#94a3b8',
      taskLimit: dto.taskLimit,
      order: count,
      board,
    });
    return this.columnRepo.save(column);
  }

  async update(boardId: string, columnId: string, dto: UpdateBoardColumnDto) {
    const column = await this.columnRepo.findOne({
      where: { columnId, board: { boardId } },
    });
    if (!column) throw new NotFoundException('Column not found');

    Object.assign(column, dto);
    return this.columnRepo.save(column);
  }

  async remove(boardId: string, columnId: string) {
    const column = await this.columnRepo.findOne({
      where: { columnId, board: { boardId } },
    });
    if (!column) throw new NotFoundException('Column not found');
    return this.columnRepo.remove(column);
  }

  async reorder(boardId: string, columnIds: string[]) {
    for (let i = 0; i < columnIds.length; i++) {
      await this.columnRepo.update(
        { columnId: columnIds[i], board: { boardId } },
        { order: i },
      );
    }
    return this.columnRepo.find({
      where: { board: { boardId } },
      order: { order: 'ASC' },
    });
  }
}
