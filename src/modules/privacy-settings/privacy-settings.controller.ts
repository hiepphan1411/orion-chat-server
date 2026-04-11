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
import { PrivacySettingsService } from './privacy-settings.service';
import {
  CreatePrivacySettingsDto,
  UpdatePrivacySettingsDto,
} from './dto/privacy-settings.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('privacy-settings')
export class PrivacySettingsController {
  constructor(private readonly service: PrivacySettingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createDto: CreatePrivacySettingsDto) {
    return this.service.create(createDto);
  }

  // PUT SPECIFIC ROUTES (me/*) BEFORE PARAMETERIZED ROUTES (:userId)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMySettings(@CurrentUser() user: CurrentUserPayload) {
    console.log('[PrivacySettingsController] Getting settings for user:', user.userId);
    return this.service.findByUserId(user.userId);
  }

  @Patch('me/update')
  @UseGuards(JwtAuthGuard)
  updateMySettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() updateDto: UpdatePrivacySettingsDto,
  ) {
    console.log('[PrivacySettingsController] Updating settings for user:', user.userId, 'with:', updateDto);
    return this.service.update(user.userId, updateDto);
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
    @Body() updateDto: UpdatePrivacySettingsDto,
  ) {
    return this.service.update(userId, updateDto);
  }

  @Delete(':userId')
  @UseGuards(JwtAuthGuard)
  delete(@Param('userId') userId: string) {
    return this.service.delete(userId);
  }
}
