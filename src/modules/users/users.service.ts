import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

//Để test

type UploadedFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private toSafeUser(user: User) {
    return {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      email: user.email,
      gender: user.gender,
      birthDate: user.birthDate,
      avatarUrl: user.avatarUrl,
      coverImage: user.coverImage,
      isOnline: user.isOnline,
      showOnlineStatus: user.showOnlineStatus,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async create(createUserDto: CreateUserDto) {
    const existingByPhone = await this.userRepository.findOne({
      where: { phoneNumber: createUserDto.phoneNumber },
    });

    if (existingByPhone) {
      throw new BadRequestException('Phone number already exists');
    }

    if (createUserDto.email) {
      const existingByEmail = await this.userRepository.findOne({
        where: { email: createUserDto.email },
      });

      if (existingByEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      phoneNumber: createUserDto.phoneNumber,
      fullName: createUserDto.fullName,
      email: createUserDto.email,
      gender: createUserDto.gender,
      passwordHash,
    });

    const savedUser = await this.userRepository.save(user);
    return this.toSafeUser(savedUser);
  }

  async findAll() {
    const users = await this.userRepository.find();
    return users.map((user) => this.toSafeUser(user));
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      message: 'Profile fetched successfully',
      data: this.toSafeUser(user),
      timestamp: new Date().toISOString(),
    };
  }

  async updateProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
    uploadedFiles?: {
      avatar?: UploadedFile;
      cover?: UploadedFile;
    },
  ) {
    const user = await this.userRepository.findOne({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check email uniqueness if email is being updated
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    // Update basic fields
    if (updateUserDto.fullName) user.fullName = updateUserDto.fullName;
    if (updateUserDto.gender) user.gender = updateUserDto.gender;
    if (updateUserDto.birthDate)
      user.birthDate = new Date(updateUserDto.birthDate);
    if (updateUserDto.email) user.email = updateUserDto.email;

    // Handle uploaded files
    if (uploadedFiles?.avatar) {
      const filename = uploadedFiles.avatar.filename;

      if (!filename) {
        throw new BadRequestException('Avatar upload failed');
      }

      user.avatarUrl = `/uploads/avatars/${filename}`;
    }

    if (uploadedFiles?.cover) {
      const filename = uploadedFiles.cover.filename;

      if (!filename) {
        throw new BadRequestException('Cover upload failed');
      }

      user.coverImage = `/uploads/covers/${filename}`;
    }

    const updatedUser = await this.userRepository.save(user);

    return {
      success: true,
      message: 'Profile updated successfully',
      data: this.toSafeUser(updatedUser),
      timestamp: new Date().toISOString(),
    };
  }
}
