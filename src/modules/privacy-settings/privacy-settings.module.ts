import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivacySettings } from './entities/privacy-settings.entity';
import { PrivacySettingsService } from './privacy-settings.service';
import { PrivacySettingsController } from './privacy-settings.controller';
import { Friendship } from '../friendship/entities/friendship.entity';
import { PrivacyPolicyService } from './privacy-policy.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrivacySettings, Friendship])],
  controllers: [PrivacySettingsController],
  providers: [PrivacySettingsService, PrivacyPolicyService],
  exports: [PrivacySettingsService, PrivacyPolicyService],
})
export class PrivacySettingsModule {}
