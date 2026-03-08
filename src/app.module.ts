import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './modules/users/users.module';
import { TaskModule } from './modules/task/task.module';
import { WorkspaceMember } from './modules/workspace-member/entities/workspace-member.entity';
import { Workspace } from './modules/workspace/entities/workspace.entity';
import { TaskList } from './modules/task-list/entities/task-list.entity';
import { TaskBoard } from './modules/task-board/entities/task-board.entity';
import { Task } from './modules/task/entities/task.entity';
import { User } from './modules/users/entities/user.entity';
import { PersonalNoteModule } from './modules/personal-note/personal-note.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '123456789',
      database: 'orion_chat',
      entities: [
        User,
        File,
        Task,
        TaskBoard,
        TaskList,
        Workspace,
        WorkspaceMember,
      ],
      autoLoadEntities: true,
      synchronize: true,
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/orion_chat'),
    UsersModule,
    TaskModule,
    PersonalNoteModule,
  ],
})
export class AppModule {}
