import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIRagModule } from '../ai-rag/ai-rag.module';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { Document } from '../document/entities/document.entity';
import { CalendarEvent } from '../calendar-event/entities/calendar-event.entity';
import { MessageModule } from '../message/message.module';
import { Message, MessageSchema } from '../message/message.schema';
import { PersonalNote } from '../notes/entities/note.entity';
import { Sprint } from '../sprint/entities/sprint.entity';
import { Task } from '../task/entities/task.entity';
import { TaskBoard } from '../task-board/entities/task-board.entity';
import { UserSettings } from '../user-settings/entities/user-settings.entity';
import { User } from '../users/entities/user.entity';
import { WorkspaceFile } from '../workspace-file/entities/workspace-file.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { OrionAiController } from './orion-ai.controller';
import { OrionAiService } from './orion-ai.service';

@Module({
  imports: [
    AIRagModule,
    MessageModule,
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    TypeOrmModule.forFeature([
      CalendarEvent,
      ConversationParticipant,
      Document,
      PersonalNote,
      Sprint,
      Task,
      TaskBoard,
      User,
      UserSettings,
      Workspace,
      WorkspaceFile,
      WorkspaceMember,
    ]),
  ],
  controllers: [OrionAiController],
  providers: [OrionAiService],
  exports: [OrionAiService],
})
export class OrionAiModule {}
