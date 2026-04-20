import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../conversation/entities/conversation.schema';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { MessageModule } from '../message/message.module';
import { GroupsController } from './groups.controller';
import { GroupLeaveController } from './group-leave.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      GroupConversation,
      GroupMember,
      ConversationParticipant,
    ]),
    MessageModule,
  ],
  controllers: [GroupsController, GroupLeaveController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
