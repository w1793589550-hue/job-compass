import { createHash } from "node:crypto";
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

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function dayFromRow(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

export class MySqlUsageStore {
  constructor({
    pool,
    limits = defaultLimits,
    timeZone = "Asia/Shanghai",
    now = () => new Date(),
  }) {
    this.pool = pool;
    this.limits = { ...defaultLimits, ...limits };
    this.timeZone = timeZone;
    this.now = now;
  }

  defaultEntry(accountId) {
    return {
      accountHash: accountKey(accountId),
      day: dayKey(this.now(), this.timeZone),
      counts: { tavilyCredits: 0 },
      deepseek: emptyDeepSeekUsage(),
      models: {},
      consent: null,
    };
  }

  normalizeEntry(row, accountId) {
    if (!row) return this.defaultEntry(accountId);
    return {
      accountHash: row.account_hash,
      day: dayFromRow(row.usage_day),
      counts: {
        tavilyCredits: Number(parseJson(row.counts_json, {}).tavilyCredits || 0),
      },
      deepseek: mergeDeepSeekUsage(parseJson(row.deepseek_json, {})),
      models: parseJson(row.models_json, {}),
      consent: parseJson(row.consent_json, null),
    };
  }

  async entryFor(accountId, connection = this.pool) {
    const accountHash = accountKey(accountId);
    const today = dayKey(this.now(), this.timeZone);
    const [rows] = await connection.execute(
      "SELECT * FROM usage_daily WHERE account_hash = ? AND usage_day = ?",
      [accountHash, today],
    );
    return this.normalizeEntry(rows[0], accountId);
  }

  async saveEntry(entry, connection = this.pool) {
    await connection.execute(
      `INSERT INTO usage_daily
        (account_hash, usage_day, counts_json, deepseek_json, models_json, consent_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        counts_json = VALUES(counts_json),
        deepseek_json = VALUES(deepseek_json),
        models_json = VALUES(models_json),
        consent_json = VALUES(consent_json)`,
      [
        entry.accountHash,
        entry.day,
        JSON.stringify(entry.counts),
        JSON.stringify(entry.deepseek),
        JSON.stringify(entry.models),
        JSON.stringify(entry.consent),
      ],
    );
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
    return this.format(await this.entryFor(accountId));
  }

  async consume(accountId, action, amount = 1) {
    if (!Object.hasOwn(this.limits, action)) throw new Error(`未知额度类型：${action}`);
    const requested = normalizedAmount(amount);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const entry = await this.entryFor(accountId, connection);
      const used = Number(entry.counts[action] || 0);
      if (used + requested > this.limits[action]) {
        await connection.rollback();
        return { allowed: false, requested, quota: this.format(entry) };
      }
      entry.counts[action] = used + requested;
      await this.saveEntry(entry, connection);
      await connection.commit();
      return { allowed: true, requested, quota: this.format(entry) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordDeepSeekUsage(accountId, summary, model = "unknown") {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const entry = await this.entryFor(accountId, connection);
      entry.deepseek = mergeDeepSeekUsage(entry.deepseek, summary);
      entry.models[model] = mergeDeepSeekUsage(entry.models[model], summary);
      await this.saveEntry(entry, connection);
      await connection.commit();
      return this.format(entry);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordConsent(accountId, consent) {
    const entry = await this.entryFor(accountId);
    entry.consent = {
      policyVersion: String(consent.policyVersion),
      consentAt: String(consent.consentAt),
    };
    await this.saveEntry(entry);
  }

  async revokeConsent(accountId) {
    const entry = await this.entryFor(accountId);
    entry.consent = null;
    await this.saveEntry(entry);
  }
}
