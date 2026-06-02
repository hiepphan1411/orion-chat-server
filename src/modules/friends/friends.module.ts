import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../friendship/entities/friendship.entity';
import { User } from '../users/entities/user.entity';
import { GroupMember } from '../group-member/entities/group-member.entity';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { CommonModule } from 'src/common/common.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User, GroupMember]),
    CommonModule,
    PrivacySettingsModule,
  ],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
