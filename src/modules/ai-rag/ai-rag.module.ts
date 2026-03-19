import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIRagController } from './ai-rag.controller';
import { AIRagChunk, AIRagChunkSchema } from './ai-rag.schema';
import { AIRagService } from './ai-rag.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIRagChunk.name, schema: AIRagChunkSchema },
    ]),
  ],
  controllers: [AIRagController],
  providers: [AIRagService],
  exports: [AIRagService],
})
export class AIRagModule {}
