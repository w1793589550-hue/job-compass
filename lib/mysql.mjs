import mysql from "mysql2/promise";

function mysqlUrlFromEnv(env = process.env) {
  const value = env.MYSQL_URL || env.DATABASE_URL || "";
  return /^mysql(?:\+srv)?:\/\//i.test(value) ? value : "";
}

export function mysqlConfigFromEnv(env = process.env) {
  const uri = mysqlUrlFromEnv(env);
  if (uri) {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      ssl: parsed.searchParams.get("ssl") === "true" ? {} : undefined,
      connectionLimit: Math.max(1, Number(env.MYSQL_CONNECTION_LIMIT || 5)),
    };
  }
  if (!env.MYSQL_HOST || !env.MYSQL_USER || !env.MYSQL_DATABASE) return null;
  return {
    host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE,
    connectionLimit: Math.max(1, Number(env.MYSQL_CONNECTION_LIMIT || 5)),
  };
}

export function createMysqlPool(config = mysqlConfigFromEnv()) {
  if (!config) return null;
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    namedPlaceholders: true,
    charset: "utf8mb4",
    timezone: "Z",
  });
}

export function mysqlEnabled(env = process.env) {
  return Boolean(mysqlConfigFromEnv(env));
}

export async function ensureMysqlSchema(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_users (
      id VARCHAR(64) PRIMARY KEY,
      phone_hash CHAR(64) NOT NULL UNIQUE,
      phone_masked VARCHAR(20) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(40) NOT NULL,
      role ENUM('boss', 'employee', 'candidate', 'observer') NOT NULL DEFAULT 'candidate',
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_posts (
      id VARCHAR(64) PRIMARY KEY,
      author_id VARCHAR(64) NOT NULL,
      topic VARCHAR(30) NOT NULL,
      title VARCHAR(120) NOT NULL,
      body TEXT NOT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      moderation_reason VARCHAR(255),
      moderated_by VARCHAR(64),
      moderated_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_forum_posts_status_created (status, created_at),
      INDEX idx_forum_posts_author (author_id),
      CONSTRAINT fk_forum_posts_author FOREIGN KEY (author_id) REFERENCES forum_users(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_comments (
      id VARCHAR(64) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      author_id VARCHAR(64) NOT NULL,
      body TEXT NOT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      moderation_reason VARCHAR(255),
      moderated_by VARCHAR(64),
      moderated_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_forum_comments_post (post_id),
      INDEX idx_forum_comments_status_created (status, created_at),
      CONSTRAINT fk_forum_comments_post FOREIGN KEY (post_id) REFERENCES forum_posts(id),
      CONSTRAINT fk_forum_comments_author FOREIGN KEY (author_id) REFERENCES forum_users(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS forum_reports (
      id VARCHAR(64) PRIMARY KEY,
      reporter_id VARCHAR(64) NOT NULL,
      target_type ENUM('post', 'comment') NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      INDEX idx_forum_reports_target (target_type, target_id, status),
      CONSTRAINT fk_forum_reports_user FOREIGN KEY (reporter_id) REFERENCES forum_users(id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_daily (
      account_hash CHAR(64) NOT NULL,
      usage_day DATE NOT NULL,
      counts_json JSON NOT NULL,
      deepseek_json JSON NOT NULL,
      models_json JSON NOT NULL,
      consent_json JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (account_hash, usage_day)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_visitors (
      visitor_id VARCHAR(80) PRIMARY KEY,
      first_seen TIMESTAMP NOT NULL,
      last_seen TIMESTAMP NOT NULL,
      views INT NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_page_views (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      visitor_id VARCHAR(80) NOT NULL,
      page_path VARCHAR(255) NOT NULL,
      viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_analytics_viewed_at (viewed_at),
      INDEX idx_analytics_page_path (page_path)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_contacts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      client_id VARCHAR(120) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_analytics_contacts_created (created_at),
      INDEX idx_analytics_contacts_client (client_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}
