import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { S3UploadService } from 'src/common/services/s3-upload.service';

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
    private readonly configService: ConfigService,
    private readonly s3UploadService: S3UploadService,
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
    if (updateUserDto.phoneNumber) user.phoneNumber = updateUserDto.phoneNumber;

    // Handle uploaded files
    if (uploadedFiles?.avatar) {
      user.avatarUrl = await this.uploadProfileImage(
        uploadedFiles.avatar,
        'avatars',
      );
    }

    if (uploadedFiles?.cover) {
      user.coverImage = await this.uploadProfileImage(
        uploadedFiles.cover,
        'covers',
      );
    }

    const updatedUser = await this.userRepository.save(user);

    return {
      success: true,
      message: 'Profile updated successfully',
      data: this.toSafeUser(updatedUser),
      timestamp: new Date().toISOString(),
    };
  }

  private async uploadProfileImage(
    file: UploadedFile,
    keyPrefix: string,
  ): Promise<string> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Image file buffer is required');
    }

    const region = this.configService.get<string>('AWS_REGION') ||
      this.configService.get<string>('S3_REGION') ||
      this.configService.get<string>('REGION');
    const accessKey = this.configService.get<string>('AWS_ACCESS_KEY_ID') ||
      this.configService.get<string>('S3_ACCESS_KEY_ID') ||
      this.configService.get<string>('ACCESS_KEY');
    const secretKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('SECRET_KEY');
    const bucketName = this.configService.get<string>('AWS_S3_BUCKET') ||
      this.configService.get<string>('S3_BUCKET_NAME') ||
      this.configService.get<string>('S3_BUCKET') ||
      this.configService.get<string>('BUCKET_NAME');

    if (!region || !accessKey || !secretKey || !bucketName) {
      throw new BadRequestException(
        'Missing S3 configuration: region, access key, secret key and bucket name are required',
      );
    }

    const result = await this.s3UploadService.uploadImageToS3({
      credentials: {
        region,
        accessKey,
        secretKey,
      },
      bucketName,
      file: {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
      },
      keyPrefix,
    });

    return result.url;
  }
}
