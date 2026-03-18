import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

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
import { NotesModule } from './modules/notes/notes.module';

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
import { PersonalNote } from './modules/notes/entities/note.entity';
import { NoteCategory } from './modules/notes/entities/note-category.entity';
import { FriendRequest } from './modules/friend-request/entities/friend-request.entity';
import { Friendship } from './modules/friendship/entities/friendship.entity';
import { GroupConversation } from './modules/group-conversation/entities/group-conversation.entity';
import { GroupMember } from './modules/group-member/entities/group-member.entity';
import { GroupInvite } from './modules/group-invite/entities/group-invite.entity';

import { WorkspaceModule } from './modules/workspace/workspace.module';
import { WorkspaceMemberModule } from './modules/workspace-member/workspace-member.module';
import { TaskBoardModule } from './modules/task-board/task-board.module';
import { BoardColumnModule } from './modules/board-column/board-column.module';
import { LabelModule } from './modules/label/label.module';
import { Conversation } from './modules/conversation/entities/conversation.entity';
import { CommonModule } from './common/common.module';
import { FriendRequestModule } from './modules/friend-request/friend-request.module';
import { GroupInviteModule } from './modules/group-invite/group-invite.module';
import { FriendsModule } from './modules/friends/friends.module';

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
        PersonalNote,
        NoteCategory,
        FriendRequest,
        Friendship,
        GroupConversation,
        GroupMember,
        GroupInvite,
      ],
      autoLoadEntities: true,
      synchronize: true,
    }),

    // MongoDB
    MongooseModule.forRoot('mongodb://localhost:27017/orion_chat'),

    // Common Module (provides JwtAuthGuard globally)
    CommonModule,

    // Modules
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
    ActivityLogModule,
    AttachmentModule,
    NotesModule,
    FriendRequestModule,
    GroupInviteModule,
    FriendsModule,
  ],
})
export class AppModule {}
