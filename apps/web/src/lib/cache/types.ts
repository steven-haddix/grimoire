export interface CacheService {
  /**
   * Retrieve a value from the cache.
   * @param key The key to retrieve.
   * @returns The value if found, or null.
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in the cache.
   * @param key The key to set.
   * @param value The value to store.
   * @param ttl Optional time to live in seconds.
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a value from the cache.
   * @param key The key to delete.
   */
  delete(key: string): Promise<void>;
}
