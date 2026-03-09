import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AIMessage, AIMessageSchema } from './ai-message.schema';
import { AIMessageService } from './ai-message.service';
import { AIMessageController } from './ai-message.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIMessage.name, schema: AIMessageSchema },
    ]),
  ],
  providers: [AIMessageService],
  controllers: [AIMessageController],
  exports: [AIMessageService],
})
export class AIMessageModule {}
