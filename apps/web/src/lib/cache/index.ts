import { RedisCache } from './providers/redis';
import type { CacheService } from './types';

const cache: CacheService = new RedisCache();

export { cache };
export type { CacheService };
