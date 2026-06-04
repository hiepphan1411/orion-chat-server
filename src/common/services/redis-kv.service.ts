import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';

type RedisValue = string | number | null | RedisValue[];

@Injectable()
export class RedisKvService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisKvService.name);
  private readonly sockets = new Set<Socket>();

  constructor(private readonly configService: ConfigService) {}

  async get(key: string): Promise<string | null> {
    const result = await this.command(['GET', key]);
    return typeof result === 'string' ? result : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.command(['SET', key, value]);
  }

  async sadd(key: string, members: string[]): Promise<void> {
    if (members.length === 0) {
      return;
    }
    await this.command(['SADD', key, ...members]);
  }

  async smembers(key: string): Promise<string[]> {
    const result = await this.command(['SMEMBERS', key]);
    return Array.isArray(result)
      ? result.filter((item): item is string => typeof item === 'string')
      : [];
  }

  onModuleDestroy() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
  }

  private async command(args: string[]): Promise<RedisValue> {
    const options = this.getConnectionOptions();
    const socket = new Socket();
    this.sockets.add(socket);

    try {
      await this.connect(socket, options.host, options.port);
      const session = new RedisSession(socket);

      if (options.password) {
        const authArgs = options.username
          ? ['AUTH', options.username, options.password]
          : ['AUTH', options.password];
        await session.send(authArgs);
      }

      if (options.db !== undefined) {
        await session.send(['SELECT', String(options.db)]);
      }

      return await session.send(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis command failed: ${message}`);
      throw error;
    } finally {
      socket.end();
      socket.destroy();
      this.sockets.delete(socket);
    }
  }

  private connect(socket: Socket, host: string, port: number): Promise<void> {
    const timeout = this.getTimeoutMs();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error(`Redis connection timed out after ${timeout}ms`));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('error', onError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.once('connect', onConnect);
      socket.once('error', onError);
      socket.connect(port, host);
    });
  }

  private getConnectionOptions() {
    const urlValue =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const url = new URL(urlValue);
    const dbText = url.pathname.replace('/', '');
    const db = dbText ? Number(dbText) : undefined;

    return {
      host: url.hostname || 'localhost',
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number.isFinite(db) ? db : undefined,
    };
  }

  private getTimeoutMs() {
    const value = Number(this.configService.get<string>('REDIS_TIMEOUT_MS'));
    return Number.isFinite(value) && value > 0 ? value : 2000;
  }
}

class RedisSession {
  private buffer = Buffer.alloc(0);
  private waiting:
    | {
        resolve: (value: RedisValue) => void;
        reject: (error: Error) => void;
      }
    | undefined;

  constructor(private readonly socket: Socket) {
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.tryResolve();
    });

    this.socket.on('error', (error) => {
      if (this.waiting) {
        this.waiting.reject(error);
        this.waiting = undefined;
      }
    });
  }

  send(args: string[]): Promise<RedisValue> {
    if (this.waiting) {
      return Promise.reject(new Error('Redis session is already waiting'));
    }

    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
      this.socket.write(this.encodeCommand(args));
      this.tryResolve();
    });
  }

  private tryResolve() {
    if (!this.waiting || this.buffer.length === 0) {
      return;
    }

    try {
      const parsed = this.parseValue(0);
      if (!parsed) {
        return;
      }

      this.buffer = this.buffer.subarray(parsed.offset);
      const waiter = this.waiting;
      this.waiting = undefined;
      waiter.resolve(parsed.value);
    } catch (error) {
      const waiter = this.waiting;
      this.waiting = undefined;
      if (waiter) {
        waiter.reject(
          error instanceof Error ? error : new Error('Redis parse error'),
        );
      }
    }
  }

  private encodeCommand(args: string[]) {
    return `*${args.length}\r\n${args
      .map((arg) => {
        const value = Buffer.from(arg);
        return `$${value.length}\r\n${arg}\r\n`;
      })
      .join('')}`;
  }

  private parseValue(offset: number): { value: RedisValue; offset: number } | null {
    const prefix = this.buffer[offset];
    if (prefix === undefined) {
      return null;
    }

    if (prefix === 43) {
      return this.parseSimpleString(offset);
    }
    if (prefix === 45) {
      const error = this.parseSimpleString(offset);
      if (!error) {
        return null;
      }
      throw new Error(String(error.value));
    }
    if (prefix === 58) {
      return this.parseInteger(offset);
    }
    if (prefix === 36) {
      return this.parseBulkString(offset);
    }
    if (prefix === 42) {
      return this.parseArray(offset);
    }

    throw new Error('Unsupported Redis response type');
  }

  private parseSimpleString(offset: number) {
    const end = this.findLineEnd(offset);
    if (end < 0) {
      return null;
    }

    return {
      value: this.buffer.toString('utf8', offset + 1, end),
      offset: end + 2,
    };
  }

  private parseInteger(offset: number) {
    const end = this.findLineEnd(offset);
    if (end < 0) {
      return null;
    }

    return {
      value: Number(this.buffer.toString('utf8', offset + 1, end)),
      offset: end + 2,
    };
  }

  private parseBulkString(offset: number) {
    const end = this.findLineEnd(offset);
    if (end < 0) {
      return null;
    }

    const length = Number(this.buffer.toString('utf8', offset + 1, end));
    if (length === -1) {
      return { value: null, offset: end + 2 };
    }

    const start = end + 2;
    const nextOffset = start + length + 2;
    if (this.buffer.length < nextOffset) {
      return null;
    }

    return {
      value: this.buffer.toString('utf8', start, start + length),
      offset: nextOffset,
    };
  }

  private parseArray(offset: number) {
    const end = this.findLineEnd(offset);
    if (end < 0) {
      return null;
    }

    const length = Number(this.buffer.toString('utf8', offset + 1, end));
    if (length === -1) {
      return { value: null, offset: end + 2 };
    }

    const values: RedisValue[] = [];
    let cursor = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = this.parseValue(cursor);
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      cursor = parsed.offset;
    }

    return { value: values, offset: cursor };
  }

  private findLineEnd(offset: number) {
    return this.buffer.indexOf('\r\n', offset, 'utf8');
  }
}
