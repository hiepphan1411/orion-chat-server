import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';

import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

import { Conversation } from './entities/conversation.schema';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { GroupConversation } from './entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';

import { Message, MessageSchema } from '../message/message.schema';
import { MessageModule } from '../message/message.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      GroupConversation,
      GroupMember,
      User,
    ]),
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    MessageModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
