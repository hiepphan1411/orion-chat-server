import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDevices } from './entities/user-devices.entity';
import {
  CreateUserDevicesDto,
  UpdateUserDevicesDto,
} from './dto/user-devices.dto';

@Injectable()
export class UserDevicesService {
  private readonly logger = new Logger(UserDevicesService.name);

  private normalizeValue(value?: string | null): string {
    return (value || '').trim().toLowerCase();
  }

  private isUnknownValue(value?: string | null): boolean {
    const normalized = this.normalizeValue(value);
    return (
      !normalized ||
      normalized === 'unknown' ||
      normalized === 'unknown os' ||
      normalized === 'unknown device' ||
      normalized === 'web browser' ||
      normalized === 'n/a'
    );
  }

  private valueMatches(existing?: string | null, incoming?: string | null): boolean {
    const normalizedExisting = this.normalizeValue(existing);
    const normalizedIncoming = this.normalizeValue(incoming);

    if (this.isUnknownValue(normalizedExisting) || this.isUnknownValue(normalizedIncoming)) {
      return true;
    }

    return normalizedExisting === normalizedIncoming;
  }

  private extractBrowser(deviceName?: string | null, deviceModel?: string | null): string {
    if (!this.isUnknownValue(deviceModel)) {
      return this.normalizeValue(deviceModel);
    }

    const name = this.normalizeValue(deviceName);
    if (!name) return '';
    const [browserPart] = name.split(' on ');
    return browserPart?.trim() || '';
  }

  private getPreferredValue(existing?: string | null, incoming?: string | null): string {
    return this.isUnknownValue(incoming) ? existing || '' : incoming || '';
  }

  constructor(
    @InjectRepository(UserDevices)
    private devicesRepository: Repository<UserDevices>,
  ) {}

  async create(createDto: CreateUserDevicesDto): Promise<UserDevices> {
    const device = this.devicesRepository.create(createDto);
    const saved = await this.devicesRepository.save(device);
    await this.devicesRepository.update(saved.id, { lastLogin: new Date() });
    const result = await this.devicesRepository.findOne({
      where: { id: saved.id },
    });
    if (!result) {
      throw new NotFoundException('Failed to retrieve created device');
    }
    return result;
  }

  async createOrUpdateFromLogin(
    createDto: CreateUserDevicesDto,
  ): Promise<UserDevices> {
    const userDevices = await this.devicesRepository.find({
      where: { userId: createDto.userId },
      order: { createdAt: 'DESC' },
    });

    const incomingBrowser = this.extractBrowser(
      createDto.deviceName,
      createDto.deviceModel,
    );

    const matchedDevice = userDevices.find((device) => {
      const existingBrowser = this.extractBrowser(
        device.deviceName,
        device.deviceModel,
      );

      return (
        this.valueMatches(existingBrowser, incomingBrowser) &&
        this.valueMatches(device.osType, createDto.osType) &&
        this.valueMatches(device.deviceType, createDto.deviceType)
      );
    });

    if (!matchedDevice) {
      return this.create(createDto);
    }

    const nextDeviceModel = this.getPreferredValue(
      matchedDevice.deviceModel,
      createDto.deviceModel,
    );
    const nextOsType = this.getPreferredValue(matchedDevice.osType, createDto.osType);
    const nextOsVersion = this.getPreferredValue(
      matchedDevice.osVersion,
      createDto.osVersion,
    );
    const nextDeviceType = this.getPreferredValue(
      matchedDevice.deviceType,
      createDto.deviceType,
    );
    const nextBrowser = this.extractBrowser(createDto.deviceName, nextDeviceModel) ||
      this.extractBrowser(matchedDevice.deviceName, matchedDevice.deviceModel) ||
      'Unknown Device';
    const nextDeviceName = `${nextBrowser} on ${nextOsType || 'Unknown OS'}`;

    Object.assign(matchedDevice, {
      deviceName: nextDeviceName,
      deviceType: nextDeviceType,
      deviceModel: nextDeviceModel,
      osType: nextOsType,
      osVersion: nextOsVersion,
      appVersion: this.getPreferredValue(matchedDevice.appVersion, createDto.appVersion),
      refreshToken: createDto.refreshToken,
      fcmToken: this.getPreferredValue(matchedDevice.fcmToken, createDto.fcmToken),
      ipAddress: this.getPreferredValue(matchedDevice.ipAddress, createDto.ipAddress),
      isActive: true,
      lastLogin: new Date(),
    });

    return this.devicesRepository.save(matchedDevice);
  }

  async findByUserId(userId: string): Promise<UserDevices[]> {
    const devices = await this.devicesRepository.find({
      where: { userId },
      order: { lastLogin: 'DESC' },
    });
    this.logger.log(
      `[UserDevicesService] Found ${devices.length} devices:`,
      JSON.stringify(devices),
    );
    return devices;
  }

  async findById(id: string): Promise<UserDevices> {
    const device = await this.devicesRepository.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async update(
    id: string,
    updateDto: UpdateUserDevicesDto,
  ): Promise<UserDevices> {
    const device = await this.findById(id);
    Object.assign(device, updateDto);
    return await this.devicesRepository.save(device);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.devicesRepository.update(id, { lastLogin: new Date() });
  }

  async removeDevice(id: string): Promise<void> {
    const result = await this.devicesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Device not found');
    }
  }

  async removeAllDevicesExceptCurrent(
    userId: string,
    currentDeviceId: string,
  ): Promise<void> {
    const devices = await this.devicesRepository.find({ where: { userId } });
    const toDelete = devices.filter((d) => d.id !== currentDeviceId);

    for (const device of toDelete) {
      await this.devicesRepository.delete(device.id);
    }
  }

  async deactivateDevice(id: string): Promise<UserDevices> {
    await this.devicesRepository.update(id, { isActive: false });
    return await this.findById(id);
  }

  async getActiveDevices(userId: string): Promise<UserDevices[]> {
    return await this.devicesRepository.find({
      where: { userId, isActive: true },
    });
  }
}
