import Redis from "ioredis";
import type { CacheService } from "../types";

export class RedisCache implements CacheService {
  private redis: Redis;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL must be defined");
    }
    this.redis = new Redis(url);
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.set(key, serialized, "EX", ttl);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
