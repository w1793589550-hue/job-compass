import {
  apiFetch,
  privacyPolicyVersion,
  refreshQuota,
  renderQuota,
} from "./client-session.js";

const elements = {
  apiStatus: document.querySelector("#foreignApiStatus"),
  quotaStatus: document.querySelector("#foreignQuotaStatus"),
  file: document.querySelector("#resumeFile"),
  fileLabel: document.querySelector("#resumeFileLabel"),
  resumeText: document.querySelector("#resumeText"),
  city: document.querySelector("#foreignCity"),
  identity: document.querySelector("#foreignIdentity"),
  englishLevel: document.querySelector("#englishLevel"),
  model: document.querySelector("#foreignModel"),
  roleInput: document.querySelector("#preferredRoleInput"),
  roleTags: document.querySelector("#preferredRoleTags"),
  addRole: document.querySelector("#addPreferredRole"),
  analyze: document.querySelector("#analyzeResume"),
  privacyConsent: document.querySelector("#foreignPrivacyConsent"),
  revokeConsent: document.querySelector("#foreignRevokeConsent"),
  analysisState: document.querySelector("#analysisState"),
  analysisPlaceholder: document.querySelector("#analysisPlaceholder"),
  analysis: document.querySelector("#resumeAnalysis"),
  count: document.querySelector("#foreignCount"),
  roleScope: document.querySelector("#foreignRoleScope"),
  search: document.querySelector("#searchForeignJobs"),
  resultCard: document.querySelector("#foreignResultCard"),
  resultContent: document.querySelector("#foreignResultContent"),
  evidenceSummary: document.querySelector("#foreignEvidenceSummary"),
  modelBadge: document.querySelector("#foreignModelBadge"),
  download: document.querySelector("#downloadForeignCsv"),
  toast: document.querySelector("#foreignToast"),
};

const ROLE_STORAGE_KEY = "jobCompassForeignRoles:v1";
let preferredRoles = loadRoles();
let resumeAnalysis = null;
let evidenceSources = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function loadRoles() {
  try {
    const stored = JSON.parse(localStorage.getItem(ROLE_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter(Boolean).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function saveRoles() {
  localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(preferredRoles));
}

function renderRoles() {
  elements.roleTags.replaceChildren();
  if (!preferredRoles.length) {
    const empty = document.createElement("span");
    empty.className = "preference-empty";
    empty.textContent = "尚未添加偏向岗位";
    elements.roleTags.append(empty);
    return;
  }

  preferredRoles.forEach((role) => {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "preference-tag";
    tag.innerHTML = `${escapeHtml(role)} <span aria-hidden="true">×</span>`;
    tag.setAttribute("aria-label", `删除偏向岗位：${role}`);
    tag.addEventListener("click", () => {
      preferredRoles = preferredRoles.filter((item) => item !== role);
      saveRoles();
      renderRoles();
    });
    elements.roleTags.append(tag);
  });
}

function addRoles() {
  const roles = elements.roleInput.value
    .split(/[，,、/]/)
    .map((role) => role.trim())
    .filter(Boolean);
  if (!roles.length) return;
  preferredRoles = [...new Set([...preferredRoles, ...roles])].slice(0, 12);
  elements.roleInput.value = "";
  saveRoles();
  renderRoles();
}

elements.addRole.addEventListener("click", addRoles);
elements.roleInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addRoles();
});

elements.file.addEventListener("change", () => {
  const file = elements.file.files[0];
  if (!file) {
    elements.fileLabel.textContent = "未选择文件，也可以直接粘贴文字";
    return;
  }
  const size = file.size < 1024 * 1024
    ? `${Math.ceil(file.size / 1024)} KB`
    : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  elements.fileLabel.textContent = `${file.name} · ${size}`;
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop());
    reader.onerror = () => reject(new Error("无法读取简历文件"));
    reader.readAsDataURL(file);
  });
}

function addRecommendedRole(role) {
  if (!role || preferredRoles.includes(role)) return;
  preferredRoles = [...preferredRoles, role].slice(0, 12);
  saveRoles();
  renderRoles();
  showToast(`已加入偏向岗位：${role}`);
}

function textList(title, values) {
  if (!Array.isArray(values) || !values.length) return null;
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  values.forEach((value) => {
    const item = document.createElement("li");
    item.textContent = String(value);
    list.append(item);
  });
  section.append(heading, list);
  return section;
}

function renderAnalysis(data) {
  elements.analysis.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "analysis-summary";
  const summaryLabel = document.createElement("span");
  summaryLabel.textContent = "简历摘要";
  const summaryText = document.createElement("p");
  summaryText.textContent = data.summary || "不知道";
  summary.append(summaryLabel, summaryText);
  elements.analysis.append(summary);

  const roles = document.createElement("section");
  roles.className = "recommended-roles";
  const rolesTitle = document.createElement("h3");
  rolesTitle.textContent = "推荐岗位方向";
  roles.append(rolesTitle);

  (data.recommendedRoles || []).forEach((item) => {
    const card = document.createElement("article");
    const head = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.role || "岗位方向";
    const fit = document.createElement("span");
    fit.textContent = item.fit || "待判断";
    head.append(title, fit);
    const reason = document.createElement("p");
    reason.textContent = (item.reasons || []).join("；") || "没有提供匹配理由";
    const evidence = document.createElement("small");
    evidence.textContent = `简历依据：${(item.evidenceFromResume || []).join("；") || "不知道"}`;
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = preferredRoles.includes(item.role) ? "已加入偏好" : "加入偏好";
    add.disabled = preferredRoles.includes(item.role);
    add.addEventListener("click", () => {
      addRecommendedRole(item.role);
      add.disabled = true;
      add.textContent = "已加入偏好";
    });
    card.append(head, reason, evidence, add);
    roles.append(card);
  });
  elements.analysis.append(roles);

  [
    textList("已有优势", data.strengths),
    textList("需要补齐或确认", data.gaps),
    textList("可尝试的外企进入路径", data.foreignEntryPaths),
    textList("下一步行动", data.nextActions),
  ].filter(Boolean).forEach((section) => elements.analysis.append(section));

  if (data.englishAdvice) {
    const note = document.createElement("section");
    note.className = "english-advice";
    const title = document.createElement("h3");
    title.textContent = "英语要求处理";
    const text = document.createElement("p");
    text.textContent = data.englishAdvice;
    note.append(title, text);
    elements.analysis.append(note);
  }

  elements.analysisPlaceholder.hidden = true;
  elements.analysis.hidden = false;
  elements.analysisState.textContent = "分析完成";
  elements.analysisState.classList.add("ready");
}

elements.analyze.addEventListener("click", async () => {
  const file = elements.file.files[0];
  const pastedText = elements.resumeText.value.trim();
  if (!file && pastedText.length < 80) {
    showToast("请选择简历文件，或粘贴至少 80 个字的简历内容");
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    showToast("简历文件请控制在 5 MB 以内");
    return;
  }
  if (!elements.privacyConsent.checked) {
    showToast("请先阅读隐私政策并勾选简历分析授权");
    elements.privacyConsent.focus();
    return;
  }

  elements.analyze.disabled = true;
  elements.analyze.querySelector("span").textContent = "正在提取经历并分析岗位方向…";
  elements.analysisState.textContent = "分析中";
  elements.analysisState.classList.remove("ready");

  try {
    const response = await apiFetch("/api/analyze-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file?.name || "",
        mimeType: file?.type || "",
        fileBase64: file ? await fileToBase64(file) : "",
        resumeText: pastedText,
        preferredRoles,
        targetCity: elements.city.value.trim(),
        identity: elements.identity.value.trim(),
        englishLevel: elements.englishLevel.value,
        model: elements.model.value,
        privacyConsent: true,
        privacyPolicyVersion,
        consentAt: new Date().toISOString(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "简历分析失败");
    resumeAnalysis = data.analysis;
    renderAnalysis(resumeAnalysis);
    renderQuota(elements.quotaStatus, data.quota, data.adminMode);
  } catch (error) {
    elements.analysisState.textContent = "分析失败";
    showToast(error.message);
  } finally {
    elements.analyze.disabled = false;
    elements.analyze.querySelector("span").textContent = "分析简历并推荐岗位方向";
  }
});

elements.revokeConsent.addEventListener("click", async () => {
  elements.file.value = "";
  elements.fileLabel.textContent = "未选择文件，也可以直接粘贴文字";
  elements.resumeText.value = "";
  elements.privacyConsent.checked = false;
  elements.analysis.replaceChildren();
  elements.analysis.hidden = true;
  elements.analysisPlaceholder.hidden = false;
  elements.analysisState.textContent = "等待简历";
  elements.analysisState.classList.remove("ready");
  resumeAnalysis = null;
  try {
    await apiFetch("/api/privacy/revoke", { method: "POST" });
  } catch {
    // Clearing local resume content does not depend on server availability.
  }
  showToast("已撤回授权并清除本页简历内容");
});

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/(?<!href=")(https?:\/\/[^\s<>"）。，、]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[S(\d+)\]/g, (match, number) => {
      const source = evidenceSources.find((item) => item.id === `S${number}`);
      if (!source?.url) return match;
      return `<a class="source-ref" href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttribute(source.title || source.id)}">${match}</a>`;
    });
}

function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r/g, "").split("\n");
  let html = "";
  let listTag = "";
  let tableRows = [];
  const flushList = () => {
    if (listTag) html += `</${listTag}>`;
    listTag = "";
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const rows = tableRows
      .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell.trim())))
      .map((row) => row.map((cell) => inlineMarkdown(cell.trim())));
    if (rows.length) {
      html += `<table><thead><tr>${rows[0].map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>`;
      html += rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
      html += "</tbody></table>";
    }
    tableRows = [];
  };

  for (const line of lines) {
    if (/^\|.*\|$/.test(line.trim())) {
      flushList();
      tableRows.push(line.trim().slice(1, -1).split("|"));
      continue;
    }
    flushTable();
    if (!line.trim() || /^\s*---+\s*$/.test(line)) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      html += `<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`;
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (bullet || ordered) {
      const nextTag = bullet ? "ul" : "ol";
      if (listTag !== nextTag) {
        flushList();
        html += `<${nextTag}>`;
        listTag = nextTag;
      }
      html += `<li>${inlineMarkdown((bullet || ordered)[1])}</li>`;
      continue;
    }
    flushList();
    html += `<p>${inlineMarkdown(line)}</p>`;
  }
  flushList();
  flushTable();
  return html;
}

function citationTitleMatches(value) {
  return /^(?:引用来源|参考来源|参考文献|来源列表|MLA\s*格式(?:引用)?来源|Works\s+Cited|Sources)\s*(?:[（(].*?[）)])?\s*[:：]?\s*$/i
    .test(String(value).replace(/\s+/g, " ").trim());
}

function collapseCitationSection(container) {
  if (container.querySelector(".citation-disclosure")) return;
  const candidates = [...container.children].filter((item) =>
    /^(?:H[1-6]|P|DIV)$/.test(item.tagName),
  );
  const heading = candidates.find((item) => citationTitleMatches(item.textContent));
  if (!heading) return;

  const details = document.createElement("details");
  details.className = "citation-disclosure";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = heading.textContent.trim();
  const arrow = document.createElement("i");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "⌄";
  summary.append(label, arrow);
  const content = document.createElement("div");
  content.className = "citation-content";

  let node = heading.nextSibling;
  while (node) {
    const next = node.nextSibling;
    content.append(node);
    node = next;
  }
  heading.replaceWith(details);
  details.append(summary, content);
}

function renderEvidenceSummary(search, billing) {
  if (!search) {
    elements.evidenceSummary.hidden = true;
    return;
  }
  const sources = Array.isArray(search.sources) ? search.sources : [];
  elements.evidenceSummary.replaceChildren();
  const line = document.createElement("p");
  line.innerHTML = `<strong>本次证据链：</strong>${Number(search.queries?.length || 0)} 组检索词，` +
    `${Number(search.sourceCount || 0)} 个去重网页来源，其中 ${Number(search.directlyVerifiedCount || 0)} 个由服务端直接读取正文，` +
    `${Number(search.providerVerifiedCount || 0)} 个由 Tavily 抽取正文，` +
    `访问日期 ${escapeHtml(search.accessedAt || "不知道")}。`;
  elements.evidenceSummary.append(line);
  if (billing) {
    const costLine = document.createElement("p");
    const deepseek = billing.deepseek || {};
    const tavily = billing.tavily || {};
    costLine.innerHTML = `<strong>本次用量：</strong>DeepSeek 输入 ${Number(deepseek.promptTokens || 0).toLocaleString()} tokens，` +
      `输出 ${Number(deepseek.completionTokens || 0).toLocaleString()} tokens，预估 ¥${Number(deepseek.estimatedCostCny || 0).toFixed(4)}，` +
      `平均 ¥${Number(deepseek.averageCnyPerToken || 0).toFixed(8)} / token；` +
      `Tavily ${Number(tavily.requests || 0)} 次 / ${Number(tavily.credits || 0)} credits，` +
      `合计预估 ¥${Number(billing.estimatedTotalCny || 0).toFixed(4)}${billing.cached ? "（缓存命中，本次未新增消耗）" : ""}。`;
    elements.evidenceSummary.append(costLine);
  }
  if (sources.length) {
    const details = document.createElement("details");
    details.className = "evidence-links";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>查看 ${sources.length} 个来源链接</span><i aria-hidden="true">⌄</i>`;
    const list = document.createElement("ol");
    sources.forEach((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.id} · ${source.title || source.url}`;
      const state = document.createElement("small");
      state.className = `evidence-state ${["body_verified", "provider_verified"].includes(source.verificationStatus) ? "verified" : ""}`;
      state.textContent = source.verificationStatus === "body_verified"
        ? "服务端已读取正文"
        : source.verificationStatus === "provider_verified"
          ? "Tavily 已抽取正文"
          : "仅搜索摘要";
      item.append(link, state);
      list.append(item);
    });
    details.append(summary, list);
    elements.evidenceSummary.append(details);
  }
  elements.evidenceSummary.hidden = false;
}

function foreignPrompt(rolePreference, resumeSummary) {
  return `请执行外企岗位专项检索。所有事实必须来自本次联网搜索取得的可访问来源，不得使用模型记忆补全。

用户画像：
- 身份：${elements.identity.value.trim() || "不知道"}
- 目标城市：${elements.city.value.trim() || "不知道"}
- 岗位偏好：${rolePreference}
- 岗位范围：${elements.roleScope.value}
- 英语水平：${elements.englishLevel.value}
- 目标数量：${elements.count.value} 家
- 简历匹配摘要：${resumeSummary || "未导入简历，按用户明确偏好搜索"}

固定规则：
1. 不得凭英文名称、国际业务、英文官网或英语要求判断企业属于外企。
2. 必须核验境外投资者、外资控制关系或政府、企业法定披露中的外商投资身份。
3. 区分品牌、境内招聘主体、合同主体、薪资主体、社保主体和实际办公地点。
4. A、B 级必须有当前招聘证据，并明确核验目标学历、应届生或零经验适配。
5. 英语要求按岗位记录。招聘页面未提及时写“页面未提及”，不得写“无需英语”。
6. 每家 A、B 级公司至少使用两类独立来源，其中一类证明招聘，一类证明公司主体、外资关系、业务或经营状态。招聘来源优先核验企业官网、企业招聘官网、BOSS直聘、猎聘和鱼泡直聘。
7. 招聘来源字段必须写来源名称、完整 URL 和证据编号。
8. 搜索不到负面信息不能证明没有劳动争议或经营风险。
9. 无法确认的字段写“不知道”，不得凑数。
10. 先输出 A 级，再输出 B 级、观察级和排除项。

输出字段：序号、公司名称、品牌名、等级、国家或地区背景、外企身份依据、境内招聘主体、规模及口径、实际办公地点、岗位、学历与应届生依据、英语要求、招聘状态及日期、薪资、招聘来源、培养证据、风险信息、简历匹配说明、待确认事项、验证结论。

正文使用 [S1]、[S2] 标注证据。文末使用“引用来源（MLA格式）”作为标题，只列正文实际使用的来源，给出标题、网站名、URL 和访问日期。`;
}

elements.search.addEventListener("click", async () => {
  const count = Number(elements.count.value);
  if (!elements.city.value.trim()) return showToast("请填写目标城市");
  if (!Number.isInteger(count) || count < 1 || count > 30) return showToast("目标数量需为 1 到 30");

  const recommended = (resumeAnalysis?.recommendedRoles || []).map((item) => item.role).filter(Boolean);
  const rolePreference = [...new Set([...preferredRoles, ...recommended])].join("、");
  if (!rolePreference) return showToast("请先添加偏向岗位，或完成简历分析");
  const resumeSummary = resumeAnalysis
    ? `${resumeAnalysis.summary || ""}；优势：${(resumeAnalysis.strengths || []).join("、")}`
    : "";

  elements.search.disabled = true;
  elements.search.querySelector("span").textContent = "正在检索外企身份、岗位和语言要求…";

  try {
    const profile = {
      age: "不知道",
      identity: elements.identity.value.trim() || "不知道",
      city: elements.city.value.trim(),
      districts: [],
      rolePreference,
      companyCount: count,
      language: "简体中文",
      mode: "balanced",
      modeLabel: "外企专项",
      foreignCompanyOnly: true,
      englishLevel: elements.englishLevel.value,
      resumeSummary,
    };
    const response = await apiFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: foreignPrompt(rolePreference, resumeSummary),
        profile,
        model: elements.model.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "外企检索失败");
    renderQuota(elements.quotaStatus, data.quota, data.adminMode);
    evidenceSources = Array.isArray(data.search?.sources) ? data.search.sources : [];
    elements.resultContent.innerHTML = renderMarkdown(data.content);
    collapseCitationSection(elements.resultContent);
    renderEvidenceSummary(data.search, data.billing);
    elements.modelBadge.textContent = data.model || elements.model.value;
    elements.download.disabled = elements.resultContent.querySelectorAll("table").length === 0;
    elements.resultCard.hidden = false;
    elements.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    evidenceSources = [];
    elements.evidenceSummary.hidden = true;
    elements.resultContent.innerHTML = `<p><strong>生成失败：</strong>${escapeHtml(error.message)}</p>`;
    elements.resultCard.hidden = false;
    elements.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    elements.search.disabled = false;
    elements.search.querySelector("span").textContent = "联网查找并反向验证外企岗位";
  }
});

function downloadTablesAsCsv() {
  const tables = [...elements.resultContent.querySelectorAll("table")];
  if (!tables.length) return showToast("当前结果中没有可导出的表格");
  const rows = [];
  tables.forEach((table, index) => {
    if (index) rows.push([]);
    const title = table.previousElementSibling?.textContent?.trim() || `结果 ${index + 1}`;
    rows.push([title]);
    [...table.rows].forEach((row) => rows.push([...row.cells].map((cell) => cell.innerText.trim())));
  });
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${elements.city.value.trim() || "外企"}岗位核验结果-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("表格已开始下载，可直接用 Excel 打开");
}

elements.download.addEventListener("click", downloadTablesAsCsv);
document.querySelector("#copyForeignResult").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.resultContent.innerText);
  showToast("结果已复制");
});

async function checkHealth() {
  try {
    const response = await apiFetch("/api/health");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error();
    const ready = data.apiConfigured && data.searchConfigured;
    elements.apiStatus.classList.toggle("ready", ready);
    elements.apiStatus.classList.toggle("error", !ready);
    elements.apiStatus.querySelector("span").textContent = ready
      ? `DeepSeek + ${data.searchProvider} 已连接`
      : "服务配置不完整";
    refreshQuota(elements.quotaStatus);
  } catch {
    elements.apiStatus.classList.add("error");
    elements.apiStatus.querySelector("span").textContent = "服务连接失败";
  }
}

renderRoles();
checkHealth();
