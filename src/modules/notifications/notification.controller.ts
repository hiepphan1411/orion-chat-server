import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('me')
  getMyNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const parsedLimit = Number(limit || 20);
    const parsedSkip = Number(skip || 0);
    return this.notificationService.findByUser(
      user.userId,
      Number.isNaN(parsedLimit) ? 20 : parsedLimit,
      Number.isNaN(parsedSkip) ? 0 : parsedSkip,
    );
  }

  @Get('me/unread-count')
  getMyUnreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationService.countUnread(user.userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, user.userId);
  }

  @Patch('me/read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationService.markAllAsRead(user.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.notificationService.delete(id, user.userId);
  }
}
