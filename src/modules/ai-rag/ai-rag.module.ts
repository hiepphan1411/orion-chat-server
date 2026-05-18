import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIRagController } from './ai-rag.controller';
import { AIRagDocument, AIRagDocumentSchema } from './ai-rag-document.schema';
import { AIRagChunk, AIRagChunkSchema } from './ai-rag.schema';
import { AIRagService } from './ai-rag.service';
import { AIRagIngestService } from './ai-rag-ingest.service';
import { Task } from '../task/entities/task.entity';
import { Document } from '../document/entities/document.entity';
import { PersonalNote } from '../notes/entities/note.entity';
import { CalendarEvent } from '../calendar-event/entities/calendar-event.entity';
import { WorkspaceMember } from '../workspace-member/entities/workspace-member.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIRagDocument.name, schema: AIRagDocumentSchema },
      { name: AIRagChunk.name, schema: AIRagChunkSchema },
    ]),
    TypeOrmModule.forFeature([
      Task,
      Document,
      PersonalNote,
      CalendarEvent,
      WorkspaceMember,
    ]),
  ],
  controllers: [AIRagController],
  providers: [AIRagService, AIRagIngestService],
  exports: [AIRagService, AIRagIngestService],
})
export class AIRagModule {}
