import test from "node:test";
import assert from "node:assert/strict";
import { SlidingWindowRateLimiter } from "../lib/rate-limit.mjs";

test("sliding window limiter blocks requests above the configured limit", () => {
  let current = 1_000;
  const limiter = new SlidingWindowRateLimiter({ now: () => current });
  const options = { limit: 2, windowMs: 10_000 };

  assert.equal(limiter.check("account", options).allowed, true);
  assert.equal(limiter.check("account", options).allowed, true);
  const blocked = limiter.check("account", options);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);

  current += 10_001;
  assert.equal(limiter.check("account", options).allowed, true);
});
