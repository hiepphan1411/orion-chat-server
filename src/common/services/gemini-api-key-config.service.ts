import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GeminiApiKeyConfigService {
  private readonly logger = new Logger(GeminiApiKeyConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  getApiKeys(): string[] {
    const apiKeysString = this.configService.get<string>('GEMINI_API_KEYS');
    const primaryApiKey = this.configService.get<string>('GEMINI_API_KEY');

    const keys = apiKeysString
      ? apiKeysString
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean)
      : primaryApiKey
        ? [primaryApiKey.trim()]
        : [];

    if (keys.length === 0) {
      this.logger.warn('No Gemini API keys configured');
    }

    return [...new Set(keys)];
  }

  getApiKeyCount(): number {
    return this.getApiKeys().length;
  }

  getApiUrl(model?: string): string {
    const explicitUrl = this.configService.get<string>('GEMINI_API_URL');
    if (explicitUrl) {
      return explicitUrl;
    }

    const resolvedModel = model || this.getModel();
    return `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent`;
  }

  getModel(): string {
    return (
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest'
    );
  }

  getRequestsPerMinuteLimit(): number {
    return this.getNumber('GEMINI_REQUESTS_PER_MINUTE_LIMIT', 5);
  }

  getRequestsPerDayLimit(): number {
    return this.getNumber('GEMINI_REQUESTS_PER_DAY_LIMIT', 20);
  }

  private getNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
