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
import { UserDevicesService } from './user-devices.service';
import {
  CreateUserDevicesDto,
  UpdateUserDevicesDto,
} from './dto/user-devices.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from 'src/common/decorators/current-user.decorator';

@Controller('user-devices')
export class UserDevicesController {
  constructor(private readonly service: UserDevicesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createDto: CreateUserDevicesDto) {
    return this.service.create(createDto);
  }

  // PUT SPECIFIC ROUTES (me/*) BEFORE PARAMETERIZED ROUTES (:id)
  @Get('me/devices')
  @UseGuards(JwtAuthGuard)
  getMyDevices(@CurrentUser() user: CurrentUserPayload) {
    console.log('[UserDevicesController] Getting devices for user:', user.userId);
    return this.service.findByUserId(user.userId);
  }

  @Get('me/active-devices')
  @UseGuards(JwtAuthGuard)
  getMyActiveDevices(@CurrentUser() user: CurrentUserPayload) {
    console.log('[UserDevicesController] Getting active devices for user:', user.userId);
    return this.service.getActiveDevices(user.userId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  findByUserId(@Param('userId') userId: string) {
    return this.service.findByUserId(userId);
  }

  // GENERIC ROUTES WITH PARAMETERS AFTER SPECIFIC ROUTES
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/last-login')
  @UseGuards(JwtAuthGuard)
  updateLastLogin(@Param('id') id: string) {
    return this.service.updateLastLogin(id);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  deactivateDevice(@Param('id') id: string) {
    return this.service.deactivateDevice(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() updateDto: UpdateUserDevicesDto) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  removeDevice(@Param('id') id: string) {
    return this.service.removeDevice(id);
  }

  @Delete('user/:userId/except/:currentDeviceId')
  @UseGuards(JwtAuthGuard)
  removeAllExcept(
    @Param('userId') userId: string,
    @Param('currentDeviceId') currentDeviceId: string,
  ) {
    return this.service.removeAllDevicesExceptCurrent(userId, currentDeviceId);
  }
}
