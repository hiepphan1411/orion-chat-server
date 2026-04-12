import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  /**
   * Lấy danh sách bạn bè của user
   */
  @Get()
  getFriends(@Query('userId') userId: string) {
    return this.friendsService.getFriends(userId);
  }

  /**
   * Tìm kiếm những user khác
   */
  @Get('search-users')
  searchUsers(@Query('userId') userId: string, @Query('q') q: string) {
    return this.friendsService.searchUsers(userId, q);
  }

  /**
   * Lấy danh sách bạn bè gợi ý (có bạn chung)
   */
  @Get('suggestions')
  getSuggestions(@Query('userId') userId: string) {
    return this.friendsService.getSuggestedByMutualGroups(userId);
  }

  /**
   * Lấy danh sách bạn bè hoạt động gần đây
   */
  @Get('recently-active')
  getRecentlyActive(@Query('userId') userId: string) {
    return this.friendsService.getRecentlyActive(userId);
  }

  /**
   * Lấy danh sách bạn bè bị chặn
   */
  @Get('blocked')
  getBlockedFriends(@Query('userId') userId: string) {
    return this.friendsService.getBlockedFriends(userId);
  }

  /**
   * Lấy chi tiết profile của một bạn bè
   * Route: GET /friends/:userId/:friendId/profile
   * 
   * Kiểm tra:
   * - userId và friendId có tồn tại không
   * - Họ có phải bạn bè không
   * - Nếu ok, return thông tin chi tiết
   */
  @Get(':userId/:friendId/profile')
  @UseGuards(JwtAuthGuard)
  async getFriendProfile(
    @Param('userId') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.getFriendProfile(userId, friendId);
  }
}
