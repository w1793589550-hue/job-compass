import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeDeepSeekUsage,
  summarizeDeepSeekUsage,
} from "../lib/billing.mjs";

test("DeepSeek billing separates cache hit, cache miss, and output tokens", () => {
  const summary = summarizeDeepSeekUsage({
    prompt_tokens: 1_000_000,
    prompt_cache_hit_tokens: 250_000,
    prompt_cache_miss_tokens: 750_000,
    completion_tokens: 100_000,
    total_tokens: 1_100_000,
  });
  assert.equal(summary.estimatedCostCny, 1.85);
  assert.equal(summary.totalTokens, 1_100_000);
  assert.equal(summary.averageCnyPerToken, 0.00000168182);
});

test("DeepSeek usage summaries merge across planning, synthesis, and audit calls", () => {
  const merged = mergeDeepSeekUsage(
    { promptTokens: 100, completionTokens: 20, totalTokens: 120, estimatedCostCny: 0.00026 },
    { promptTokens: 200, completionTokens: 40, totalTokens: 240, estimatedCostCny: 0.00052 },
  );
  assert.equal(merged.promptTokens, 300);
  assert.equal(merged.completionTokens, 60);
  assert.equal(merged.totalTokens, 360);
  assert.equal(merged.estimatedCostCny, 0.00078);
});
