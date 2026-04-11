import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service';
import {
  CreateNotificationSettingsDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('notification-settings')
export class NotificationSettingsController {
  constructor(private readonly service: NotificationSettingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createDto: CreateNotificationSettingsDto) {
    return this.service.create(createDto);
  }

  // PUT SPECIFIC ROUTES (me/*) BEFORE PARAMETERIZED ROUTES (:userId)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMySettings(@CurrentUser() user: CurrentUserPayload) {
    console.log('[NotificationSettingsController] Getting settings for user:', user.userId);
    return this.service.findByUserId(user.userId);
  }

  @Patch('me/update')
  @UseGuards(JwtAuthGuard)
  updateMySettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateDto: UpdateNotificationSettingsDto,
  ) {
    console.log('[NotificationSettingsController] Updating settings for user:', user.userId, 'with:', updateDto);
    return this.service.update(user.userId, updateDto);
  }

  @Patch('me/toggle-mute')
  @UseGuards(JwtAuthGuard)
  toggleMuteMe(@CurrentUser() user: CurrentUserPayload) {
    return this.service.toggleMuteAll(user.userId);
  }

  // GENERIC ROUTES WITH PARAMETERS AFTER SPECIFIC ROUTES
  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  findByUserId(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateNotificationSettingsDto,
  ) {
    return this.service.update(userId, updateDto);
  }

  @Patch(':userId/toggle-mute')
  @UseGuards(JwtAuthGuard)
  toggleMute(@Param('userId') userId: string) {
    return this.service.toggleMuteAll(userId);
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  delete(@Param('userId') userId: string) {
    return this.service.delete(userId);
  }
}
