import { apiFetch, fetchAdminStatus, loginAdmin, logoutAdmin } from "./client-session.js";

const root = document.createElement("div");
root.className = "global-admin-access";
root.innerHTML = `
  <button class="global-admin-button" id="globalAdminButton" type="button" aria-pressed="false">
    <span aria-hidden="true">管</span><strong>管理员登录</strong>
  </button>
  <dialog class="admin-dialog global-admin-dialog" id="globalAdminDialog" aria-labelledby="globalAdminTitle">
    <div class="admin-dialog-panel">
      <button class="admin-dialog-close" id="globalAdminClose" type="button" aria-label="关闭">×</button>
      <span class="eyebrow">ADMIN ACCESS</span>
      <h2 id="globalAdminTitle">进入管理员模式</h2>
      <p>登录后可以查看统计、跳过额度限制，并在论坛处理待审核内容。</p>
      <label class="admin-password-field">
        <span>管理员密码</span>
        <input id="globalAdminPassword" type="password" autocomplete="current-password" />
      </label>
      <button class="admin-login-button" id="globalAdminLogin" type="button">启用管理员模式</button>
      <button class="quiet-button global-admin-logout" id="globalAdminLogout" type="button" hidden>退出管理员模式</button>
      <small class="global-admin-message" id="globalAdminMessage" role="status" aria-live="polite"></small>
    </div>
  </dialog>
`;

document.body.append(root);

const elements = {
  button: root.querySelector("#globalAdminButton"),
  dialog: root.querySelector("#globalAdminDialog"),
  close: root.querySelector("#globalAdminClose"),
  password: root.querySelector("#globalAdminPassword"),
  login: root.querySelector("#globalAdminLogin"),
  logout: root.querySelector("#globalAdminLogout"),
  message: root.querySelector("#globalAdminMessage"),
};

function setMessage(message) {
  elements.message.textContent = message || "";
}

function render(active) {
  document.body.classList.toggle("admin-mode-active", active);
  elements.button.classList.toggle("active", active);
  elements.button.setAttribute("aria-pressed", String(active));
  elements.button.querySelector("strong").textContent = active ? "管理员已登录" : "管理员登录";
  elements.logout.hidden = !active;
}

async function refresh() {
  try {
    const status = await fetchAdminStatus();
    render(Boolean(status.adminMode));
    if (!status.adminConfigured) {
      setMessage("服务器还没有配置 ADMIN_PASSWORD 或 ADMIN_PASSWORD_HASH。");
    }
  } catch {
    render(false);
  }
}

function openDialog() {
  setMessage("");
  elements.password.value = "";
  if (typeof elements.dialog.showModal === "function") elements.dialog.showModal();
  else elements.dialog.setAttribute("open", "");
  elements.password.focus();
}

elements.button.addEventListener("click", openDialog);
elements.close.addEventListener("click", () => elements.dialog.close());
elements.login.addEventListener("click", async () => {
  if (!elements.password.value) {
    setMessage("请输入管理员密码。");
    return;
  }
  elements.login.disabled = true;
  try {
    await loginAdmin(elements.password.value);
    elements.dialog.close();
    render(true);
    globalThis.dispatchEvent(new CustomEvent("job-compass-admin-changed", { detail: { adminMode: true } }));
  } catch (error) {
    setMessage(error.message || "管理员登录失败。");
  } finally {
    elements.login.disabled = false;
  }
});

elements.logout.addEventListener("click", async () => {
  await logoutAdmin();
  elements.dialog.close();
  render(false);
  globalThis.dispatchEvent(new CustomEvent("job-compass-admin-changed", { detail: { adminMode: false } }));
});

elements.password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.login.click();
  }
});

await refresh();
