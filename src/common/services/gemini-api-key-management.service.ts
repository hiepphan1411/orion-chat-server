import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { GeminiApiKeyConfigService } from './gemini-api-key-config.service';

type ApiKeyStatus = 'ACTIVE' | 'FAILED';

interface ApiKeyUsageStats {
  keyHash: string;
  apiKeyMasked: string;
  status: ApiKeyStatus;
  requestCountCurrentMinute: number;
  requestCountCurrentDay: number;
  consecutiveFailures: number;
  totalSuccessfulRequests: number;
  totalFailedRequests: number;
  lastMinuteReset: number;
  lastDailyResetDate: string;
  lastFailureMessage?: string;
}

@Injectable()
export class GeminiApiKeyManagementService {
  private readonly logger = new Logger(GeminiApiKeyManagementService.name);
  private readonly stats = new Map<string, ApiKeyUsageStats>();

  constructor(private readonly apiKeyConfig: GeminiApiKeyConfigService) {}

  getNextAvailableApiKey(): string {
    this.initializeApiKeys();

    const requestsPerMinuteLimit =
      this.apiKeyConfig.getRequestsPerMinuteLimit();
    const requestsPerDayLimit = this.apiKeyConfig.getRequestsPerDayLimit();

    const candidates = [...this.stats.values()]
      .map((stat) => this.resetCounterIfNeeded(stat))
      .filter(
        (stat) =>
          stat.status === 'ACTIVE' &&
          stat.requestCountCurrentMinute < requestsPerMinuteLimit &&
          stat.requestCountCurrentDay < requestsPerDayLimit,
      )
      .sort(
        (left, right) =>
          left.requestCountCurrentMinute - right.requestCountCurrentMinute ||
          left.consecutiveFailures - right.consecutiveFailures ||
          left.requestCountCurrentDay - right.requestCountCurrentDay,
      );

    const selected = candidates[0];
    if (!selected) {
      throw new Error(
        `No available Gemini API keys within quota (${requestsPerMinuteLimit}/minute, ${requestsPerDayLimit}/day per key)`,
      );
    }

    selected.requestCountCurrentMinute += 1;
    selected.requestCountCurrentDay += 1;

    this.logger.debug(
      `Selected Gemini key ${selected.apiKeyMasked}, minute requests: ${selected.requestCountCurrentMinute}/${requestsPerMinuteLimit}, day requests: ${selected.requestCountCurrentDay}/${requestsPerDayLimit}`,
    );

    return this.findRawApiKeyByHash(selected.keyHash);
  }

  recordSuccess(apiKey: string): void {
    const stat = this.getOrCreateStats(apiKey);
    stat.status = 'ACTIVE';
    stat.consecutiveFailures = 0;
    stat.totalSuccessfulRequests += 1;
    stat.lastFailureMessage = undefined;
  }

  recordFailure(apiKey: string, failureMessage: string): void {
    const stat = this.getOrCreateStats(apiKey);
    stat.consecutiveFailures += 1;
    stat.totalFailedRequests += 1;
    stat.lastFailureMessage = failureMessage;

    if (stat.consecutiveFailures >= 3) {
      stat.status = 'FAILED';
    }

    this.logger.warn(
      `Gemini key ${stat.apiKeyMasked} failed: ${failureMessage} (consecutive failures: ${stat.consecutiveFailures})`,
    );
  }

  getApiKeyCount(): number {
    return this.apiKeyConfig.getApiKeyCount();
  }

  private initializeApiKeys(): void {
    for (const apiKey of this.apiKeyConfig.getApiKeys()) {
      this.getOrCreateStats(apiKey);
    }
  }

  private getOrCreateStats(apiKey: string): ApiKeyUsageStats {
    const keyHash = this.hashApiKey(apiKey);
    const existing = this.stats.get(keyHash);
    if (existing) {
      return this.resetCounterIfNeeded(existing);
    }

    const stat: ApiKeyUsageStats = {
      keyHash,
      apiKeyMasked: this.maskApiKey(apiKey),
      status: 'ACTIVE',
      requestCountCurrentMinute: 0,
      requestCountCurrentDay: 0,
      consecutiveFailures: 0,
      totalSuccessfulRequests: 0,
      totalFailedRequests: 0,
      lastMinuteReset: Date.now(),
      lastDailyResetDate: this.getTodayKey(),
    };

    this.stats.set(keyHash, stat);
    return stat;
  }

  private resetCounterIfNeeded(stat: ApiKeyUsageStats): ApiKeyUsageStats {
    const now = Date.now();
    if (now - stat.lastMinuteReset >= 60_000) {
      stat.requestCountCurrentMinute = 0;
      stat.lastMinuteReset = now;
      if (stat.status === 'FAILED') {
        stat.status = 'ACTIVE';
        stat.consecutiveFailures = 0;
      }
    }

    const today = this.getTodayKey();
    if (stat.lastDailyResetDate !== today) {
      stat.requestCountCurrentDay = 0;
      stat.lastDailyResetDate = today;
      stat.status = 'ACTIVE';
      stat.consecutiveFailures = 0;
    }

    return stat;
  }

  private findRawApiKeyByHash(keyHash: string): string {
    const apiKey = this.apiKeyConfig
      .getApiKeys()
      .find((key) => this.hashApiKey(key) === keyHash);
    if (!apiKey) {
      throw new Error('Cannot find raw Gemini API key for selected hash');
    }
    return apiKey;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('base64');
  }

  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 4) {
      return '****';
    }
    return `***${apiKey.slice(-4)}`;
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
