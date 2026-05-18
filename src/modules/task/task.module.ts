import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { BoardColumn } from '../board-column/entities/board-column.entity';
import { Label } from '../label/entities/label.entity';
import { User } from '../users/entities/user.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { File } from '../file/entities/file.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskAssignee,
      TaskBoard,
      BoardColumn,
      Label,
      User,
      Workspace,
      File,
    ]),
    NotificationModule,
  ],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
