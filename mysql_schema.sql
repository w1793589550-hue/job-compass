CREATE TABLE IF NOT EXISTS forum_users (
  id VARCHAR(64) PRIMARY KEY,
  phone_hash CHAR(64) NOT NULL UNIQUE,
  phone_masked VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  role ENUM('boss', 'employee', 'candidate', 'observer') NOT NULL DEFAULT 'candidate',
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id VARCHAR(64) PRIMARY KEY,
  author_id VARCHAR(64) NOT NULL,
  topic VARCHAR(30) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  moderation_status VARCHAR(20),
  moderation_reason VARCHAR(255),
  moderated_by VARCHAR(64),
  moderated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_posts_status_created (status, created_at),
  INDEX idx_forum_posts_author (author_id),
  CONSTRAINT fk_forum_posts_author FOREIGN KEY (author_id) REFERENCES forum_users(id)
);

CREATE TABLE IF NOT EXISTS forum_comments (
  id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  moderation_status VARCHAR(20),
  moderation_reason VARCHAR(255),
  moderated_by VARCHAR(64),
  moderated_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_forum_comments_post (post_id),
  INDEX idx_forum_comments_status_created (status, created_at),
  CONSTRAINT fk_forum_comments_post FOREIGN KEY (post_id) REFERENCES forum_posts(id),
  CONSTRAINT fk_forum_comments_author FOREIGN KEY (author_id) REFERENCES forum_users(id)
);

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
);

CREATE TABLE IF NOT EXISTS usage_daily (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  client_hash CHAR(64) NOT NULL,
  usage_day DATE NOT NULL,
  tavily_credits_used INT NOT NULL DEFAULT 0,
  deepseek_input_tokens BIGINT NOT NULL DEFAULT 0,
  deepseek_output_tokens BIGINT NOT NULL DEFAULT 0,
  deepseek_estimated_cost_cny DECIMAL(12, 6) NOT NULL DEFAULT 0,
  privacy_policy_version VARCHAR(32),
  consent_at TIMESTAMP NULL,
  UNIQUE KEY uniq_usage_client_day (client_hash, usage_day)
);

CREATE TABLE IF NOT EXISTS analytics_page_views (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_hash CHAR(64) NOT NULL,
  page_path VARCHAR(255) NOT NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analytics_viewed_at (viewed_at),
  INDEX idx_analytics_page_path (page_path)
);
