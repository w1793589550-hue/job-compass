const STORAGE_PREFIX = "jobCompassLocalProfile:";
const pathKey = `${STORAGE_PREFIX}${location.pathname || "/"}`;
const ignoredTypes = new Set(["password", "file", "hidden", "button", "submit", "reset"]);
const ignoredIds = new Set([
  "adminPassword",
  "globalAdminPassword",
  "forumPassword",
  "forumAdminPassword",
]);

function fieldKey(field) {
  return field.id || field.name || "";
}

function shouldPersist(field) {
  if (!fieldKey(field)) return false;
  if (field.closest(".admin-dialog")) return false;
  if (ignoredIds.has(field.id)) return false;
  if (field.matches("[data-no-local-profile]")) return false;
  if (field.tagName === "INPUT" && ignoredTypes.has(String(field.type || "").toLowerCase())) return false;
  return field.matches("input, select, textarea");
}

function fields() {
  return [...document.querySelectorAll("input, select, textarea")].filter(shouldPersist);
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(pathKey) || "{}");
  } catch {
    return {};
  }
}

function writeStore(data) {
  localStorage.setItem(pathKey, JSON.stringify({
    ...data,
    savedAt: new Date().toISOString(),
  }));
}

function fieldValue(field) {
  if (field.type === "checkbox") return field.checked;
  if (field.type === "radio") return field.checked ? field.value : undefined;
  return field.value;
}

function setFieldValue(field, value) {
  if (value === undefined) return;
  if (field.type === "checkbox") field.checked = Boolean(value);
  else if (field.type === "radio") field.checked = field.value === value;
  else field.value = value;
}

function save() {
  const data = readStore();
  for (const field of fields()) {
    const value = fieldValue(field);
    if (value !== undefined) data[fieldKey(field)] = value;
  }
  writeStore(data);
}

function restore() {
  const data = readStore();
  for (const field of fields()) setFieldValue(field, data[fieldKey(field)]);
}

function clear() {
  localStorage.removeItem(pathKey);
}

restore();

document.addEventListener("input", (event) => {
  if (shouldPersist(event.target)) save();
});

document.addEventListener("change", (event) => {
  if (shouldPersist(event.target)) save();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#clearAll, [data-clear-local-profile]")) {
    clear();
    setTimeout(save, 0);
  }
});
