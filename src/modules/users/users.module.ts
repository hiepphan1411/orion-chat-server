import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { File } from '../file/entities/file.entity';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';

//test

@Module({
  imports: [TypeOrmModule.forFeature([User, File]), PrivacySettingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
