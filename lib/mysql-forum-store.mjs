import { randomUUID } from "node:crypto";
import { maskPhone, normalizePhone, phoneHash } from "./forum-store.mjs";

function iso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function authorFromRow(row, prefix = "author") {
  return {
    id: row[`${prefix}_id`],
    displayName: row[`${prefix}_display_name`],
    role: row[`${prefix}_role`],
    phoneMasked: row[`${prefix}_phone_masked`],
  };
}

export class MySqlForumStore {
  constructor({ pool, phoneHashSecret = "", now = () => new Date(), idFactory = randomUUID } = {}) {
    this.pool = pool;
    this.phoneHashSecret = phoneHashSecret;
    this.now = now;
    this.idFactory = idFactory;
  }

  publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      phoneMasked: user.phoneMasked,
      createdAt: user.createdAt,
    };
  }

  authorFor(user) {
    return {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      phoneMasked: user.phoneMasked,
    };
  }

  userFromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      phoneHash: row.phone_hash,
      phoneMasked: row.phone_masked,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      role: row.role,
      createdAt: iso(row.created_at),
      disabled: Boolean(row.disabled),
    };
  }

  async createUser({ phone, passwordHash, displayName, role }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) throw new Error("请输入有效的 11 位手机号。");
    const key = phoneHash(normalizedPhone, this.phoneHashSecret);
    const user = {
      id: this.idFactory(),
      phoneHash: key,
      phoneMasked: maskPhone(normalizedPhone),
      passwordHash,
      displayName,
      role,
      createdAt: this.now().toISOString(),
      disabled: false,
    };
    try {
      await this.pool.execute(
        `INSERT INTO forum_users
          (id, phone_hash, phone_masked, password_hash, display_name, role, disabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, key, user.phoneMasked, passwordHash, displayName, role, false, new Date(user.createdAt)],
      );
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") throw new Error("该手机号已经注册，请直接登录。");
      throw error;
    }
    return this.publicUser(user);
  }

  async userByPhone(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    const [rows] = await this.pool.execute(
      "SELECT * FROM forum_users WHERE phone_hash = ? LIMIT 1",
      [phoneHash(normalizedPhone, this.phoneHashSecret)],
    );
    return this.userFromRow(rows[0]);
  }

  async userById(userId) {
    const [rows] = await this.pool.execute(
      "SELECT * FROM forum_users WHERE id = ? AND disabled = FALSE LIMIT 1",
      [String(userId || "")],
    );
    return this.userFromRow(rows[0]);
  }

  postFromRow(row, reportCount = undefined, comments = []) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      topic: row.topic,
      status: row.status,
      author: authorFromRow(row),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      moderation: row.moderated_at ? {
        status: row.status,
        reason: row.moderation_reason || "",
        moderator: row.moderated_by || "admin",
        moderatedAt: iso(row.moderated_at),
      } : null,
      reportCount,
      comments,
    };
  }

  commentFromRow(row, reportCount = undefined) {
    return {
      id: row.id,
      postId: row.post_id,
      body: row.body,
      status: row.status,
      author: authorFromRow(row),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      moderation: row.moderated_at ? {
        status: row.status,
        reason: row.moderation_reason || "",
        moderator: row.moderated_by || "admin",
        moderatedAt: iso(row.moderated_at),
      } : null,
      reportCount,
    };
  }

  async createPost(user, { title, body, topic }) {
    const id = this.idFactory();
    const createdAt = this.now();
    await this.pool.execute(
      `INSERT INTO forum_posts (id, author_id, topic, title, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, user.id, topic, title, body, createdAt, createdAt],
    );
    const post = {
      id,
      title,
      body,
      topic,
      status: "pending",
      author: this.authorFor(user),
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      moderation: null,
      comments: [],
    };
    return clone(post);
  }

  async createComment(user, postId, { body }) {
    const [posts] = await this.pool.execute(
      "SELECT id, status FROM forum_posts WHERE id = ? LIMIT 1",
      [postId],
    );
    const post = posts[0];
    if (!post) throw new Error("帖子不存在。");
    if (post.status !== "approved") throw new Error("帖子通过审核后才可以评论。");
    const id = this.idFactory();
    const createdAt = this.now();
    await this.pool.execute(
      `INSERT INTO forum_comments (id, post_id, author_id, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [id, postId, user.id, body, createdAt, createdAt],
    );
    return {
      id,
      postId,
      body,
      status: "pending",
      author: this.authorFor(user),
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      moderation: null,
    };
  }

  async createReport(user, { type, id, reason }) {
    if (!["post", "comment"].includes(type)) throw new Error("未知举报对象。");
    const table = type === "post" ? "forum_posts" : "forum_comments";
    const [targets] = await this.pool.execute(
      `SELECT id, author_id, status FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );
    const target = targets[0];
    if (!target) throw new Error("内容不存在。");
    if (target.status !== "approved") throw new Error("只能举报已经公开展示的内容。");
    if (target.author_id === user.id) throw new Error("不能举报自己发布的内容。");

    const report = {
      id: this.idFactory(),
      type,
      targetId: id,
      reason,
      status: "open",
      reporter: this.authorFor(user),
      createdAt: this.now().toISOString(),
      resolvedAt: null,
    };
    try {
      await this.pool.execute(
        `INSERT INTO forum_reports
          (id, reporter_id, target_type, target_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        [report.id, user.id, type, id, reason, new Date(report.createdAt)],
      );
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY") {
        throw new Error("你已经举报过这条内容，管理员会统一处理。");
      }
      throw error;
    }
    return clone(report);
  }

  async moderate({ type, id, status, reason, moderator = "admin" }) {
    if (!["post", "comment"].includes(type)) throw new Error("未知审核对象。");
    if (!["approved", "rejected"].includes(status)) throw new Error("未知审核状态。");
    const table = type === "post" ? "forum_posts" : "forum_comments";
    const moderatedAt = this.now();
    const [result] = await this.pool.execute(
      `UPDATE ${table}
       SET status = ?, moderation_reason = ?, moderated_by = ?, moderated_at = ?, updated_at = ?
       WHERE id = ?`,
      [status, String(reason || "").trim().slice(0, 200), moderator, moderatedAt, moderatedAt, id],
    );
    if (!result.affectedRows) throw new Error("内容不存在。");
    await this.pool.execute(
      `UPDATE forum_reports
       SET status = 'resolved', resolved_at = ?
       WHERE target_type = ? AND target_id = ? AND status = 'open'`,
      [moderatedAt, type, id],
    );
    const [rows] = await this.pool.execute(
      `SELECT item.*, u.id AS author_id, u.display_name AS author_display_name,
        u.role AS author_role, u.phone_masked AS author_phone_masked
       FROM ${table} item
       JOIN forum_users u ON u.id = item.author_id
       WHERE item.id = ?`,
      [id],
    );
    return type === "post" ? this.postFromRow(rows[0]) : this.commentFromRow(rows[0]);
  }

  async reportCounts() {
    const [rows] = await this.pool.execute(
      `SELECT target_type, target_id, COUNT(*) AS report_count
       FROM forum_reports
       WHERE status = 'open'
       GROUP BY target_type, target_id`,
    );
    const counts = new Map();
    for (const row of rows) counts.set(`${row.target_type}:${row.target_id}`, Number(row.report_count || 0));
    return counts;
  }

  matchesFilters(post, { topic = "", status = "", role = "", q = "" } = {}, admin = false) {
    if (topic && post.topic !== topic) return false;
    if (admin && status && post.status !== status) return false;
    if (role && post.author.role !== role) return false;
    const keyword = String(q || "").trim().toLowerCase();
    if (!keyword) return true;
    return [
      post.title,
      post.body,
      post.topic,
      post.author.displayName,
      post.author.role,
    ].some((value) => String(value || "").toLowerCase().includes(keyword));
  }

  async list({ viewerId = "", admin = false, filters = {} } = {}) {
    const [postRows] = await this.pool.execute(
      `SELECT p.*, u.id AS author_id, u.display_name AS author_display_name,
        u.role AS author_role, u.phone_masked AS author_phone_masked
       FROM forum_posts p
       JOIN forum_users u ON u.id = p.author_id
       WHERE (? = TRUE OR p.status = 'approved' OR p.author_id = ?)
       ORDER BY p.created_at DESC`,
      [admin, viewerId],
    );
    const [commentRows] = await this.pool.execute(
      `SELECT c.*, u.id AS author_id, u.display_name AS author_display_name,
        u.role AS author_role, u.phone_masked AS author_phone_masked
       FROM forum_comments c
       JOIN forum_users u ON u.id = c.author_id
       WHERE (? = TRUE OR c.status = 'approved' OR c.author_id = ?)
       ORDER BY c.created_at ASC`,
      [admin, viewerId],
    );
    const counts = await this.reportCounts();
    const commentsByPost = new Map();
    for (const row of commentRows) {
      if (!commentsByPost.has(row.post_id)) commentsByPost.set(row.post_id, []);
      commentsByPost.get(row.post_id).push(this.commentFromRow(
        row,
        admin ? counts.get(`comment:${row.id}`) || 0 : undefined,
      ));
    }
    return postRows
      .map((row) => this.postFromRow(
        row,
        admin ? counts.get(`post:${row.id}`) || 0 : undefined,
        commentsByPost.get(row.id) || [],
      ))
      .filter((post) => this.matchesFilters(post, filters, admin));
  }

  async summary({ viewerId = "", admin = false } = {}) {
    const [postRows] = await this.pool.execute(
      "SELECT status, author_id FROM forum_posts",
    );
    const [commentRows] = await this.pool.execute(
      "SELECT status, author_id FROM forum_comments",
    );
    const visiblePosts = postRows.filter((post) => admin || post.status === "approved" || post.author_id === viewerId);
    const visibleComments = commentRows.filter((comment) => (
      admin || comment.status === "approved" || comment.author_id === viewerId
    ));
    const [[reportRow]] = await this.pool.execute(
      "SELECT COUNT(*) AS count FROM forum_reports WHERE status = 'open'",
    );
    const [[userRow]] = await this.pool.execute("SELECT COUNT(*) AS count FROM forum_users");
    return {
      visiblePosts: visiblePosts.length,
      approvedPosts: visiblePosts.filter((post) => post.status === "approved").length,
      pendingPosts: (admin ? postRows : visiblePosts).filter((post) => post.status === "pending").length,
      pendingComments: (admin ? commentRows : visibleComments).filter((comment) => comment.status === "pending").length,
      openReports: admin ? Number(reportRow.count || 0) : 0,
      totalUsers: admin ? Number(userRow.count || 0) : undefined,
    };
  }
}
