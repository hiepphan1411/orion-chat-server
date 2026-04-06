import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import {
  CreateNotificationSettingsDto,
  UpdateNotificationSettingsDto,
} from './dto/notification-settings.dto';

@Injectable()
export class NotificationSettingsService {
  private readonly logger = new Logger(NotificationSettingsService.name);
  constructor(
    @InjectRepository(NotificationSettings)
    private settingsRepository: Repository<NotificationSettings>,
  ) {}

  async create(
    createDto: CreateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    const existingSettings = await this.settingsRepository.findOne({
      where: { userId: createDto.userId },
    });

    if (existingSettings) {
      throw new BadRequestException('Notification settings already exist');
    }

    const settings = this.settingsRepository.create(createDto);
    return await this.settingsRepository.save(settings);
  }

  async findByUserId(userId: string): Promise<NotificationSettings> {
    const settings = await this.settingsRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      // Create default settings if not exist
      return await this.createDefaultSettings(userId);
    }

    return settings;
  }

  async createDefaultSettings(userId: string): Promise<NotificationSettings> {
    const defaultSettings = this.settingsRepository.create({
      userId,
      groupNotifications: true,
      tagNotifications: true,
      muteAll: false,
      messageNotifications: true,
      friendRequestNotifications: true,
      callNotifications: true,
      notificationSound: 'all',
      doNotDisturbStart: 0,
      doNotDisturbEnd: 0,
    });
    return await this.settingsRepository.save(defaultSettings);
  }

  async update(
    userId: string,
    updateDto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    this.logger.log(`[NotificationSettings] Updating settings for userId: ${userId}`);
    this.logger.debug(`[NotificationSettings] Update data:`, JSON.stringify(updateDto));

    const settings = await this.findByUserId(userId);
    this.logger.log(`[NotificationSettings] Found settings id: ${settings.id}`);

    // Explicitly assign each field
    if (updateDto.groupNotifications !== undefined) {
      settings.groupNotifications = updateDto.groupNotifications;
    }
    if (updateDto.tagNotifications !== undefined) {
      settings.tagNotifications = updateDto.tagNotifications;
    }
    if (updateDto.muteAll !== undefined) {
      settings.muteAll = updateDto.muteAll;
    }
    if (updateDto.messageNotifications !== undefined) {
      settings.messageNotifications = updateDto.messageNotifications;
    }
    if (updateDto.friendRequestNotifications !== undefined) {
      settings.friendRequestNotifications = updateDto.friendRequestNotifications;
    }
    if (updateDto.callNotifications !== undefined) {
      settings.callNotifications = updateDto.callNotifications;
    }
    if (updateDto.notificationSound !== undefined) {
      settings.notificationSound = updateDto.notificationSound;
    }
    if (updateDto.doNotDisturbStart !== undefined) {
      settings.doNotDisturbStart = updateDto.doNotDisturbStart;
    }
    if (updateDto.doNotDisturbEnd !== undefined) {
      settings.doNotDisturbEnd = updateDto.doNotDisturbEnd;
    }

    const savedSettings = await this.settingsRepository.save(settings);
    this.logger.log(`[NotificationSettings] Settings saved successfully for userId: ${userId}`);
    this.logger.debug(`[NotificationSettings] Saved data:`, JSON.stringify(savedSettings));

    return savedSettings;
  }

  async delete(userId: string): Promise<void> {
    const result = await this.settingsRepository.delete({ userId });
    if (result.affected === 0) {
      throw new NotFoundException('Notification settings not found');
    }
  }

  async toggleMuteAll(userId: string): Promise<NotificationSettings> {
    const settings = await this.findByUserId(userId);
    settings.muteAll = !settings.muteAll;
    return await this.settingsRepository.save(settings);
  }
}
