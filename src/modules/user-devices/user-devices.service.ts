import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserDevices } from './entities/user-devices.entity';
import {
  CreateUserDevicesDto,
  UpdateUserDevicesDto,
} from './dto/user-devices.dto';

@Injectable()
export class UserDevicesService {
  constructor(
    @InjectRepository(UserDevices)
    private devicesRepository: Repository<UserDevices>,
  ) {}

  async create(createDto: CreateUserDevicesDto): Promise<UserDevices> {
    const device = this.devicesRepository.create(createDto);
    const saved = await this.devicesRepository.save(device);
    await this.devicesRepository.update(saved.id, { lastLogin: new Date() });
    const result = await this.devicesRepository.findOne({ where: { id: saved.id } });
    if (!result) {
      throw new NotFoundException('Failed to retrieve created device');
    }
    return result;
  }

  async findByUserId(userId: string): Promise<UserDevices[]> {
    return await this.devicesRepository.find({
      where: { userId },
      order: { lastLogin: 'DESC' },
    });
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
