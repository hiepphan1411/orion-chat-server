import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FriendsModule } from './modules/friends/friends.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ChatModule } from './modules/chat/chat.module';
import { CallModule } from './modules/call/call.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { NotesModule } from './modules/notes/notes.module';
import { AiModule } from './modules/ai/ai.module';
import { WorkhubModule } from './modules/workhub/workhub.module';
import { StatisticsModule } from './modules/statistics/statistics.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '123456789',
      database: 'orion_chat',

      autoLoadEntities: true,
      synchronize: true,
    }),

    AuthModule,
    UsersModule,
    FriendsModule,
    GroupsModule,
    ChatModule,
    CallModule,
    CalendarModule,
    NotesModule,
    AiModule,
    WorkhubModule,
    StatisticsModule,
  ],
})
export class AppModule {}
