import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function dayKey(date, timeZone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hourKey(date, timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:00`;
}

function emptyAnalytics() {
  return { visitors: {}, daily: {}, hourly: {}, contacts: { total: 0, unique: {} } };
}

function ensurePeriod(container, key) {
  container[key] ||= { views: 0, visitors: {}, contacts: 0 };
  return container[key];
}

function emptySummary() {
  return {
    totals: {
      views: 0,
      visitors: 0,
      contacts: 0,
      contactPeople: 0,
      todayViews: 0,
      todayVisitors: 0,
      todayContacts: 0,
    },
    daily: [],
    hourly: [],
    updatedAt: new Date().toISOString(),
  };
}

export class JsonAnalyticsStore {
  constructor({ filePath, timeZone = "Asia/Shanghai", now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.timeZone = timeZone;
    this.now = now;
    this.loaded = false;
    this.data = emptyAnalytics();
  }

  async load() {
    if (this.loaded) return;
    try {
      this.data = { ...emptyAnalytics(), ...JSON.parse(await readFile(this.filePath, "utf8")) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  async recordPageView(visitorId) {
    await this.load();
    const now = this.now();
    const nowIso = now.toISOString();
    this.data.visitors[visitorId] ||= { firstSeen: nowIso, views: 0 };
    this.data.visitors[visitorId].lastSeen = nowIso;
    this.data.visitors[visitorId].views += 1;
    const day = ensurePeriod(this.data.daily, dayKey(now, this.timeZone));
    const hour = ensurePeriod(this.data.hourly, hourKey(now, this.timeZone));
    day.views += 1;
    hour.views += 1;
    day.visitors[visitorId] = true;
    hour.visitors[visitorId] = true;
    await this.save();
  }

  async summary() {
    await this.load();
    const today = dayKey(this.now(), this.timeZone);
    const daily = Object.entries(this.data.daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, value]) => ({
        label: date.slice(5),
        views: value.views || 0,
        visitors: Object.keys(value.visitors || {}).length,
        contacts: value.contacts || 0,
      }));
    const hourly = Object.entries(this.data.hourly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([date, value]) => ({
        label: date.slice(11),
        views: value.views || 0,
        visitors: Object.keys(value.visitors || {}).length,
        contacts: value.contacts || 0,
      }));
    return {
      totals: {
        views: Object.values(this.data.daily).reduce((sum, item) => sum + Number(item.views || 0), 0),
        visitors: Object.keys(this.data.visitors || {}).length,
        contacts: this.data.contacts.total || 0,
        contactPeople: Object.keys(this.data.contacts.unique || {}).length,
        todayViews: this.data.daily[today]?.views || 0,
        todayVisitors: Object.keys(this.data.daily[today]?.visitors || {}).length,
        todayContacts: this.data.daily[today]?.contacts || 0,
      },
      daily,
      hourly,
      updatedAt: new Date().toISOString(),
    };
  }
}

export class MySqlAnalyticsStore {
  constructor({ pool, timeZone = "Asia/Shanghai", now = () => new Date() } = {}) {
    this.pool = pool;
    this.timeZone = timeZone;
    this.now = now;
  }

  async recordPageView(visitorId, pagePath = "/") {
    const now = this.now();
    await this.pool.execute(
      `INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen, views)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen), views = views + 1`,
      [visitorId, now, now],
    );
    await this.pool.execute(
      "INSERT INTO analytics_page_views (visitor_id, page_path, viewed_at) VALUES (?, ?, ?)",
      [visitorId, pagePath, now],
    );
  }

  async summary() {
    const summary = emptySummary();
    const now = this.now();
    const cutoffDaily = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const cutoffHourly = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const [visitorRows] = await this.pool.execute("SELECT COUNT(*) AS count FROM analytics_visitors");
    const [viewRows] = await this.pool.execute("SELECT visitor_id, viewed_at FROM analytics_page_views WHERE viewed_at >= ?", [cutoffDaily]);
    const [allViewRows] = await this.pool.execute("SELECT COUNT(*) AS count FROM analytics_page_views");
    const [contactRows] = await this.pool.execute("SELECT client_id, created_at FROM analytics_contacts WHERE created_at >= ?", [cutoffDaily]);
    const [allContactRows] = await this.pool.execute("SELECT COUNT(*) AS count, COUNT(DISTINCT client_id) AS people FROM analytics_contacts");

    const dailyMap = new Map();
    const hourlyMap = new Map();
    for (const row of viewRows) {
      const viewedAt = row.viewed_at instanceof Date ? row.viewed_at : new Date(row.viewed_at);
      const day = dayKey(viewedAt, this.timeZone);
      const hour = hourKey(viewedAt, this.timeZone);
      for (const [map, key] of [[dailyMap, day], [hourlyMap, hour]]) {
        if (!map.has(key)) map.set(key, { views: 0, visitors: new Set(), contacts: 0 });
        const bucket = map.get(key);
        bucket.views += 1;
        bucket.visitors.add(row.visitor_id);
      }
    }
    for (const row of contactRows) {
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      const day = dayKey(createdAt, this.timeZone);
      const hour = hourKey(createdAt, this.timeZone);
      for (const [map, key] of [[dailyMap, day], [hourlyMap, hour]]) {
        if (!map.has(key)) map.set(key, { views: 0, visitors: new Set(), contacts: 0 });
        map.get(key).contacts += 1;
      }
    }
    const today = dayKey(now, this.timeZone);
    const todayBucket = dailyMap.get(today);
    summary.totals = {
      views: Number(allViewRows[0]?.count || 0),
      visitors: Number(visitorRows[0]?.count || 0),
      contacts: Number(allContactRows[0]?.count || 0),
      contactPeople: Number(allContactRows[0]?.people || 0),
      todayViews: todayBucket?.views || 0,
      todayVisitors: todayBucket?.visitors.size || 0,
      todayContacts: todayBucket?.contacts || 0,
    };
    summary.daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, value]) => ({
        label: date.slice(5),
        views: value.views,
        visitors: value.visitors.size,
        contacts: value.contacts,
      }));
    summary.hourly = [...hourlyMap.entries()]
      .filter(([date]) => new Date(`${date}:00+08:00`) >= cutoffHourly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([date, value]) => ({
        label: date.slice(11),
        views: value.views,
        visitors: value.visitors.size,
        contacts: value.contacts,
      }));
    return summary;
  }
}
