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
  postForm: document.querySelector("#forumPostForm"),
  topic: document.querySelector("#forumTopic"),
  title: document.querySelector("#forumTitle"),
  body: document.querySelector("#forumBody"),
  submitPost: document.querySelector("#forumSubmitPost"),
  refresh: document.querySelector("#forumRefresh"),
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
    .replaceAll('"', "&quot;");
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
  adminMode = Boolean(adminMode);
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
      <div class="forum-meta">
        <span>${escapeHtml(post.author.displayName)} · ${escapeHtml(roleLabel(post.author.role))}</span>
        <span>${new Date(post.createdAt).toLocaleString("zh-CN")}</span>
      </div>
      <div class="forum-comments"></div>
    `;

    const commentBox = article.querySelector(".forum-comments");
    comments.forEach((comment) => {
      const item = document.createElement("div");
      item.className = `forum-comment status-${comment.status}`;
      item.innerHTML = `
        <p>${escapeHtml(comment.body)}</p>
        <div class="forum-meta">
          <span>${escapeHtml(comment.author.displayName)} · ${escapeHtml(roleLabel(comment.author.role))}</span>
          <span>${escapeHtml(statusLabel(comment.status))}</span>
        </div>
      `;
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
  try {
    await requestJson("/api/forum/moderation", {
      method: "POST",
      body: JSON.stringify({ type, id, status }),
    });
    showToast(status === "approved" ? "已通过" : "已拒绝");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSession() {
  const data = await requestJson("/api/forum/session");
  currentUser = data.user || null;
  adminMode = Boolean(data.adminMode);
  renderSession();
}

async function loadPosts() {
  const data = await requestJson("/api/forum/posts");
  currentUser = data.user || currentUser;
  adminMode = Boolean(data.adminMode);
  renderSession();
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

await loadSession();
await loadPosts();
