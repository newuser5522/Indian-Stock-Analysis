import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis/cloudflare";

const limiters = new Map<string, Ratelimit>();
const developmentWindows = new Map<string, { count: number; reset: number }>();

function checkDevelopmentRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): { configured: true; success: boolean; reset: number } | { configured: false } {
  const now = Date.now();
  for (const [entryKey, entry] of developmentWindows) {
    if (entry.reset <= now) developmentWindows.delete(entryKey);
  }

  const bucketKey = `${limit}:${windowSeconds}:${key}`;
  let entry = developmentWindows.get(bucketKey);
  if (!entry) {
    if (developmentWindows.size >= 5_000) return { configured: false };
    entry = { count: 0, reset: now + windowSeconds * 1_000 };
    developmentWindows.set(bucketKey, entry);
  }

  entry.count += 1;
  return {
    configured: true,
    success: entry.count <= limit,
    reset: entry.reset,
  };
}

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const key = `${limit}:${windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: "fintrack:ratelimit",
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<
  | { configured: false }
  | { configured: true; success: boolean; reset: number }
> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token && process.env.NODE_ENV === "development") {
    return checkDevelopmentRateLimit(key, limit, windowSeconds);
  }

  const limiter = getLimiter(limit, windowSeconds);
  if (!limiter) return { configured: false };
  const result = await limiter.limit(key);
  return { configured: true, success: result.success, reset: result.reset };
}
