import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';

import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

import { Conversation } from './entities/conversation.schema';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { GroupConversation } from './entities/group-conversation.entity';

import { Message, MessageSchema } from '../message/message.schema';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      GroupConversation,
    ]),
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
