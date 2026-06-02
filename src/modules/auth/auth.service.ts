/* eslint-disable */
import {
  Injectable,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Otp } from './entities/otp.entity';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { CompleteRegisterDto } from './dto/complete-register.dto';
import { UserDevicesService } from '../user-devices/user-devices.service';
import { CreateUserDevicesDto } from '../user-devices/dto/user-devices.dto';
import { PresenceGateway } from '../presence/presence.gateway';

type LoginDevicePayload = Partial<
  Pick<
    CreateUserDevicesDto,
    | 'deviceName'
    | 'deviceType'
    | 'deviceModel'
    | 'osType'
    | 'osVersion'
    | 'appVersion'
    | 'fcmToken'
    | 'ipAddress'
  >
>;

type QrLoginStatus = 'pending' | 'confirmed';

type QrLoginSession = {
  sessionId: string;
  qrToken: string;
  status: QrLoginStatus;
  expiresAt: Date;
  createdAt: Date;
  devicePayload?: LoginDevicePayload;
  confirmedByUserId?: string;
  confirmedAt?: Date;
  loginData?: Record<string, unknown>;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly esmsApiKey: string;
  private readonly esmsSecretKey: string;
  private readonly esmsBaseUrl: string;
  private readonly qrLoginSessions = new Map<string, QrLoginSession>();
  private readonly qrLoginTokens = new Map<string, string>();

  constructor(
    @InjectRepository(Otp)
    private otpRepo: Repository<Otp>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private userDevicesService: UserDevicesService,

    private jwtService: JwtService,
    private configService: ConfigService,
    private presenceGateway: PresenceGateway,
  ) {
    this.esmsApiKey = this.configService.get('ESMS_API_KEY') || '';
    this.esmsSecretKey = this.configService.get('ESMS_SECRET_KEY') || '';
    this.esmsBaseUrl = 'https://rest.esms.vn/MainService.svc/json';
  }

  private async syncDeviceOnLogin(
    userId: string,
    refreshToken: string,
    devicePayload?: LoginDevicePayload,
  ): Promise<void> {
    const browserFromName = devicePayload?.deviceName?.split(' on ')[0]?.trim();

    const createDeviceDto: CreateUserDevicesDto = {
      userId,
      deviceName: devicePayload?.deviceName || 'Unknown Device',
      deviceType: devicePayload?.deviceType || 'web',
      deviceModel:
        devicePayload?.deviceModel || browserFromName || 'Web Browser',
      osType: devicePayload?.osType || 'Unknown OS',
      osVersion: devicePayload?.osVersion || '',
      appVersion: devicePayload?.appVersion || 'web',
      refreshToken,
      fcmToken: devicePayload?.fcmToken || '',
      ipAddress: devicePayload?.ipAddress || '',
    };

    await this.userDevicesService.createOrUpdateFromLogin(createDeviceDto);
  }

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private generateJwtToken(
    phoneNumber: string,
    userId: string,
    deviceType: string = 'web',
  ): string {
    return this.jwtService.sign(
      { phoneNumber, userId, deviceType },
      {
        expiresIn: '24h', // Token valid for 24 hours
      },
    );
  }

  private buildLoginData(user: User, token: string) {
    return {
      token,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      birthDate: user.birthDate,
      gender: user.gender,
      loginTime: new Date().toISOString(),
      userId: user.userId,
      email: user.email,
      avatarUrl: user.avatarUrl,
      coverImage: user.coverImage,
      isOnline: user.isOnline,
      showOnlineStatus: user.showOnlineStatus,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private cleanupExpiredQrLoginSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.qrLoginSessions.entries()) {
      if (session.expiresAt.getTime() <= now) {
        this.qrLoginSessions.delete(sessionId);
        this.qrLoginTokens.delete(session.qrToken);
      }
    }
  }

  createQrLoginSession(devicePayload?: LoginDevicePayload) {
    this.cleanupExpiredQrLoginSessions();

    const sessionId = randomUUID();
    const qrToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    const session: QrLoginSession = {
      sessionId,
      qrToken,
      status: 'pending',
      expiresAt,
      createdAt: new Date(),
      devicePayload: {
        ...devicePayload,
        deviceType: 'web',
      },
    };

    this.qrLoginSessions.set(sessionId, session);
    this.qrLoginTokens.set(qrToken, sessionId);

    return {
      success: true,
      message: 'Táº¡o mÃ£ QR Ä‘Äƒng nháº­p thÃ nh cÃ´ng',
      data: {
        sessionId,
        qrToken,
        qrData: `orionchatmobile://qr-login?token=${encodeURIComponent(qrToken)}`,
        expiresAt: expiresAt.toISOString(),
        expiresIn: 120,
      },
      timestamp: new Date().toISOString(),
    };
  }

  getQrLoginSession(sessionId: string) {
    this.cleanupExpiredQrLoginSessions();

    const session = this.qrLoginSessions.get(sessionId);
    if (!session) {
      return {
        success: true,
        data: {
          status: 'expired',
        },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: {
        status: session.status,
        expiresAt: session.expiresAt.toISOString(),
        confirmedAt: session.confirmedAt?.toISOString(),
        loginData: session.loginData,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async confirmQrLogin(qrToken: string, userId: string) {
    this.cleanupExpiredQrLoginSessions();

    const sessionId = this.qrLoginTokens.get(qrToken);
    const session = sessionId ? this.qrLoginSessions.get(sessionId) : null;

    if (!session) {
      throw new BadRequestException('MÃ£ QR Ä‘Ã£ háº¿t háº¡n hoáº·c khÃ´ng há»£p lá»‡');
    }

    if (session.status === 'confirmed') {
      return {
        success: true,
        message: 'MÃ£ QR Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n',
        data: {
          status: 'confirmed',
        },
        timestamp: new Date().toISOString(),
      };
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new BadRequestException('NgÆ°á»i dÃ¹ng khÃ´ng tá»“n táº¡i');
    }

    const oldSessionExists = user.webSessionToken;
    const token = this.generateJwtToken(user.phoneNumber, user.userId, 'web');
    const now = new Date();

    user.webSessionToken = token;
    user.webSessionStartedAt = now;
    user.webLastActivityAt = Date.now();
    user.lastLoginAt = now;
    user.lastActivityAt = Date.now();
    await this.userRepo.save(user);

    if (oldSessionExists) {
      this.emitSessionConflict(user.userId, 'web', 'web', oldSessionExists);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    try {
      await this.syncDeviceOnLogin(user.userId, token, {
        deviceName: session.devicePayload?.deviceName || 'QR Login on Web',
        deviceType: 'web',
        deviceModel: session.devicePayload?.deviceModel || 'Web Browser',
        osType: session.devicePayload?.osType || 'Unknown OS',
        osVersion: session.devicePayload?.osVersion,
        appVersion: session.devicePayload?.appVersion || 'web',
        ipAddress: session.devicePayload?.ipAddress,
      });
    } catch (deviceError) {
      this.logger.warn(
        `Failed to sync QR login device for user ${user.userId}: ${
          deviceError instanceof Error ? deviceError.message : deviceError
        }`,
      );
    }

    session.status = 'confirmed';
    session.confirmedByUserId = user.userId;
    session.confirmedAt = new Date();
    session.loginData = this.buildLoginData(user, token);
    this.qrLoginSessions.set(session.sessionId, session);

    return {
      success: true,
      message: 'ÄÃ£ xÃ¡c nháº­n Ä‘Äƒng nháº­p web',
      data: {
        status: 'confirmed',
      },
      timestamp: new Date().toISOString(),
    };
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
        return {
          success: false,
          message: 'Số điện thoại đã tồn tại',
        };
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
      console.log(`Expires in: 1 minute`);
      console.log(`${'='.repeat(60)}\n`);

      // Save new OTP to database
      const savedOtp = await this.otpRepo.save({
        phoneNumber,
        code: otp,
        expiresAt: new Date(Date.now() + 1 * 60 * 1000),
      });

      // Send SMS via eSMS
      await this.sendSmsThroughEsms(phoneNumber, otp);

      return {
        success: true,
        message: 'OTP đã được gửi thành công',
        data: {
          phoneNumber,
          otpId: savedOtp.id,
          expiresIn: 60, // 1 minute in seconds
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
        return {
          success: false,
          message: 'Số điện thoại không tồn tại',
        };
      }

      // xóa OTP cũ cho số điện thoại này
      await this.otpRepo.delete({ phoneNumber });

      const otp = this.generateOtp();

      console.log(`OTP CONSOLE OUTPUT\n`);
      console.log(`Phone: ${phoneNumber}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`Expires in: 1 minute`);
      console.log(`${'='.repeat(60)}\n`);

      // lưu OTP mới vào cơ sở dữ liệu
      const savedOtp = await this.otpRepo.save({
        phoneNumber,
        code: otp,
        expiresAt: new Date(Date.now() + 1 * 60 * 1000),
      });

      // Send SMS via eSMS
      await this.sendSmsThroughEsms(phoneNumber, otp);

      return {
        success: true,
        message: 'OTP đã được gửi thành công',
        data: {
          phoneNumber,
          otpId: savedOtp.id,
          expiresIn: 60, // 1 minute in seconds
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
        this.logger.log(`OTP successfully sent to ${phoneNumber}`);
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
        this.logger.warn(`OTP đã hết hạn. Vui lòng yêu cầu OTP mới. (Phone: ${phoneNumber})`);
        throw new BadRequestException('OTP đã hết hạn. Vui lòng yêu cầu OTP mới.');
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
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error verifying OTP:', error);
      throw new BadRequestException(
        error.message || 'Lỗi xác minh OTP. Vui lòng thử lại.',
      );
    }
  }

  async completeRegister(data: CompleteRegisterDto) {
    try {
      console.log('[AuthService.completeRegister] Received data:', data);
      console.log('[AuthService.completeRegister] Field check:', {
        phoneNumber: data.phoneNumber,
        password: data.password,
        fullName: data.fullName,
        birthDate: data.birthDate,
      });

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

      const birthDate = new Date(data.birthDate);

      // Create and save user

      const user = this.userRepo.create({
        phoneNumber: data.phoneNumber,
        passwordHash: hash,
        fullName: data.fullName,
        birthDate: birthDate,
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

  private emitSessionConflict(
    userId: string,
    oldPlatform: string,
    newPlatform: string,
    oldToken?: string,
  ): void {
    console.log(
      `[emitSessionConflict] Called with userId=${userId}, oldPlatform=${oldPlatform}, newPlatform=${newPlatform}`,
    );
    try {
      console.log(
        `[emitSessionConflict] Checking gateway: presenceGateway=${!!this.presenceGateway}, server=${!!this.presenceGateway?.server}`,
      );
      if (!this.presenceGateway || !this.presenceGateway.server) {
        console.log(
          `[emitSessionConflict] WARN: Presence gateway not available!`,
        );
        this.logger.warn(
          'Presence gateway not available for emitting session conflict',
        );
        return;
      }

      const eventData = {
        message: `Tài khoản của bạn được đăng nhập từ thiết bị ${newPlatform} khác. Phiên hiện tại sẽ bị đóng.`,
        oldPlatform,
        newPlatform,
        timestamp: new Date().toISOString(),
      };

      const emitted =
        !!oldToken &&
        this.presenceGateway.emitSessionConflictToToken(
          userId,
          oldPlatform,
          oldToken,
          eventData,
        );

      if (!emitted) {
        const roomName = `user:${userId}:${oldPlatform}`;
        console.log(
          `[emitSessionConflict] Emitting to room ${roomName}: ${JSON.stringify(eventData)}`,
        );

        // Fallback: emit to platform room if token targeting fails
        this.presenceGateway.server
          .to(roomName)
          .emit('session:conflict', eventData);
      }

      console.log(`[emitSessionConflict] Event emitted successfully`);

      this.logger.log(
        `[Session Conflict] Notified ${oldPlatform} devices of user ${userId} about new login from ${newPlatform}`,
      );
    } catch (error) {
      console.log(`[emitSessionConflict] ERROR: ${JSON.stringify(error)}`);
      this.logger.error('Error emitting session conflict:', error);
    }
  }

  async login(
    phoneNumber: string,
    password: string,
    devicePayload?: LoginDevicePayload,
  ) {
    try {
      // Validate input
      if (!phoneNumber || !password) {
        throw new BadRequestException('Số điện thoại và mật khẩu là bắt buộc');
      }

      const platform = (devicePayload?.deviceType || 'web').toLowerCase();

      this.logger.log(
        `Login attempt for: ${phoneNumber} (Platform: ${platform || 'unknown'})`,
      );
      this.logger.log(
        `[Login] devicePayload.deviceType: ${devicePayload?.deviceType}`,
      );

      // Find user by phone number

      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        this.logger.warn(`User not found: ${phoneNumber}`);
        throw new BadRequestException('Số điện thoại hoặc mật khẩu sai');
      }

      // Compare password

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password for user: ${phoneNumber}`);
        throw new BadRequestException('Số điện thoại hoặc mật khẩu sai');
      }

      this.logger.log(`Login successful for: ${phoneNumber}`);

      // Generate JWT token with both phoneNumber and userId (UUID)
      const token = this.generateJwtToken(phoneNumber, user.userId, platform);

      // quản lý phiên đăng nhập
      const now = new Date();

      // Check if there's an existing session on the same platform and notify old devices to logout

      console.log(
        `[Login DEBUG] User object before token check:`,
        JSON.stringify({
          userId: user.userId,
          mobileSessionToken: !!user.mobileSessionToken,
          webSessionToken: !!user.webSessionToken,
          platform,
        }),
      );

      const oldSessionExists =
        platform === 'mobile' ? user.mobileSessionToken : user.webSessionToken;

      this.logger.log(
        `[Login] User ${user.userId} (${platform}): oldSessionExists=${!!oldSessionExists}`,
      );

      console.log(
        `[Login DEBUG] About to check presenceGateway:`,
        `gateway=${!!this.presenceGateway}, server=${!!this.presenceGateway?.server}`,
      );

      // IMPORTANT: Update token BEFORE emitting conflict
      // This ensures token is already updated in DB when old devices receive conflict event
      // Otherwise, old device logout and delete token, but it's still the old token!
      if (platform === 'mobile') {
        user.mobileSessionToken = token;
        user.mobileSessionStartedAt = now;
        user.mobileLastActivityAt = Date.now();
      } else if (platform === 'web') {
        user.webSessionToken = token;
        user.webSessionStartedAt = now;
        user.webLastActivityAt = Date.now();
      } else {
        // mặc định: coi như web để tương thích ngược
        user.webSessionToken = token;
        user.webSessionStartedAt = now;
        user.webLastActivityAt = Date.now();
        user.currentSessionToken = token;
      }

      // Save to database FIRST before emitting events
      await this.userRepo.save(user);

      // NOW emit conflict events for same-platform old sessions only
      if (oldSessionExists) {
        this.logger.log(
          `[Login] Found existing ${platform} session for user ${user.userId}, notifying old ${platform} devices`,
        );
        console.log(
          `[Emit DEBUG] About to emit for same platform - userId: ${user.userId}, platform: ${platform}`,
        );
        this.emitSessionConflict(
          user.userId,
          platform,
          platform,
          oldSessionExists,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        console.log(
          `[Emit DEBUG] No old same-platform session found, skipping emit`,
        );
      }

      if (!oldSessionExists) {
        this.logger.log(
          `[Login] No existing sessions for user ${user.userId}, first login on ${platform}`,
        );
        console.log(`[Emit DEBUG] First login scenario - no emit needed`);
      }

      // Update last login info
      user.lastLoginAt = now;
      user.lastActivityAt = Date.now();
      // Note: Already saved after token update, just update the final fields
      await this.userRepo.save(user);

      try {
        await this.syncDeviceOnLogin(user.userId, token, devicePayload);
      } catch (deviceError) {
        this.logger.warn(
          `Failed to sync login device for user ${user.userId}: ${
            deviceError instanceof Error ? deviceError.message : deviceError
          }`,
        );
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`LOGIN SUCCESSFUL`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Phone: ${phoneNumber}`);
      console.log(`Full Name: ${user.fullName}`);
      console.log(`Platform: ${platform || 'web'}`);
      console.log(`Token: ${token.substring(0, 50)}...`);
      console.log(`Login Time: ${new Date().toISOString()}`);
      console.log(`${'='.repeat(60)}\n`);

      // trả về dữ liệu người dùng với token JWT
      return {
        success: true,
        message: 'Đăng nhập thành công',
        data: this.buildLoginData(user, token),
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

  async logout(phoneNumberOrUserId: string, platform?: string, token?: string) {
    try {
      this.logger.log(
        `Logout attempt for: ${phoneNumberOrUserId} (Platform: ${platform || 'unknown'})`,
      );

      // Find user by phoneNumber or userId
      const user = await this.userRepo.findOne({
        where: [
          { phoneNumber: phoneNumberOrUserId },
          { userId: phoneNumberOrUserId },
        ],
      });

      if (!user) {
        throw new BadRequestException('Người dùng không tồn tại');
      }

      const normalizedPlatform = platform?.toLowerCase();
      const matchesWeb = token ? user.webSessionToken === token : false;
      const matchesMobile = token ? user.mobileSessionToken === token : false;

      // If a token is provided but doesn't match current sessions, do not clear
      if (token && !matchesWeb && !matchesMobile) {
        return {
          success: true,
          message: 'Phiên đã được thay thế, không cần đăng xuất',
          data: {
            phoneNumber: user.phoneNumber,
          },
          timestamp: new Date().toISOString(),
        };
      }

      // If platform not specified, infer from token match when possible
      let resolvedPlatform = normalizedPlatform;
      if (!resolvedPlatform && token) {
        if (matchesMobile) resolvedPlatform = 'mobile';
        if (matchesWeb) resolvedPlatform = 'web';
      }

      // xóa session theo nền tảng
      // IMPORTANT: Do NOT emit conflict events during logout
      // Logout is already handled client-side, emitting here would cause duplicate alerts
      if (resolvedPlatform === 'mobile') {
        user.mobileSessionToken = null as unknown as string;
        user.mobileSessionStartedAt = null as unknown as Date;
        user.mobileLastActivityAt = null as unknown as number;
      } else if (resolvedPlatform === 'web') {
        user.webSessionToken = null as unknown as string;
        user.webSessionStartedAt = null as unknown as Date;
        user.webLastActivityAt = null as unknown as number;
      } else {
        // Default: xóa tất cả session
        user.webSessionToken = null as unknown as string;
        user.mobileSessionToken = null as unknown as string;
        user.webSessionStartedAt = null as unknown as Date;
        user.mobileSessionStartedAt = null as unknown as Date;
        user.currentSessionToken = null as unknown as string;
      }

      await this.userRepo.save(user);

      this.logger.log(
        `✓ Logout successful for: ${phoneNumberOrUserId} (Platform: ${platform || 'unknown'})`,
      );

      return {
        success: true,
        message: 'Đăng xuất thành công',
        data: {
          phoneNumber: user.phoneNumber,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error during logout:', error);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException('Lỗi khi đăng xuất');
    }
  }

  async checkSessionConflict(phoneNumber: string, platform: string) {
    try {
      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        throw new BadRequestException('Người dùng không tồn tại');
      }

      // Kiểm tra xem có session cũ cùng platform hay không
      const hasConflict =
        platform === 'web' ? !!user.webSessionToken : !!user.mobileSessionToken;

      return {
        success: true,
        data: {
          phoneNumber,
          platform,
          hasConflict, // true = có device khác cùng platform đã login
          message: hasConflict
            ? `Bạn đã đăng nhập ở ${platform === 'web' ? 'thiết bị web' : 'thiết bị mobile'} khác`
            : 'Không có session conflict',
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error checking session conflict:', error);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException('Lỗi khi kiểm tra phiên đăng nhập');
    }
  }

  // xác minh OTP quên mật khẩu
  async verifyOtpForgetPassword(phoneNumber: string, otp: string) {
    try {
      // Validate inputs
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new BadRequestException('Số điện thoại không hợp lệ');
      }

      if (!otp || otp.length !== 6) {
        throw new BadRequestException('OTP phải có 6 chữ số');
      }

      // Check if user exists
      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        throw new BadRequestException('Số điện thoại không tồn tại');
      }

      // Find and validate OTP
      const otpRecord = await this.otpRepo.findOne({
        where: { phoneNumber, code: otp },
      });

      if (!otpRecord) {
        throw new BadRequestException('OTP không đúng');
      }

      // kiểm tra thời gian hết hạn
      if (new Date() > otpRecord.expiresAt) {
        await this.otpRepo.delete({ id: otpRecord.id });
        this.logger.warn(`OTP đã hết hạn. Vui lòng yêu cầu OTP mới. (Phone: ${phoneNumber})`);
        throw new BadRequestException(
          'OTP đã hết hạn. Vui lòng yêu cầu OTP mới.',
        );
      }

      // Đánh dấu OTP là đã xác minh
      otpRecord.verified = true;
      await this.otpRepo.save(otpRecord);

      return {
        success: true,
        message: 'OTP xác minh thành công',
        data: {
          phoneNumber,
          otpId: otpRecord.id,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error verifying OTP for forget password:', error);
      throw new BadRequestException(
        error.message || 'Lỗi xác minh OTP. Vui lòng thử lại.',
      );
    }
  }

  async resetPassword(data: {
    phoneNumber: string;
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    try {
      // Validate inputs
      if (!data.phoneNumber || data.phoneNumber.length < 10) {
        throw new BadRequestException('Số điện thoại không hợp lệ');
      }

      if (!data.otp || data.otp.length !== 6) {
        throw new BadRequestException('OTP phải có 6 chữ số');
      }

      if (!data.newPassword || data.newPassword.length < 8) {
        throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
      }

      if (data.newPassword !== data.confirmPassword) {
        throw new BadRequestException('Mật khẩu xác nhận không khớp');
      }

      // kiểm tra người dùng đã tồn tại
      const user = await this.userRepo.findOne({
        where: { phoneNumber: data.phoneNumber },
      });

      if (!user) {
        throw new BadRequestException('Số điện thoại không tồn tại');
      }

      // Verify OTP
      const otpRecord = await this.otpRepo.findOne({
        where: { phoneNumber: data.phoneNumber, code: data.otp },
      });

      if (!otpRecord) {
        throw new BadRequestException('OTP không đúng');
      }

      // kiểm tra thời gian hết hạn
      if (new Date() > otpRecord.expiresAt) {
        await this.otpRepo.delete({ id: otpRecord.id });
        this.logger.warn(`OTP đã hết hạn. Vui lòng yêu cầu OTP mới. (Phone: ${data.phoneNumber})`);
        throw new BadRequestException(
          'OTP đã hết hạn. Vui lòng yêu cầu OTP mới.',
        );
      }

      // kiểm tra OTP đã được xác minh
      if (!otpRecord.verified) {
        throw new BadRequestException('OTP chưa được xác minh');
      }

      // mã hóa mật khẩu mới
      const passwordHash = await bcrypt.hash(data.newPassword, 10);

      // cập nhật mật khẩu người dùng
      user.passwordHash = passwordHash;
      await this.userRepo.save(user);

      // xóa OTP đã sử dụng
      await this.otpRepo.delete({ id: otpRecord.id });

      this.logger.log(`Password reset successful for: ${data.phoneNumber}`);

      return {
        success: true,
        message: 'Mật khẩu đã được thay đổi thành công',
        data: {
          phoneNumber: data.phoneNumber,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Error resetting password:', error);
      throw new BadRequestException(
        error.message || 'Lỗi đặt lại mật khẩu. Vui lòng thử lại.',
      );
    }
  }
}
