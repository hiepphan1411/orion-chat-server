import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardColumn } from './entities/board-column.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { BoardColumnService } from './board-column.service';
import { BoardColumnController } from './board-column.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BoardColumn, TaskBoard])],
  controllers: [BoardColumnController],
  providers: [BoardColumnService],
  exports: [BoardColumnService],
})
export class BoardColumnModule {}
