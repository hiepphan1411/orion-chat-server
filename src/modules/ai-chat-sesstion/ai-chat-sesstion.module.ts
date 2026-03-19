import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIChatSession, AIChatSessionSchema } from './ai-chat-sesstion.schema';
import { AIChatSessionService } from './ai-chat-sesstion.service';
import { AIChatSessionController } from './ai-chat-sesstion.controller';
import { AIMessageModule } from '../ai-message/ai-message.module';
import { AIRagModule } from '../ai-rag/ai-rag.module';

@Module({
  imports: [
    AIMessageModule,
    AIRagModule,
    MongooseModule.forFeature([
      { name: AIChatSession.name, schema: AIChatSessionSchema },
    ]),
  ],
  providers: [AIChatSessionService],
  controllers: [AIChatSessionController],
  exports: [AIChatSessionService],
})
export class AIChatSessionModule {}
