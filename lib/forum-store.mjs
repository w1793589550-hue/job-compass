import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function emptyData() {
  return {
    version: 1,
    users: {},
    usersByPhoneHash: {},
    posts: {},
    comments: {},
    reports: {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizePhone(phone) {
  const value = String(phone || "").replace(/\D/g, "");
  return /^1[3-9]\d{9}$/.test(value) ? value : "";
}

export function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `${normalized.slice(0, 3)}****${normalized.slice(-4)}` : "";
}

export function phoneHash(phone, secret = "") {
  return createHash("sha256").update(`${secret}:${normalizePhone(phone)}`).digest("hex");
}

export class ForumStore {
  constructor({ filePath, phoneHashSecret = "", now = () => new Date(), idFactory = randomUUID } = {}) {
    this.filePath = filePath;
    this.phoneHashSecret = phoneHashSecret;
    this.now = now;
    this.idFactory = idFactory;
    this.loaded = false;
    this.data = emptyData();
    this.mutation = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (parsed?.version === 1 && parsed.users && parsed.posts && parsed.comments) {
        this.data = {
          ...emptyData(),
          ...parsed,
          usersByPhoneHash: parsed.usersByPhoneHash || {},
          reports: parsed.reports || {},
        };
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

  async createUser({ phone, passwordHash, displayName, role }) {
    return this.enqueue(async () => {
      await this.load();
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) throw new Error("请输入有效的 11 位手机号。");
      const key = phoneHash(normalizedPhone, this.phoneHashSecret);
      if (this.data.usersByPhoneHash[key]) throw new Error("该手机号已经注册，请直接登录。");
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
      this.data.users[user.id] = user;
      this.data.usersByPhoneHash[key] = user.id;
      await this.persist();
      return this.publicUser(user);
    });
  }

  async userByPhone(phone) {
    await this.load();
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;
    const userId = this.data.usersByPhoneHash[phoneHash(normalizedPhone, this.phoneHashSecret)];
    return userId ? this.data.users[userId] || null : null;
  }

  async userById(userId) {
    await this.load();
    const user = this.data.users[String(userId || "")];
    return user && !user.disabled ? user : null;
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

  async createPost(user, { title, body, topic }) {
    return this.enqueue(async () => {
      await this.load();
      const post = {
        id: this.idFactory(),
        title,
        body,
        topic,
        status: "pending",
        author: this.authorFor(user),
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        moderation: null,
      };
      this.data.posts[post.id] = post;
      await this.persist();
      return clone(post);
    });
  }

  async createComment(user, postId, { body }) {
    return this.enqueue(async () => {
      await this.load();
      const post = this.data.posts[postId];
      if (!post) throw new Error("帖子不存在。");
      if (post.status !== "approved") throw new Error("帖子通过审核后才可以评论。");
      const comment = {
        id: this.idFactory(),
        postId,
        body,
        status: "pending",
        author: this.authorFor(user),
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        moderation: null,
      };
      this.data.comments[comment.id] = comment;
      await this.persist();
      return clone(comment);
    });
  }

  async createReport(user, { type, id, reason }) {
    return this.enqueue(async () => {
      await this.load();
      if (!["post", "comment"].includes(type)) throw new Error("未知举报对象。");
      const container = type === "post" ? this.data.posts : this.data.comments;
      const item = container[id];
      if (!item) throw new Error("内容不存在。");
      if (item.status !== "approved") throw new Error("只能举报已经公开展示的内容。");
      if (item.author.id === user.id) throw new Error("不能举报自己发布的内容。");
      const existing = Object.values(this.data.reports).find((report) => (
        report.type === type
        && report.targetId === id
        && report.reporter.id === user.id
        && report.status === "open"
      ));
      if (existing) throw new Error("你已经举报过这条内容，管理员会统一处理。");
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
      this.data.reports[report.id] = report;
      await this.persist();
      return clone(report);
    });
  }

  async moderate({ type, id, status, reason, moderator = "admin" }) {
    return this.enqueue(async () => {
      await this.load();
      if (!["post", "comment"].includes(type)) throw new Error("未知审核对象。");
      if (!["approved", "rejected"].includes(status)) throw new Error("未知审核状态。");
      const container = type === "post" ? this.data.posts : this.data.comments;
      const item = container[id];
      if (!item) throw new Error("内容不存在。");
      item.status = status;
      item.updatedAt = this.now().toISOString();
      item.moderation = {
        status,
        reason: String(reason || "").trim().slice(0, 200),
        moderator,
        moderatedAt: this.now().toISOString(),
      };
      for (const report of Object.values(this.data.reports)) {
        if (report.type === type && report.targetId === id && report.status === "open") {
          report.status = "resolved";
          report.resolvedAt = this.now().toISOString();
        }
      }
      await this.persist();
      return clone(item);
    });
  }

  reportCounts() {
    const counts = new Map();
    for (const report of Object.values(this.data.reports || {})) {
      if (report.status !== "open") continue;
      const key = `${report.type}:${report.targetId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
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
    await this.load();
    const reportCounts = this.reportCounts();
    const commentsByPost = new Map();
    for (const comment of Object.values(this.data.comments)) {
      const visible = admin || comment.status === "approved" || comment.author.id === viewerId;
      if (!visible) continue;
      if (!commentsByPost.has(comment.postId)) commentsByPost.set(comment.postId, []);
      commentsByPost.get(comment.postId).push({
        ...clone(comment),
        reportCount: admin ? reportCounts.get(`comment:${comment.id}`) || 0 : undefined,
      });
    }
    const posts = Object.values(this.data.posts)
      .filter((post) => admin || post.status === "approved" || post.author.id === viewerId)
      .filter((post) => this.matchesFilters(post, filters, admin))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((post) => ({
        ...clone(post),
        reportCount: admin ? reportCounts.get(`post:${post.id}`) || 0 : undefined,
        comments: (commentsByPost.get(post.id) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }));
    return posts;
  }

  async summary({ viewerId = "", admin = false } = {}) {
    await this.load();
    const visiblePosts = Object.values(this.data.posts)
      .filter((post) => admin || post.status === "approved" || post.author.id === viewerId);
    const visibleComments = Object.values(this.data.comments)
      .filter((comment) => admin || comment.status === "approved" || comment.author.id === viewerId);
    return {
      visiblePosts: visiblePosts.length,
      approvedPosts: visiblePosts.filter((post) => post.status === "approved").length,
      pendingPosts: (admin ? Object.values(this.data.posts) : visiblePosts)
        .filter((post) => post.status === "pending").length,
      pendingComments: (admin ? Object.values(this.data.comments) : visibleComments)
        .filter((comment) => comment.status === "pending").length,
      openReports: admin
        ? Object.values(this.data.reports || {}).filter((report) => report.status === "open").length
        : 0,
      totalUsers: admin ? Object.keys(this.data.users).length : undefined,
    };
  }

  async enqueue(work) {
    let result;
    this.mutation = this.mutation.catch(() => {}).then(async () => {
      result = await work();
    });
    await this.mutation;
    return result;
  }
}
