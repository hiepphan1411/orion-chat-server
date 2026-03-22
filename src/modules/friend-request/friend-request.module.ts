import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Friendship } from '../friendship/entities/friendship.entity';
import { FriendRequestController } from './friend-request.controller';
import { FriendRequestService } from './friend-request.service';
import { FriendRequest } from './entities/friend-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FriendRequest, User, Friendship])],
  controllers: [FriendRequestController],
  providers: [FriendRequestService],
  exports: [FriendRequestService],
})
export class FriendRequestModule {}
