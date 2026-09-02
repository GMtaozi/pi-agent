import Redis from 'ioredis';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}

export class RedisClient {
  private client: Redis | null = null;
  private config: RedisConfig;
  private logger: any;

  constructor(config: RedisConfig = {}) {
    this.config = config;
    this.logger = {
      info: (msg: string, data?: any) => console.log('[Redis]', msg, data || ''),
      warn: (msg: string, data?: any) => console.warn('[Redis]', msg, data || ''),
      error: (msg: string, data?: any) => console.error('[Redis]', msg, data || ''),
      debug: (msg: string, data?: any) => console.debug('[Redis]', msg, data || ''),
    };
  }

  async connect(): Promise<void> {
    if (this.client) return;

    const url = this.config.url || process.env.REDIS_URL;
    if (url) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
        lazyConnect: true,
      });
    } else {
      this.client = new Redis({
        host: this.config.host || 'localhost',
        port: this.config.port || 6379,
        password: this.config.password || undefined,
        db: this.config.db || 0,
        keyPrefix: this.config.keyPrefix || 'wf:',
        maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
        lazyConnect: true,
      });
    }

    this.client.on('connect', () => this.logger.info('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
    this.client.on('close', () => this.logger.warn('Redis connection closed'));

    await this.client.connect();
    this.logger.info('Redis client ready');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not connected. Call connect() first.');
    return this.client;
  }

  // High-level caching helpers

  async cacheGet<T>(key: string): Promise<T | null> {
    const val = await this.client!.get(key);
    return val ? JSON.parse(val) : null;
  }

  async cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client!.setex(key, ttlSeconds, serialized);
    } else {
      await this.client!.set(key, serialized);
    }
  }

  async cacheDelete(key: string): Promise<void> {
    await this.client!.del(key);
  }

  async cacheDeletePattern(pattern: string): Promise<void> {
    const keys = await this.client!.keys(pattern);
    if (keys.length > 0) {
      await this.client!.del(...keys);
    }
  }

  // Rate limiting helper
  async rateLimitCheck(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(now / windowSeconds);
    const redisKey = `ratelimit:${key}:${windowKey}`;

    const count = await this.client!.incr(redisKey);
    if (count === 1) {
      await this.client!.expire(redisKey, windowSeconds);
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = (windowKey + 1) * windowSeconds;

    return { allowed, remaining, resetAt };
  }

  // Pub/Sub helpers
  async publish(channel: string, message: any): Promise<void> {
    await this.client!.publish(channel, JSON.stringify(message));
  }

  subscribe(channel: string, handler: (message: any) => void): void {
    const sub = this.client!.duplicate();
    sub.subscribe(channel);
    sub.on('message', (_channel, message) => {
      handler(JSON.parse(message));
    });
  }
}
