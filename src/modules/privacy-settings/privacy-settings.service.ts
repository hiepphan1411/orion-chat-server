import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivacySettings } from './entities/privacy-settings.entity';
import {
  CreatePrivacySettingsDto,
  UpdatePrivacySettingsDto,
} from './dto/privacy-settings.dto';
import {
  ContactPermission,
  normalizeContactPermission,
  normalizeProfileVisibility,
  ProfileVisibility,
} from './privacy-settings.constants';

@Injectable()
export class PrivacySettingsService {
  private readonly logger = new Logger(PrivacySettingsService.name);
  constructor(
    @InjectRepository(PrivacySettings)
    private settingsRepository: Repository<PrivacySettings>,
  ) {}

  async create(createDto: CreatePrivacySettingsDto): Promise<PrivacySettings> {
    const settings = this.settingsRepository.create({
      ...createDto,
      profileVisibility: normalizeProfileVisibility(
        createDto.profileVisibility,
      ),
      messagePermission: normalizeContactPermission(
        createDto.messagePermission,
      ),
      callPermission: normalizeContactPermission(createDto.callPermission),
    });
    return await this.settingsRepository.save(settings);
  }

  async findByUserId(userId: string): Promise<PrivacySettings> {
    const settings = await this.settingsRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      // Create default settings
      return await this.createDefaultSettings(userId);
    }

    return settings;
  }

  async createDefaultSettings(userId: string): Promise<PrivacySettings> {
    const defaultSettings = this.settingsRepository.create({
      userId,
      profileVisibility: ProfileVisibility.FRIENDS,
      messagePermission: ContactPermission.FRIENDS,
      lastSeenVisibility: true,
      onlineStatusVisibility: true,
      allowAIToSeeProfile: false,
      allowAIToSeeMessages: false,
      allowAIToSeeMedia: false,
      callPermission: ContactPermission.FRIENDS,
      allowScreenSharing: true,
      allowDataCollection: false,
      allowAnalytics: false,
    });
    return await this.settingsRepository.save(defaultSettings);
  }

  async update(
    userId: string,
    updateDto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettings> {
    this.logger.log(`[PrivacySettings] Updating settings for userId: ${userId}`);
    this.logger.debug(`[PrivacySettings] Update data:`, JSON.stringify(updateDto));

    const settings = await this.findByUserId(userId);
    this.logger.log(`[PrivacySettings] Found settings id: ${settings.id}`);

    // Explicitly assign each field
    if (updateDto.profileVisibility !== undefined) {
      settings.profileVisibility = normalizeProfileVisibility(
        updateDto.profileVisibility,
      );
    }
    if (updateDto.messagePermission !== undefined) {
      settings.messagePermission = normalizeContactPermission(
        updateDto.messagePermission,
      );
    }
    if (updateDto.lastSeenVisibility !== undefined) {
      settings.lastSeenVisibility = updateDto.lastSeenVisibility;
    }
    if (updateDto.onlineStatusVisibility !== undefined) {
      settings.onlineStatusVisibility = updateDto.onlineStatusVisibility;
    }
    if (updateDto.allowAIToSeeProfile !== undefined) {
      settings.allowAIToSeeProfile = updateDto.allowAIToSeeProfile;
    }
    if (updateDto.allowAIToSeeMessages !== undefined) {
      settings.allowAIToSeeMessages = updateDto.allowAIToSeeMessages;
    }
    if (updateDto.allowAIToSeeMedia !== undefined) {
      settings.allowAIToSeeMedia = updateDto.allowAIToSeeMedia;
    }
    if (updateDto.callPermission !== undefined) {
      settings.callPermission = normalizeContactPermission(
        updateDto.callPermission,
      );
    }
    if (updateDto.allowScreenSharing !== undefined) {
      settings.allowScreenSharing = updateDto.allowScreenSharing;
    }
    if (updateDto.allowDataCollection !== undefined) {
      settings.allowDataCollection = updateDto.allowDataCollection;
    }
    if (updateDto.allowAnalytics !== undefined) {
      settings.allowAnalytics = updateDto.allowAnalytics;
    }

    const savedSettings = await this.settingsRepository.save(settings);
    this.logger.log(`[PrivacySettings] Settings saved successfully for userId: ${userId}`);
    this.logger.debug(`[PrivacySettings] Saved data:`, JSON.stringify(savedSettings));

    return savedSettings;
  }

  async delete(userId: string): Promise<void> {
    const result = await this.settingsRepository.delete({ userId });
    if (result.affected === 0) {
      throw new NotFoundException('Privacy settings not found');
    }
  }
}
