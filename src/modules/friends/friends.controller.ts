import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  getFriends(@Query('userId') userId: string) {
    return this.friendsService.getFriends(userId);
  }

  @Get('search-users')
  searchUsers(@Query('userId') userId: string, @Query('q') q: string) {
    return this.friendsService.searchUsers(userId, q);
  }

  @Get('suggestions')
  getSuggestions(@Query('userId') userId: string) {
    return this.friendsService.getSuggestedByMutualGroups(userId);
  }

  @Get('recently-active')
  getRecentlyActive(@Query('userId') userId: string) {
    return this.friendsService.getRecentlyActive(userId);
  }

  @Get('blocked')
  getBlockedFriends(@Query('userId') userId: string) {
    return this.friendsService.getBlockedFriends(userId);
  }

  @Get(':userId/:friendId/profile')
  getFriendProfile(
    @Param('userId') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.getFriendProfile(userId, friendId);
  }

  @Delete(':userId/:friendId')
  removeFriend(
    @Param('userId') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.removeFriend(userId, friendId);
  }

  @Patch(':userId/:friendId/block')
  blockFriend(
    @Param('userId') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.blockFriend(userId, friendId);
  }

  @Patch(':userId/:friendId/unblock')
  unblockFriend(
    @Param('userId') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.unblockFriend(userId, friendId);
  }
}
