import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mergeDeepSeekUsage } from "./billing.mjs";

const defaultLimits = {
  tavilyCredits: 40,
};

function accountKey(accountId) {
  return createHash("sha256").update(String(accountId)).digest("hex");
}

function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function emptyDeepSeekUsage() {
  return mergeDeepSeekUsage();
}

function normalizedAmount(value) {
  return Math.max(1, Math.round(Number(value) || 1));
}

export class UsageStore {
  constructor({
    filePath,
    limits = defaultLimits,
    timeZone = "Asia/Shanghai",
    now = () => new Date(),
  }) {
    this.filePath = filePath;
    this.limits = { ...defaultLimits, ...limits };
    this.timeZone = timeZone;
    this.now = now;
    this.loaded = false;
    this.data = { version: 2, accounts: {} };
    this.mutation = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if ([1, 2].includes(parsed?.version) && parsed.accounts && typeof parsed.accounts === "object") {
        this.data = { version: 2, accounts: parsed.accounts };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  async persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }

  entryFor(accountId) {
    const key = accountKey(accountId);
    const today = dayKey(this.now(), this.timeZone);
    const current = this.data.accounts[key];
    if (!current || current.day !== today) {
      this.data.accounts[key] = {
        day: today,
        counts: { tavilyCredits: 0 },
        deepseek: emptyDeepSeekUsage(),
        models: {},
        consent: null,
      };
    } else {
      current.counts = {
        tavilyCredits: Number(current.counts?.tavilyCredits || 0),
      };
      current.deepseek = mergeDeepSeekUsage(current.deepseek);
      current.models = current.models && typeof current.models === "object"
        ? current.models
        : {};
      current.consent ||= null;
    }
    return this.data.accounts[key];
  }

  format(entry) {
    const tavilyUsed = Number(entry.counts.tavilyCredits || 0);
    return {
      day: entry.day,
      limits: { ...this.limits },
      used: {
        tavilyCredits: tavilyUsed,
        deepseekTokens: entry.deepseek.totalTokens,
        deepseekCostCny: entry.deepseek.estimatedCostCny,
      },
      remaining: {
        tavilyCredits: Math.max(0, this.limits.tavilyCredits - tavilyUsed),
      },
      deepseek: { ...entry.deepseek },
      models: structuredClone(entry.models),
      consent: entry.consent || null,
    };
  }

  async status(accountId) {
    await this.load();
    return this.format(this.entryFor(accountId));
  }

  async consume(accountId, action, amount = 1) {
    if (!Object.hasOwn(this.limits, action)) throw new Error(`未知额度类型：${action}`);
    const requested = normalizedAmount(amount);
    let result;
    this.mutation = this.mutation.catch(() => {}).then(async () => {
      await this.load();
      const entry = this.entryFor(accountId);
      const used = Number(entry.counts[action] || 0);
      if (used + requested > this.limits[action]) {
        result = { allowed: false, requested, quota: this.format(entry) };
        return;
      }
      entry.counts[action] = used + requested;
      await this.persist();
      result = { allowed: true, requested, quota: this.format(entry) };
    });
    await this.mutation;
    return result;
  }

  async recordDeepSeekUsage(accountId, summary, model = "unknown") {
    let result;
    this.mutation = this.mutation.catch(() => {}).then(async () => {
      await this.load();
      const entry = this.entryFor(accountId);
      entry.deepseek = mergeDeepSeekUsage(entry.deepseek, summary);
      entry.models[model] = mergeDeepSeekUsage(entry.models[model], summary);
      await this.persist();
      result = this.format(entry);
    });
    await this.mutation;
    return result;
  }

  async recordConsent(accountId, consent) {
    this.mutation = this.mutation.catch(() => {}).then(async () => {
      await this.load();
      const entry = this.entryFor(accountId);
      entry.consent = {
        policyVersion: String(consent.policyVersion),
        consentAt: String(consent.consentAt),
      };
      await this.persist();
    });
    await this.mutation;
  }

  async revokeConsent(accountId) {
    this.mutation = this.mutation.catch(() => {}).then(async () => {
      await this.load();
      const entry = this.entryFor(accountId);
      entry.consent = null;
      await this.persist();
    });
    await this.mutation;
  }
}
