/*eslint-disable */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from './entities/user-settings.entity';
import {
  CreateUserSettingsDto,
  UpdateUserSettingsDto,
  UserSettingsResponseDto,
} from './dto/user-settings.dto';

@Injectable()
export class UserSettingsService {
  private readonly logger = new Logger(UserSettingsService.name);
  constructor(
    @InjectRepository(UserSettings)
    private settingsRepository: Repository<UserSettings>,
  ) {}

  async create(
    createUserSettingsDto: CreateUserSettingsDto,
  ): Promise<UserSettings> {
    const existingSettings = await this.settingsRepository.findOne({
      where: { userId: createUserSettingsDto.userId },
    });

    if (existingSettings) {
      throw new BadRequestException('User settings already exist');
    }

    const settings = this.settingsRepository.create(createUserSettingsDto);
    return await this.settingsRepository.save(settings);
  }

  async findByUserId(userId: string): Promise<UserSettings> {
    const settings = await this.settingsRepository.findOne({
      where: { userId },
    });

    if (!settings) {
      // Create default settings if not exist
      return await this.createDefaultSettings(userId);
    }

    return settings;
  }

  async createDefaultSettings(userId: string): Promise<UserSettings> {
    const defaultSettings = this.settingsRepository.create({
      userId,
      theme: 'light',
      appearanceColor: 'green',
      fontSize: 16,
      wallpaper: '',
      fontFamily: 'Inter',
      accentColor: '#3B82F6',
      smartEmotionDetection: false,
      autoWorkflowSuggestions: true,
      aiMemoryEnabled: true,
      enabledAgents: [
        'core_assistant',
        'task_agent',
        'deadline_agent',
        'sprint_summary',
        'document_agent',
        'knowledge_search',
        'workspace_agent',
      ],
    });
    return await this.settingsRepository.save(defaultSettings);
  }

  async update(
    userId: string,
    updateUserSettingsDto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    this.logger.log(`[UserSettings] Updating settings for userId: ${userId}`);
    this.logger.debug(
      `[UserSettings] Update data:`,
      JSON.stringify(updateUserSettingsDto),
    );

    const settings = await this.findByUserId(userId);
    this.logger.log(`[UserSettings] Found settings id: ${settings.id}`);

    // Explicitly assign each field
    if (updateUserSettingsDto.theme !== undefined) {
      settings.theme = updateUserSettingsDto.theme;
    }
    if (updateUserSettingsDto.appearanceColor !== undefined) {
      settings.appearanceColor = updateUserSettingsDto.appearanceColor;
    }
    if (updateUserSettingsDto.fontSize !== undefined) {
      settings.fontSize = updateUserSettingsDto.fontSize;
    }
    if (updateUserSettingsDto.fontFamily !== undefined) {
      settings.fontFamily = updateUserSettingsDto.fontFamily;
    }
    if (updateUserSettingsDto.accentColor !== undefined) {
      settings.accentColor = updateUserSettingsDto.accentColor;
    }
    if (updateUserSettingsDto.wallpaper !== undefined) {
      settings.wallpaper = updateUserSettingsDto.wallpaper;
    }
    if (updateUserSettingsDto.smartEmotionDetection !== undefined) {
      settings.smartEmotionDetection =
        updateUserSettingsDto.smartEmotionDetection;
    }
    if (updateUserSettingsDto.autoWorkflowSuggestions !== undefined) {
      settings.autoWorkflowSuggestions =
        updateUserSettingsDto.autoWorkflowSuggestions;
    }
    if (updateUserSettingsDto.aiMemoryEnabled !== undefined) {
      settings.aiMemoryEnabled = updateUserSettingsDto.aiMemoryEnabled;
    }
    if (updateUserSettingsDto.enabledAgents !== undefined) {
      settings.enabledAgents = updateUserSettingsDto.enabledAgents;
    }

    const savedSettings = await this.settingsRepository.save(settings);
    this.logger.log(
      `[UserSettings] Settings saved successfully for userId: ${userId}`,
    );
    this.logger.debug(
      `[UserSettings] Saved data:`,
      JSON.stringify(savedSettings),
    );

    return savedSettings;
  }

  async delete(userId: string): Promise<void> {
    const result = await this.settingsRepository.delete({ userId });
    if (result.affected === 0) {
      throw new NotFoundException('User settings not found');
    }
  }
}
