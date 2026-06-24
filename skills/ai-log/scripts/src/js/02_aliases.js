// ── 会话自定义别名 ─────────────────────────────────────────────
// 两层：localStorage 软别名（右键即时改、跨所有日期同源共享）覆盖 DATA.aliases
// 硬别名（脚本 --rename 固化注入，换设备/清缓存仍在）。软层优先。
const LS_KEY = "ai-log:aliases";
// 硬别名来自全局资产 aliases.js（脚本 --rename 维护，所有日期共享）；软别名见 localStorage。
const HARD_ALIASES = (typeof window.AILOG_ALIASES !== "undefined" && window.AILOG_ALIASES) || {};
function loadLocalAliases() {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch (_) { return {}; }
}
function saveLocalAlias(id, alias) {
  const m = loadLocalAliases();
  if (alias) m[id] = alias; else delete m[id];
  try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch (_) {}
}
// 该会话当前生效的自定义名（软层优先，无则硬层，再无则 null）
function aliasOf(id) {
  const local = loadLocalAliases();
  if (id in local) return local[id];
  if (id in HARD_ALIASES) return HARD_ALIASES[id];
  return null;
}
// 自动生成的原始代号（name-suffix）
const autoName = (s) => `${s.name}-${s.id.split("-")[1] || ""}`;
// 展示用 HTML：有别名时为「自定义名(自动名)」，括号及内为半透明小字
function displayNameHtml(s) {
  const alias = aliasOf(s.id), auto = autoName(s);
  return alias
    ? `${esc(alias)}<span class="auto-name">(${esc(auto)})</span>`
    : esc(auto);
}

