const clientStorageKey = "jobCompassAnonymousAccount";
export const privacyPolicyVersion = "2026-06-15";

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `anon_${random}`;
}

export function getClientId() {
  let clientId = localStorage.getItem(clientStorageKey);
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(clientId || "")) {
    clientId = createClientId();
    localStorage.setItem(clientStorageKey, clientId);
  }
  return clientId;
}

export function apiFetch(input, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Client-Id", getClientId());
  return fetch(input, { ...options, headers });
}

function tokenLabel(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export function renderQuota(element, quota, adminMode = false) {
  if (!element) return;
  const tokens = Number(quota?.deepseek?.totalTokens || 0);
  const cost = Number(quota?.deepseek?.estimatedCostCny || 0);
  if (adminMode) {
    element.textContent = "管理员模式 · API 不限额";
    element.title = `管理员模式已启用：不受本地速率限制和 Tavily credits 限制；DeepSeek 已统计 ${tokenLabel(tokens)} tokens / 预估 ¥${cost.toFixed(4)}`;
    return;
  }
  if (!quota?.remaining) return;
  const remainingCredits = Number(quota.remaining.tavilyCredits || 0);
  const creditLimit = Number(quota.limits?.tavilyCredits || 0);
  element.textContent = `Tavily ${remainingCredits} credits · DeepSeek ${tokenLabel(tokens)} tokens / ¥${cost.toFixed(4)}`;
  element.title = `Tavily 反向验证每日 ${creditLimit} credits；今日 DeepSeek 预估 ¥${cost.toFixed(4)}，只统计 token，不限制调用次数`;
}

export async function refreshQuota(element) {
  try {
    const response = await apiFetch("/api/quota");
    const data = await response.json();
    if (response.ok) renderQuota(element, data.quota, data.adminMode);
  } catch {
    if (element) element.textContent = "额度状态暂不可用";
  }
}

export async function fetchAdminStatus() {
  const response = await apiFetch("/api/admin/status");
  return response.json();
}

export async function loginAdmin(password) {
  const response = await apiFetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "管理员登录失败");
  return data;
}

export async function logoutAdmin() {
  const response = await apiFetch("/api/admin/logout", { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "退出管理员模式失败");
  return data;
}

export async function fetchAdminStats() {
  const response = await apiFetch("/api/admin/stats");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "读取管理员统计失败");
  return data.stats;
}
