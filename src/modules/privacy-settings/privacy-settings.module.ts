import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivacySettings } from './entities/privacy-settings.entity';
import { PrivacySettingsService } from './privacy-settings.service';
import { PrivacySettingsController } from './privacy-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PrivacySettings])],
  controllers: [PrivacySettingsController],
  providers: [PrivacySettingsService],
  exports: [PrivacySettingsService],
})
export class PrivacySettingsModule {}
