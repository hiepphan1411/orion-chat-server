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

    const matchedDevice = userDevices.find(
      (device) =>
        device.deviceName === createDto.deviceName &&
        device.deviceType === createDto.deviceType &&
        (device.deviceModel || '') === (createDto.deviceModel || '') &&
        (device.osType || '') === (createDto.osType || '') &&
        (device.osVersion || '') === (createDto.osVersion || ''),
    );

    if (!matchedDevice) {
      return this.create(createDto);
    }

    Object.assign(matchedDevice, {
      appVersion: createDto.appVersion,
      refreshToken: createDto.refreshToken,
      fcmToken: createDto.fcmToken,
      ipAddress: createDto.ipAddress,
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
