interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inFlight = new Map<string, Promise<unknown>>();
  private readonly maxEntries = 5_000;

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const now = Date.now();
      for (const [storedKey, entry] of this.store) {
        if (now > entry.expiresAt) this.store.delete(storedKey);
      }
      while (this.store.size >= this.maxEntries) {
        const oldest = this.store.keys().next().value;
        if (oldest === undefined) break;
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const request = fn()
      .then((value) => {
        if (
          value !== null &&
          value !== undefined &&
          !(Array.isArray(value) && value.length === 0)
        ) {
          this.set(key, value, ttlMs);
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }
}

export const cache = new TtlCache();
