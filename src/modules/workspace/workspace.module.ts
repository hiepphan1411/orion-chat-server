import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { User } from '../users/entities/user.entity';
import { Task } from '../task/entities/task.entity';
import { TaskAssignee } from '../task/entities/task-assignee.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { Sprint } from '../sprint/entities/sprint.entity';
import { ActivityLog } from '../activity-log/entities/activity-log.entity';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMember,
      User,
      Task,
      TaskAssignee,
      TaskBoard,
      Sprint,
      ActivityLog,
    ]),
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
