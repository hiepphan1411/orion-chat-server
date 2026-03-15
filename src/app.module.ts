import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { UsersModule } from './modules/users/users.module';
import { TaskModule } from './modules/task/task.module';
import { PersonalNoteModule } from './modules/personal-note/personal-note.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { MessageModule } from './modules/message/message.module';
import { CallModule } from './modules/call/call.module';
import { AIChatSessionModule } from './modules/ai-chat-sesstion/ai-chat-sesstion.module';
import { AIMessageModule } from './modules/ai-message/ai-message.module';
import { AuthModule } from './modules/auth/auth.module';
import { SubTaskModule } from './modules/sub-task/sub-task.module';
import { CommentModule } from './modules/comment/comment.module';
import { AttachmentModule } from './modules/attachment/attachment.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { AutomationModule } from './modules/automation/automation.module';
import { DocumentModule } from './modules/document/document.module';
import { WorkspaceFileModule } from './modules/workspace-file/workspace-file.module';
import { GoalModule } from './modules/goal/goal.module';
import { SprintModule } from './modules/sprint/sprint.module';
import { EpicModule } from './modules/epic/epic.module';
import { MilestoneModule } from './modules/milestone/milestone.module';

import { WorkspaceMember } from './modules/workspace-member/entities/workspace-member.entity';
import { Workspace } from './modules/workspace/entities/workspace.entity';
import { TaskList } from './modules/task-list/entities/task-list.entity';
import { TaskBoard } from './modules/task-board/entities/task-board.entity';
import { Task } from './modules/task/entities/task.entity';
import { TaskAssignee } from './modules/task/entities/task-assignee.entity';
import { User } from './modules/users/entities/user.entity';
import { Admin } from './modules/admin/entities/admin.entity';
import { Report } from './modules/reports/entities/reports.entity';
import { BoardColumn } from './modules/board-column/entities/board-column.entity';
import { Label } from './modules/label/entities/label.entity';
import { SubTask } from './modules/sub-task/entities/sub-task.entity';
import { Comment } from './modules/comment/entities/comment.entity';
import { Attachment } from './modules/attachment/entities/attachment.entity';
import { ActivityLog } from './modules/activity-log/entities/activity-log.entity';
import { AutomationRule } from './modules/automation/entities/automation-rule.entity';
import { Document } from './modules/document/entities/document.entity';
import { DocumentVersion } from './modules/document/entities/document-version.entity';
import { InlineComment } from './modules/document/entities/inline-comment.entity';
import { WorkspaceFile } from './modules/workspace-file/entities/workspace-file.entity';
import { Goal } from './modules/goal/entities/goal.entity';
import { KeyResult } from './modules/goal/entities/key-result.entity';
import { Sprint } from './modules/sprint/entities/sprint.entity';
import { Epic } from './modules/epic/entities/epic.entity';
import { Milestone } from './modules/milestone/entities/milestone.entity';

import { WorkspaceModule } from './modules/workspace/workspace.module';
import { WorkspaceMemberModule } from './modules/workspace-member/workspace-member.module';
import { TaskBoardModule } from './modules/task-board/task-board.module';
import { BoardColumnModule } from './modules/board-column/board-column.module';
import { LabelModule } from './modules/label/label.module';
import { Conversation } from './modules/conversation/entities/conversation.entity';

@Module({
  imports: [
    // ENV config
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '123456789',
      database: 'orion_chat',
      entities: [
        User,
        Task,
        TaskAssignee,
        TaskBoard,
        TaskList,
        Workspace,
        WorkspaceMember,
        BoardColumn,
        Label,
        Report,
        Admin,
        Conversation,
        SubTask,
        Comment,
        Attachment,
        ActivityLog,
        AutomationRule,
        Document,
        DocumentVersion,
        InlineComment,
        WorkspaceFile,
        Goal,
        KeyResult,
        Sprint,
        Epic,
        Milestone,
      ],
      autoLoadEntities: true,
      synchronize: true,
    }),

    // MongoDB
    MongooseModule.forRoot('mongodb://localhost:27017/orion_chat'),

    // Modules
    UsersModule,
    AuthModule,
    TaskModule,
    PersonalNoteModule,
    NotificationModule,
    MessageModule,
    CallModule,
    AIChatSessionModule,
    AIMessageModule,
    WorkspaceModule,
    WorkspaceMemberModule,
    TaskBoardModule,
    BoardColumnModule,
    LabelModule,
    SubTaskModule,
    CommentModule,
    AttachmentModule,
    ActivityLogModule,
    AutomationModule,
    DocumentModule,
    WorkspaceFileModule,
    GoalModule,
    SprintModule,
    EpicModule,
    MilestoneModule,
  ],
})
export class AppModule {}
