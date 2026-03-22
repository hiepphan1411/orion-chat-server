import { Controller, Get, Query } from '@nestjs/common';
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
}
