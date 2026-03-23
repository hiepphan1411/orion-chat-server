import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Otp } from './entities/otp.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Otp, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ||
          '24h') as import('@nestjs/jwt').JwtSignOptions['expiresIn'];
        return {
          secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
          signOptions: {
            expiresIn: expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
