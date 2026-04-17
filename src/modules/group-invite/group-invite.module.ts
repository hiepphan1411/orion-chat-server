import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupConversation } from '../conversation/entities/group-conversation.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { User } from '../users/entities/user.entity';
import { GroupInviteController } from './group-invite.controller';
import { GroupInviteService } from './group-invite.service';
import { GroupInvite } from './entities/group-invite.entity';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupInvite,
      GroupConversation,
      GroupMember,
      User,
    ]),
    NotificationModule,
  ],
  controllers: [GroupInviteController],
  providers: [GroupInviteService],
  exports: [GroupInviteService],
})
export class GroupInviteModule {}
