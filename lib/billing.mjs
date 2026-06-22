export const defaultDeepSeekPricing = Object.freeze({
  currency: "CNY",
  inputCacheHitPerMillion: 0.2,
  inputCacheMissPerMillion: 2,
  outputPerMillion: 3,
});

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function roundedMoney(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function roundedUnitCost(value) {
  return Math.round((Number(value) || 0) * 100_000_000_000) / 100_000_000_000;
}

export function summarizeDeepSeekUsage(usage, pricing = defaultDeepSeekPricing) {
  const promptTokens = nonNegativeInteger(usage?.prompt_tokens);
  const completionTokens = nonNegativeInteger(usage?.completion_tokens);
  const cacheHitTokens = Math.min(
    promptTokens,
    nonNegativeInteger(
      usage?.prompt_cache_hit_tokens
      ?? usage?.prompt_tokens_details?.cached_tokens,
    ),
  );
  const reportedMissTokens = usage?.prompt_cache_miss_tokens;
  const cacheMissTokens = reportedMissTokens == null
    ? Math.max(0, promptTokens - cacheHitTokens)
    : Math.min(promptTokens, nonNegativeInteger(reportedMissTokens));
  const totalTokens = nonNegativeInteger(
    usage?.total_tokens || promptTokens + completionTokens,
  );
  const estimatedCostCny = roundedMoney(
    (cacheHitTokens / 1_000_000) * pricing.inputCacheHitPerMillion
    + (cacheMissTokens / 1_000_000) * pricing.inputCacheMissPerMillion
    + (completionTokens / 1_000_000) * pricing.outputPerMillion,
  );

  return {
    promptTokens,
    completionTokens,
    cacheHitTokens,
    cacheMissTokens,
    totalTokens,
    estimatedCostCny,
    averageCnyPerToken: totalTokens
      ? roundedUnitCost(estimatedCostCny / totalTokens)
      : 0,
  };
}

export function mergeDeepSeekUsage(...summaries) {
  const merged = summaries.reduce((total, summary) => ({
    promptTokens: total.promptTokens + nonNegativeInteger(summary?.promptTokens),
    completionTokens: total.completionTokens + nonNegativeInteger(summary?.completionTokens),
    cacheHitTokens: total.cacheHitTokens + nonNegativeInteger(summary?.cacheHitTokens),
    cacheMissTokens: total.cacheMissTokens + nonNegativeInteger(summary?.cacheMissTokens),
    totalTokens: total.totalTokens + nonNegativeInteger(summary?.totalTokens),
    estimatedCostCny: total.estimatedCostCny + Number(summary?.estimatedCostCny || 0),
  }), {
    promptTokens: 0,
    completionTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    totalTokens: 0,
    estimatedCostCny: 0,
  });

  merged.estimatedCostCny = roundedMoney(merged.estimatedCostCny);
  merged.averageCnyPerToken = merged.totalTokens
    ? roundedUnitCost(merged.estimatedCostCny / merged.totalTokens)
    : 0;
  return merged;
}
