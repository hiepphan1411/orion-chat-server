import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../conversation/entities/conversation.schema';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { Message, MessageSchema } from './message.schema';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { ChatGateway } from './chat.gateway';
import { ChatMembershipService } from './services/chat-membership.service';
import { ChatMediaService } from './services/chat-media.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      GroupConversation,
      GroupMember,
    ]),
  ],
  providers: [
    MessageService,
    ChatGateway,
    ChatMembershipService,
    ChatMediaService,
  ],
  controllers: [MessageController],
  exports: [
    MessageService,
    ChatGateway,
    ChatMembershipService,
    ChatMediaService,
  ],
})
export class MessageModule {}
