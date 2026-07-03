import { apiFetch, loginAdmin } from "./client-session.js";

const elements = {
  sessionPill: document.querySelector("#forumSessionPill"),
  authForm: document.querySelector("#forumAuthForm"),
  phone: document.querySelector("#forumPhone"),
  password: document.querySelector("#forumPassword"),
  displayName: document.querySelector("#forumDisplayName"),
  role: document.querySelector("#forumRole"),
  login: document.querySelector("#forumLogin"),
  register: document.querySelector("#forumRegister"),
  logout: document.querySelector("#forumLogout"),
  accountCard: document.querySelector("#forumAccountCard"),
  adminPassword: document.querySelector("#forumAdminPassword"),
  adminLogin: document.querySelector("#forumAdminLogin"),
  topic: document.querySelector("#forumTopic"),
  title: document.querySelector("#forumTitle"),
  body: document.querySelector("#forumBody"),
  submitPost: document.querySelector("#forumSubmitPost"),
  refresh: document.querySelector("#forumRefresh"),
  summary: document.querySelector("#forumSummary"),
  filterForm: document.querySelector("#forumFilterForm"),
  search: document.querySelector("#forumSearch"),
  topicFilter: document.querySelector("#forumTopicFilter"),
  roleFilter: document.querySelector("#forumRoleFilter"),
  statusFilter: document.querySelector("#forumStatusFilter"),
  statusFilterWrap: document.querySelector("#forumStatusFilterWrap"),
  empty: document.querySelector("#forumEmpty"),
  postList: document.querySelector("#forumPostList"),
  toast: document.querySelector("#forumToast"),
};

let currentUser = null;
let adminMode = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleLabel(role) {
  return {
    boss: "老板 / HR",
    employee: "被雇佣者 / 在职者",
    candidate: "求职者",
    observer: "旁观交流者",
  }[role] || "求职者";
}

function statusLabel(status) {
  return {
    pending: "待审核",
    approved: "已公开",
    rejected: "已拒绝",
  }[status] || status;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

async function requestJson(url, options = {}) {
  const response = await apiFetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function renderSession() {
  elements.statusFilterWrap.hidden = !adminMode;
  if (currentUser) {
    elements.sessionPill.textContent = `${currentUser.displayName} · ${roleLabel(currentUser.role)}${adminMode ? " · 管理员" : ""}`;
    elements.authForm.hidden = true;
    elements.logout.hidden = false;
    elements.accountCard.hidden = false;
    elements.accountCard.innerHTML = `
      <strong>${escapeHtml(currentUser.displayName)}</strong>
      <span>${escapeHtml(roleLabel(currentUser.role))}</span>
      <small>${escapeHtml(currentUser.phoneMasked || "")}</small>
    `;
  } else {
    elements.sessionPill.textContent = adminMode ? "管理员模式" : "未登录";
    elements.authForm.hidden = false;
    elements.logout.hidden = true;
    elements.accountCard.hidden = true;
    elements.accountCard.replaceChildren();
  }
}

function renderSummary(summary) {
  if (!summary) {
    elements.summary.hidden = true;
    elements.summary.replaceChildren();
    return;
  }
  const stats = [
    ["可见主题", summary.visiblePosts || 0],
    ["已公开", summary.approvedPosts || 0],
    ["待审帖子", summary.pendingPosts || 0],
    ["待审评论", summary.pendingComments || 0],
    ["未处理举报", summary.openReports || 0],
  ];
  if (adminMode && Number.isInteger(summary.totalUsers)) stats.push(["注册用户", summary.totalUsers]);
  elements.summary.innerHTML = stats.map(([label, value]) => `
    <span><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>
  `).join("");
  elements.summary.hidden = false;
}

function reportButton(type, id, authorId) {
  if (!currentUser || currentUser.id === authorId) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "forum-link-button";
  button.textContent = "举报";
  button.addEventListener("click", () => reportContent(type, id));
  return button;
}

function appendAdminReportCount(container, count) {
  if (!adminMode || !count) return;
  const badge = document.createElement("span");
  badge.className = "forum-report-badge";
  badge.textContent = `举报 ${count}`;
  container.append(badge);
}

function renderPosts(posts) {
  elements.postList.replaceChildren();
  elements.empty.hidden = posts.length > 0;
  posts.forEach((post) => {
    const article = document.createElement("article");
    article.className = `forum-post status-${post.status}`;
    const comments = Array.isArray(post.comments) ? post.comments : [];
    article.innerHTML = `
      <div class="forum-post-head">
        <div>
          <span class="forum-topic">${escapeHtml(post.topic)}</span>
          <h3>${escapeHtml(post.title)}</h3>
        </div>
        <span class="forum-status">${escapeHtml(statusLabel(post.status))}</span>
      </div>
      <p>${escapeHtml(post.body)}</p>
      <div class="forum-meta forum-post-meta">
        <span>${escapeHtml(post.author.displayName)} · ${escapeHtml(roleLabel(post.author.role))}</span>
        <span>${new Date(post.createdAt).toLocaleString("zh-CN")}</span>
      </div>
      <div class="forum-comments"></div>
    `;

    const meta = article.querySelector(".forum-post-meta");
    appendAdminReportCount(meta, post.reportCount);
    const postReport = post.status === "approved" ? reportButton("post", post.id, post.author.id) : null;
    if (postReport) meta.append(postReport);

    const commentBox = article.querySelector(".forum-comments");
    comments.forEach((comment) => {
      const item = document.createElement("div");
      item.className = `forum-comment status-${comment.status}`;
      item.innerHTML = `
        <p>${escapeHtml(comment.body)}</p>
        <div class="forum-meta forum-comment-meta">
          <span>${escapeHtml(comment.author.displayName)} · ${escapeHtml(roleLabel(comment.author.role))}</span>
          <span>${escapeHtml(statusLabel(comment.status))}</span>
        </div>
      `;
      const commentMeta = item.querySelector(".forum-comment-meta");
      appendAdminReportCount(commentMeta, comment.reportCount);
      const commentReport = comment.status === "approved"
        ? reportButton("comment", comment.id, comment.author.id)
        : null;
      if (commentReport) commentMeta.append(commentReport);
      if (adminMode && comment.status === "pending") {
        item.append(moderationActions("comment", comment.id));
      }
      commentBox.append(item);
    });

    if (post.status === "approved") {
      const form = document.createElement("div");
      form.className = "forum-comment-form";
      form.innerHTML = `
        <textarea rows="2" maxlength="800" placeholder="写一条评论，提交后等待审核"></textarea>
        <button type="button">提交评论</button>
      `;
      form.querySelector("button").addEventListener("click", async () => {
        if (!currentUser) return showToast("请先登录后再评论");
        const body = form.querySelector("textarea").value.trim();
        if (!body) return showToast("评论不能为空");
        try {
          await requestJson(`/api/forum/posts/${post.id}/comments`, {
            method: "POST",
            body: JSON.stringify({ body }),
          });
          form.querySelector("textarea").value = "";
          showToast("评论已提交审核");
          await loadPosts();
        } catch (error) {
          showToast(error.message);
        }
      });
      commentBox.append(form);
    }

    if (adminMode && post.status === "pending") {
      article.append(moderationActions("post", post.id));
    }
    elements.postList.append(article);
  });
}

function moderationActions(type, id) {
  const wrap = document.createElement("div");
  wrap.className = "forum-moderation-actions";
  const approve = document.createElement("button");
  approve.type = "button";
  approve.textContent = "通过";
  approve.addEventListener("click", () => moderate(type, id, "approved"));
  const reject = document.createElement("button");
  reject.type = "button";
  reject.textContent = "拒绝";
  reject.className = "danger";
  reject.addEventListener("click", () => moderate(type, id, "rejected"));
  wrap.append(approve, reject);
  return wrap;
}

async function moderate(type, id, status) {
  const reason = status === "rejected"
    ? window.prompt("可以填写拒绝原因，留空也可以：", "")
    : "";
  try {
    await requestJson("/api/forum/moderation", {
      method: "POST",
      body: JSON.stringify({ type, id, status, reason }),
    });
    showToast(status === "approved" ? "已通过" : "已拒绝");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

async function reportContent(type, id) {
  const reason = window.prompt("请简单说明举报原因，例如：泄露隐私、攻击辱骂、广告引流。", "");
  if (reason === null) return;
  try {
    await requestJson("/api/forum/reports", {
      method: "POST",
      body: JSON.stringify({ type, id, reason }),
    });
    showToast("举报已提交");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

function buildPostUrl() {
  const params = new URLSearchParams();
  if (elements.search.value.trim()) params.set("q", elements.search.value.trim());
  if (elements.topicFilter.value) params.set("topic", elements.topicFilter.value);
  if (elements.roleFilter.value) params.set("role", elements.roleFilter.value);
  if (adminMode && elements.statusFilter.value) params.set("status", elements.statusFilter.value);
  const suffix = params.toString();
  return suffix ? `/api/forum/posts?${suffix}` : "/api/forum/posts";
}

async function loadSession() {
  const data = await requestJson("/api/forum/session");
  currentUser = data.user || null;
  adminMode = Boolean(data.adminMode);
  renderSession();
}

async function loadPosts() {
  const data = await requestJson(buildPostUrl());
  currentUser = data.user || currentUser;
  adminMode = Boolean(data.adminMode);
  renderSession();
  renderSummary(data.summary);
  renderPosts(data.posts || []);
}

async function authenticate(action) {
  try {
    const payload = {
      phone: elements.phone.value.trim(),
      password: elements.password.value,
      displayName: elements.displayName.value.trim(),
      role: elements.role.value,
    };
    const data = await requestJson(`/api/forum/${action}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    currentUser = data.user;
    renderSession();
    showToast(action === "register" ? "注册成功" : "登录成功");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

elements.login.addEventListener("click", () => authenticate("login"));
elements.register.addEventListener("click", () => authenticate("register"));
elements.logout.addEventListener("click", async () => {
  await requestJson("/api/forum/logout", { method: "POST", body: "{}" });
  currentUser = null;
  renderSession();
  await loadPosts();
  showToast("已退出论坛账号");
});

elements.adminLogin.addEventListener("click", async () => {
  try {
    await loginAdmin(elements.adminPassword.value);
    elements.adminPassword.value = "";
    showToast("管理员模式已启用");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
});

elements.submitPost.addEventListener("click", async () => {
  if (!currentUser) return showToast("请先登录后再发帖");
  try {
    await requestJson("/api/forum/posts", {
      method: "POST",
      body: JSON.stringify({
        topic: elements.topic.value,
        title: elements.title.value,
        body: elements.body.value,
      }),
    });
    elements.title.value = "";
    elements.body.value = "";
    showToast("帖子已提交审核");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
});

elements.refresh.addEventListener("click", loadPosts);
elements.filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadPosts();
});
elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.preventDefault();
});

await loadSession();
await loadPosts();
