import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { ConversationParticipant } from '../conversation/entities/conversation-participant.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import { GroupInviteController } from './group-invite.controller';
import { GroupInviteService } from './group-invite.service';
import { GroupInvite } from './entities/group-invite.entity';
import { GroupJoinRequest } from './entities/group-join-request.entity';
import { GroupManagementService } from './group-management.service';
import { GroupManagementController } from './group-management.controller';
import { NotificationModule } from '../notifications/notification.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupInvite,
      GroupJoinRequest,
      GroupConversation,
      ConversationParticipant,
      GroupMember,
      User,
    ]),
    NotificationModule,
    MessageModule,
  ],
  controllers: [GroupInviteController, GroupManagementController],
  providers: [GroupInviteService, GroupManagementService],
  exports: [GroupInviteService, GroupManagementService],
})
export class GroupInviteModule {}
