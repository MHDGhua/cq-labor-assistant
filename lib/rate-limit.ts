export type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult =
  | {
      allowed: true;
      remaining: number;
      resetAt: number;
      limit: number;
    }
  | {
      allowed: false;
      remaining: 0;
      resetAt: number;
      limit: number;
      retryAfterSeconds: number;
    };

type RateLimitBucket = {
  windowStart: number;
  count: number;
};

const store = new Map<string, RateLimitBucket>();
const maxBuckets = 10_000;

function pruneStore(now: number, windowMs: number) {
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart >= windowMs) {
      store.delete(key);
    }
  }

  while (store.size > maxBuckets) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    store.delete(oldestKey);
  }
}

function parseForwardedIp(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .find(Boolean)
    ?? null;
}

export function getRateLimitKey(request: Request) {
  const headers = request.headers;
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    parseForwardedIp(headers.get("x-forwarded-for")) ??
    headers.get("x-client-ip");

  if (ip) {
    return `ip:${ip}`;
  }

  return "fallback:anonymous";
}

export function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
  now = Date.now()
): RateLimitResult {
  const key = `${options.scope}:${getRateLimitKey(request)}`;
  const existing = store.get(key);
  const bucket =
    existing && now - existing.windowStart < options.windowMs
      ? existing
      : { windowStart: now, count: 0 };

  if (bucket !== existing) {
    store.set(key, bucket);
    if (store.size > maxBuckets) {
      pruneStore(now, options.windowMs);
    }
  }

  bucket.count += 1;

  const resetAt = bucket.windowStart + options.windowMs;
  const remaining = Math.max(options.limit - bucket.count, 0);

  if (bucket.count > options.limit) {
    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000))
    };
  }

  return {
    allowed: true,
    limit: options.limit,
    remaining,
    resetAt
  };
}

export function resetRateLimitStore() {
  store.clear();
}
