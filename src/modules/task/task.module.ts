import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { File } from '../file/entities/file.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Task, TaskBoard, Workspace, File])],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}
