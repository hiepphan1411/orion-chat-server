import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIRagController } from './ai-rag.controller';
import { AIRagDocument, AIRagDocumentSchema } from './ai-rag-document.schema';
import { AIRagChunk, AIRagChunkSchema } from './ai-rag.schema';
import { AIRagService } from './ai-rag.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIRagDocument.name, schema: AIRagDocumentSchema },
      { name: AIRagChunk.name, schema: AIRagChunkSchema },
    ]),
  ],
  controllers: [AIRagController],
  providers: [AIRagService],
  exports: [AIRagService],
})
export class AIRagModule {}
