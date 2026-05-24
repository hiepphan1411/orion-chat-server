import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIChatSession, AIChatSessionSchema } from './ai-chat-sesstion.schema';
import { AIChatSessionService } from './ai-chat-sesstion.service';
import { AIChatSessionController } from './ai-chat-sesstion.controller';
import { AIMessageModule } from '../ai-message/ai-message.module';
import { AIRagModule } from '../ai-rag/ai-rag.module';
import { CalendarEvent } from '../calendar-event/entities/calendar-event.entity';
import { PersonalNote } from '../notes/entities/note.entity';
import { Task } from '../task/entities/task.entity';
import { UserSettings } from '../user-settings/entities/user-settings.entity';
import { WorkspaceFile } from '../workspace-file/entities/workspace-file.entity';

@Module({
  imports: [
    AIMessageModule,
    AIRagModule,
    MongooseModule.forFeature([
      { name: AIChatSession.name, schema: AIChatSessionSchema },
    ]),
    TypeOrmModule.forFeature([
      CalendarEvent,
      PersonalNote,
      Task,
      UserSettings,
      WorkspaceFile,
    ]),
  ],
  providers: [AIChatSessionService],
  controllers: [AIChatSessionController],
  exports: [AIChatSessionService],
})
export class AIChatSessionModule {}
