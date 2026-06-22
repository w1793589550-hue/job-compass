import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UsageStore } from "../lib/usage-store.mjs";

test("Tavily quota and DeepSeek token usage persist without storing the raw account id", async () => {
  const directory = await mkdtemp(join(tmpdir(), "job-compass-quota-"));
  const filePath = join(directory, "usage.json");
  const now = () => new Date("2026-06-15T04:00:00.000Z");
  try {
    const store = new UsageStore({
      filePath,
      limits: { tavilyCredits: 4 },
      now,
    });
    assert.equal((await store.consume("anonymous-account-123456", "tavilyCredits", 2)).allowed, true);
    assert.equal((await store.consume("anonymous-account-123456", "tavilyCredits", 2)).allowed, true);
    assert.equal((await store.consume("anonymous-account-123456", "tavilyCredits", 1)).allowed, false);
    await store.recordDeepSeekUsage("anonymous-account-123456", {
      promptTokens: 1_000,
      completionTokens: 200,
      cacheHitTokens: 0,
      cacheMissTokens: 1_000,
      totalTokens: 1_200,
      estimatedCostCny: 0.0026,
      averageCnyPerToken: 0.00000216667,
    }, "deepseek-v4-flash");

    await store.recordConsent("anonymous-account-123456", {
      policyVersion: "2026-06-15",
      consentAt: "2026-06-15T04:00:00.000Z",
    });
    assert.equal((await store.status("anonymous-account-123456")).consent.policyVersion, "2026-06-15");
    await store.revokeConsent("anonymous-account-123456");
    assert.equal((await store.status("anonymous-account-123456")).consent, null);

    const persisted = await readFile(filePath, "utf8");
    assert.equal(persisted.includes("anonymous-account-123456"), false);

    const reloaded = new UsageStore({ filePath, limits: { tavilyCredits: 4 }, now });
    const status = await reloaded.status("anonymous-account-123456");
    assert.equal(status.used.tavilyCredits, 4);
    assert.equal(status.deepseek.totalTokens, 1_200);
    assert.equal(status.deepseek.estimatedCostCny, 0.0026);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
