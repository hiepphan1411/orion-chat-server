import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { GeminiApiKeyConfigService } from './gemini-api-key-config.service';
import { RedisKvService } from './redis-kv.service';

type ApiKeyStatus = 'ACTIVE' | 'RATE_LIMITED' | 'QUOTA_EXHAUSTED' | 'FAILED';

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
  blockedUntil?: number;
  disabledReason?: string;
  lastFailureMessage?: string;
  updatedAt: string;
}

@Injectable()
export class GeminiApiKeyManagementService {
  private readonly logger = new Logger(GeminiApiKeyManagementService.name);

  constructor(
    private readonly apiKeyConfig: GeminiApiKeyConfigService,
    private readonly redis: RedisKvService,
    private readonly configService: ConfigService,
  ) {}

  async getNextAvailableApiKey(): Promise<string> {
    await this.initializeApiKeys();

    const requestsPerMinuteLimit =
      this.apiKeyConfig.getRequestsPerMinuteLimit();
    const requestsPerDayLimit = this.apiKeyConfig.getRequestsPerDayLimit();
    const stats = await this.getRegisteredStats();

    const candidates = stats
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
      await Promise.all(stats.map((stat) => this.saveStats(stat)));
      throw new Error(
        `No available Gemini API keys within quota (${requestsPerMinuteLimit}/minute, ${requestsPerDayLimit}/day per key)`,
      );
    }

    selected.requestCountCurrentMinute += 1;
    selected.requestCountCurrentDay += 1;
    this.applyQuotaStatus(selected);
    await this.saveStats(selected);

    this.logger.debug(
      `Selected Gemini key ${selected.apiKeyMasked}, status=${selected.status}, minute requests: ${selected.requestCountCurrentMinute}/${requestsPerMinuteLimit}, day requests: ${selected.requestCountCurrentDay}/${requestsPerDayLimit}`,
    );

    return this.findRawApiKeyByHash(selected.keyHash);
  }

  async recordSuccess(apiKey: string): Promise<void> {
    const stat = await this.getOrCreateStats(apiKey);
    stat.consecutiveFailures = 0;
    stat.totalSuccessfulRequests += 1;
    stat.lastFailureMessage = undefined;
    this.applyQuotaStatus(stat);
    await this.saveStats(stat);
  }

  async recordFailure(apiKey: string, failureMessage: string): Promise<void> {
    const stat = await this.getOrCreateStats(apiKey);
    stat.consecutiveFailures += 1;
    stat.totalFailedRequests += 1;
    stat.status = this.isQuotaFailure(failureMessage)
      ? 'QUOTA_EXHAUSTED'
      : 'FAILED';
    stat.disabledReason = failureMessage;
    stat.lastFailureMessage = failureMessage;
    stat.blockedUntil =
      stat.status === 'QUOTA_EXHAUSTED'
        ? this.getNextDayStartMs()
        : undefined;

    await this.saveStats(stat);

    this.logger.warn(
      `Disabled Gemini key ${stat.apiKeyMasked}: ${failureMessage} (status=${stat.status})`,
    );
  }

  getApiKeyCount(): number {
    return this.apiKeyConfig.getApiKeyCount();
  }

  private async initializeApiKeys(): Promise<void> {
    const apiKeys = this.apiKeyConfig.getApiKeys();
    const keyHashes = apiKeys.map((apiKey) => this.hashApiKey(apiKey));

    await this.redis.sadd(this.getKeyListRedisKey(), keyHashes);
    await Promise.all(apiKeys.map((apiKey) => this.getOrCreateStats(apiKey)));
  }

  private async getRegisteredStats(): Promise<ApiKeyUsageStats[]> {
    const keyHashes = await this.redis.smembers(this.getKeyListRedisKey());
    const configuredHashes = new Set(
      this.apiKeyConfig.getApiKeys().map((apiKey) => this.hashApiKey(apiKey)),
    );
    const rows = await Promise.all(
      keyHashes
        .filter((keyHash) => configuredHashes.has(keyHash))
        .map(async (keyHash) => {
          const json = await this.redis.get(this.getStatsRedisKey(keyHash));
          if (!json) {
            return null;
          }

          try {
            return JSON.parse(json) as ApiKeyUsageStats;
          } catch {
            this.logger.warn(`Ignoring invalid Gemini key stats: ${keyHash}`);
            return null;
          }
        }),
    );

    return rows.filter((item): item is ApiKeyUsageStats => item !== null);
  }

  private async getOrCreateStats(apiKey: string): Promise<ApiKeyUsageStats> {
    const keyHash = this.hashApiKey(apiKey);
    const redisKey = this.getStatsRedisKey(keyHash);
    const existing = await this.redis.get(redisKey);

    if (existing) {
      try {
        return this.resetCounterIfNeeded(JSON.parse(existing) as ApiKeyUsageStats);
      } catch {
        this.logger.warn(`Recreating invalid Gemini key stats: ${keyHash}`);
      }
    }

    const now = Date.now();
    const stat: ApiKeyUsageStats = {
      keyHash,
      apiKeyMasked: this.maskApiKey(apiKey),
      status: 'ACTIVE',
      requestCountCurrentMinute: 0,
      requestCountCurrentDay: 0,
      consecutiveFailures: 0,
      totalSuccessfulRequests: 0,
      totalFailedRequests: 0,
      lastMinuteReset: now,
      lastDailyResetDate: this.getTodayKey(),
      updatedAt: new Date(now).toISOString(),
    };

    await this.saveStats(stat);
    return stat;
  }

  private async saveStats(stat: ApiKeyUsageStats): Promise<void> {
    stat.updatedAt = new Date().toISOString();
    await this.redis.set(this.getStatsRedisKey(stat.keyHash), JSON.stringify(stat));
  }

  private resetCounterIfNeeded(stat: ApiKeyUsageStats): ApiKeyUsageStats {
    const now = Date.now();
    if (now - stat.lastMinuteReset >= 60_000) {
      stat.requestCountCurrentMinute = 0;
      stat.lastMinuteReset = now;
      if (stat.status === 'RATE_LIMITED' && (stat.blockedUntil || 0) <= now) {
        stat.status = 'ACTIVE';
        stat.blockedUntil = undefined;
        stat.disabledReason = undefined;
      }
    }

    const today = this.getTodayKey();
    if (stat.lastDailyResetDate !== today) {
      stat.requestCountCurrentDay = 0;
      stat.lastDailyResetDate = today;
      if (stat.status === 'QUOTA_EXHAUSTED') {
        stat.status = 'ACTIVE';
        stat.blockedUntil = undefined;
        stat.disabledReason = undefined;
      }
    }

    return stat;
  }

  private applyQuotaStatus(stat: ApiKeyUsageStats): void {
    const requestsPerMinuteLimit =
      this.apiKeyConfig.getRequestsPerMinuteLimit();
    const requestsPerDayLimit = this.apiKeyConfig.getRequestsPerDayLimit();

    if (stat.requestCountCurrentDay >= requestsPerDayLimit) {
      stat.status = 'QUOTA_EXHAUSTED';
      stat.blockedUntil = this.getNextDayStartMs();
      stat.disabledReason = `Daily quota reached (${requestsPerDayLimit}/day)`;
      return;
    }

    if (stat.requestCountCurrentMinute >= requestsPerMinuteLimit) {
      stat.status = 'RATE_LIMITED';
      stat.blockedUntil = stat.lastMinuteReset + 60_000;
      stat.disabledReason = `Minute quota reached (${requestsPerMinuteLimit}/minute)`;
      return;
    }

    if (stat.status === 'RATE_LIMITED' || stat.status === 'QUOTA_EXHAUSTED') {
      stat.status = 'ACTIVE';
      stat.blockedUntil = undefined;
      stat.disabledReason = undefined;
    }
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

  private isQuotaFailure(message: string): boolean {
    return /quota|rate|429|resource exhausted|too many requests/i.test(message);
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

  private getNextDayStartMs(): number {
    const nextDay = new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    return nextDay.getTime();
  }

  private getKeyListRedisKey(): string {
    return `${this.getRedisPrefix()}:keys`;
  }

  private getStatsRedisKey(keyHash: string): string {
    return `${this.getRedisPrefix()}:key:${keyHash}`;
  }

  private getRedisPrefix(): string {
    return (
      this.configService.get<string>('GEMINI_REDIS_PREFIX') || 'orion:gemini'
    );
  }
}
