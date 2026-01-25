import { UpstashRedisCache } from './providers/upstash-redis';
import type { CacheService } from './types';

// In the future, we can switch implementations here based on environment variables
const cache: CacheService = new UpstashRedisCache();

export { cache };
export type { CacheService };
