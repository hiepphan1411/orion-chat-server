import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../modules/users/users.module';
import { S3UploadService } from './services/s3-upload.service';

@Global()
@Module({
  imports: [UsersModule],
  providers: [JwtAuthGuard, S3UploadService],
  exports: [JwtAuthGuard, UsersModule, S3UploadService],
})
export class CommonModule {}
