/* eslint-disable */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Otp } from './entities/otp.entity';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { CompleteRegisterDto } from './dto/complete-register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly esmsApiKey: string;
  private readonly esmsSecretKey: string;
  private readonly esmsBaseUrl: string;

  constructor(
    @InjectRepository(Otp)
    private otpRepo: Repository<Otp>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private configService: ConfigService,
  ) {
    this.esmsApiKey = this.configService.get('ESMS_API_KEY') || '';
    this.esmsSecretKey = this.configService.get('ESMS_SECRET_KEY') || '';
    this.esmsBaseUrl = 'https://rest.esms.vn/MainService.svc/json';
  }

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateJwtToken(phoneNumber: string): string {
    const jwtSecret = this.configService.get('JWT_SECRET') || 'your-secret-key';
    const jwtExpiresIn = this.configService.get('JWT_EXPIRES_IN') || '24h';

    // Generate simple JWT token manually
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const payload = Buffer.from(
      JSON.stringify({
        phoneNumber,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpiry(jwtExpiresIn),
      }),
    ).toString('base64');

    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64');

    return `${header}.${payload}.${signature}`;
  }

  private parseExpiry(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([a-z]+)$/);
    if (!match) return 86400; // default 24h

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 86400;
    }
  }

  async sendOtp(phoneNumber: string) {
    try {
      // Validate phone number
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new BadRequestException('Số điện thoại không hợp lệ');
      }

      const existingUser = await this.userRepo.findOne({
        where: { phoneNumber },
      });
      if (existingUser != null) {
        throw new BadRequestException('Số điện thoại đã tồn tại');
      }

      // Delete old OTP for this phone number
      await this.otpRepo.delete({ phoneNumber });

      const otp = this.generateOtp();

      // Log to console in development
      console.log(`\n${'='.repeat(60)}`);
      console.log(`OTP CONSOLE OUTPUT`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Phone: ${phoneNumber}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`Expires in: 5 minutes`);
      console.log(`${'='.repeat(60)}\n`);

      // Save new OTP to database
      const savedOtp = await this.otpRepo.save({
        phoneNumber,
        code: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      // Send SMS via eSMS
      await this.sendSmsThroughEsms(phoneNumber, otp);

      return {
        success: true,
        message: 'OTP đã được gửi thành công',
        data: {
          phoneNumber,
          otpId: savedOtp.id,
          expiresIn: 300, // 5 minutes in seconds
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error sending OTP:', error);
      throw new BadRequestException(
        error.message || 'Lỗi gửi OTP. Vui lòng thử lại.',
      );
    }
  }
  async sendOtpForgetPassword(phoneNumber: string) {
    try {
      // Validate phone number
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new BadRequestException('Số điện thoại không hợp lệ');
      }
      const existingUser = await this.userRepo.findOne({
        where: { phoneNumber },
      });
      if (!existingUser) {
        throw new BadRequestException('Số điện thoại không tồn tại');
      }

      // Delete old OTP for this phone number
      await this.otpRepo.delete({ phoneNumber });

      const otp = this.generateOtp();

      // Log to console in development
      console.log(`\n${'='.repeat(60)}`);
      console.log(`OTP CONSOLE OUTPUT`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Phone: ${phoneNumber}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`Expires in: 5 minutes`);
      console.log(`${'='.repeat(60)}\n`);

      // Save new OTP to database
      const savedOtp = await this.otpRepo.save({
        phoneNumber,
        code: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      // Send SMS via eSMS
      await this.sendSmsThroughEsms(phoneNumber, otp);

      return {
        success: true,
        message: 'OTP đã được gửi thành công',
        data: {
          phoneNumber,
          otpId: savedOtp.id,
          expiresIn: 300, // 5 minutes in seconds
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error sending OTP:', error);
      throw new BadRequestException(
        error.message || 'Lỗi gửi OTP. Vui lòng thử lại.',
      );
    }
  }

  private async sendSmsThroughEsms(
    phoneNumber: string,
    otp: string,
  ): Promise<void> {
    try {
      // Validate eSMS credentials
      if (!this.esmsApiKey || !this.esmsSecretKey) {
        this.logger.warn(
          'eSMS credentials not configured. OTP saved to DB but SMS not sent.',
        );
        this.logger.log(`[TEST MODE] OTP for ${phoneNumber}: ${otp}`);
        return;
      }

      this.logger.log(`Sending OTP SMS to: ${phoneNumber}`);
      this.logger.log(`Using API Key: ${this.esmsApiKey.substring(0, 10)}...`);

      const response = await axios.get(
        `${this.esmsBaseUrl}/SendMultipleMessage_V4_get`,
        {
          params: {
            Phone: phoneNumber,
            Content: `Ma OTP cua ban la ${otp}. Hieu luc trong 5 phut.`,
            ApiKey: this.esmsApiKey,
            SecretKey: this.esmsSecretKey,
            SmsType: 1, // 1 = Advertising SMS (no brand name required)
          },
          timeout: 10000,
        },
      );

      this.logger.log(`✓ eSMS API Response:`, JSON.stringify(response.data));

      // Check if eSMS API returned success (CodeResult: "100")
      if (response?.data?.CodeResult === '100') {
        this.logger.log(`✓ OTP successfully sent to ${phoneNumber}`);
      } else {
        this.logger.warn(
          `⚠ eSMS response code: ${response?.data?.CodeResult}, message: ${response?.data?.ErrorMessage}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error calling eSMS API for ${phoneNumber}:`,
        error instanceof Error ? error.message : error,
      );
      this.logger.warn(
        `OTP saved to database but SMS delivery failed. Please check eSMS credentials.`,
      );
    }
  }

  async verifyOtp(phoneNumber: string, otp: string) {
    try {
      if (!phoneNumber || !otp) {
        throw new BadRequestException('Phone number and OTP are required');
      }

      const record = await this.otpRepo.findOne({
        where: { phoneNumber, code: otp },
      });

      if (!record) {
        throw new BadRequestException('OTP không hợp lệ');
      }

      // Check if OTP has expired
      if (record.expiresAt < new Date()) {
        throw new BadRequestException('OTP đã hết hạn');
      }

      // Delete used OTP
      await this.otpRepo.remove(record);

      return {
        success: true,
        message: 'OTP hợp lệ',
        data: {
          phoneNumber,
          verified: true,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error verifying OTP:', error);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(
            error.message || 'Lỗi xác minh OTP. Vui lòng thử lại.',
          );
    }
  }

  async completeRegister(data: CompleteRegisterDto) {
    try {
      // Validate required fields
      if (
        !data.phoneNumber ||
        !data.password ||
        !data.fullName ||
        !data.birthDate
      ) {
        throw new BadRequestException(
          'Các trường bắt buộc không được để trống',
        );
      }

      // Check if phone number already exists
      const existingUser = await this.userRepo.findOne({
        where: { phoneNumber: data.phoneNumber },
      });

      if (existingUser) {
        throw new BadRequestException(
          'Số điện thoại đã được đăng ký trong hệ thống',
        );
      }

      // Validate password strength
      if (data.password.length < 8) {
        throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
      }

      // Hash password
      const hash = await bcrypt.hash(data.password, 10);

      // Create and save user
      const user = this.userRepo.create({
        phoneNumber: data.phoneNumber,
        passwordHash: hash,
        fullName: data.fullName,
        birthDate: data.birthDate,
        gender: data.gender,
      });

      const savedUser = await this.userRepo.save(user);

      // Delete OTP after successful registration
      await this.otpRepo.delete({ phoneNumber: data.phoneNumber });

      this.logger.log(`User registered successfully: ${data.phoneNumber}`);

      return {
        success: true,
        message: 'Đăng ký thành công',
        data: {
          phoneNumber: savedUser.phoneNumber,
          fullName: savedUser.fullName,
          birthDate: savedUser.birthDate,
          gender: savedUser.gender,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error completing registration:', error);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(
            error.message || 'Lỗi đăng ký. Vui lòng thử lại.',
          );
    }
  }

  async login(phoneNumber: string, password: string) {
    try {
      // Validate input
      if (!phoneNumber || !password) {
        throw new BadRequestException('Số điện thoại và mật khẩu là bắt buộc');
      }

      this.logger.log(`🔐 Login attempt for: ${phoneNumber}`);

      // Find user by phone number
      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        this.logger.warn(`⚠ User not found: ${phoneNumber}`);
        throw new BadRequestException('Số điện thoại hoặc mật khẩu sai');
      }

      // Compare password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        this.logger.warn(`⚠ Invalid password for user: ${phoneNumber}`);
        throw new BadRequestException('Số điện thoại hoặc mật khẩu sai');
      }

      this.logger.log(`Login successful for: ${phoneNumber}`);

      // Generate JWT token
      const token = this.generateJwtToken(phoneNumber);

      // Log to console in development
      console.log(`\n${'='.repeat(60)}`);
      console.log(`LOGIN SUCCESSFUL`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Phone: ${phoneNumber}`);
      console.log(`Full Name: ${user.fullName}`);
      console.log(`Token: ${token.substring(0, 50)}...`);
      console.log(`Login Time: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(60)}\n`);

      // Return user data with JWT token
      return {
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          token,
          phoneNumber: user.phoneNumber,
          fullName: user.fullName,
          birthDate: user.birthDate,
          gender: user.gender,
          loginTime: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error during login:', error);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(
            error.message || 'Lỗi đăng nhập. Vui lòng thử lại.',
          );
    }
  }
}
