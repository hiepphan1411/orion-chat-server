import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDevices } from './entities/user-devices.entity';
import { UserDevicesService } from './user-devices.service';
import { UserDevicesController } from './user-devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserDevices])],
  controllers: [UserDevicesController],
  providers: [UserDevicesService],
  exports: [UserDevicesService],
})
export class UserDevicesModule {}
