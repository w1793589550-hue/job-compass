export class SlidingWindowRateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.buckets = new Map();
  }

  check(key, { limit, windowMs }) {
    const current = this.now();
    const cutoff = current - windowMs;
    const recent = (this.buckets.get(key) || []).filter((timestamp) => timestamp > cutoff);
    const allowed = recent.length < limit;

    if (allowed) recent.push(current);
    if (recent.length) this.buckets.set(key, recent);
    else this.buckets.delete(key);

    const oldest = recent[0] || current;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - recent.length),
      resetAt: oldest + windowMs,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((oldest + windowMs - current) / 1000)),
    };
  }
}
