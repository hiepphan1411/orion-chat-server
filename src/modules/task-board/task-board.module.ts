import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskBoard } from './entities/task-board.entity';
import { BoardColumn } from '../board-column/entities/board-column.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { TaskBoardService } from './task-board.service';
import { TaskBoardController } from './task-board.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TaskBoard, BoardColumn, Workspace])],
  controllers: [TaskBoardController],
  providers: [TaskBoardService],
  exports: [TaskBoardService],
})
export class TaskBoardModule {}
