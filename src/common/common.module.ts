import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../modules/users/users.module';
import { S3UploadService } from './services/s3-upload.service';
import { OllamaAiService } from './services/ollama-ai.service';
import { GeminiAiService } from './services/gemini-ai.service';
import { GeminiApiKeyConfigService } from './services/gemini-api-key-config.service';
import { GeminiApiKeyManagementService } from './services/gemini-api-key-management.service';

@Global()
@Module({
  imports: [UsersModule],
  providers: [
    JwtAuthGuard,
    S3UploadService,
    GeminiApiKeyConfigService,
    GeminiApiKeyManagementService,
    GeminiAiService,
    OllamaAiService,
  ],
  exports: [
    JwtAuthGuard,
    UsersModule,
    S3UploadService,
    GeminiApiKeyConfigService,
    GeminiApiKeyManagementService,
    GeminiAiService,
    OllamaAiService,
  ],
})
export class CommonModule {}
