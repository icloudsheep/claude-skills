// ── 日志条目本地编辑覆盖层 ─────────────────────────────────────
// 与别名同理的双层模型：网页内改标题/正文/删除 → 即时写 localStorage（跨设备不携带，
// 但同源跨日期共享、刷新即生效），并在控制台打印 python 命令永久落盘到 data.json。
// 覆盖项按「日期#seq」定位（seq 为当天写入时固定的全局序号，稳定可用）。
const EDIT_KEY = "ai-log:edits";
const entryKey = (e) => `${DATA.date}#${e.seq}`;
function loadEdits() {
  try { const v = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch (_) { return {}; }
}
function saveEdit(key, patch) {
  const m = loadEdits();
  if (patch === null) delete m[key];
  else m[key] = Object.assign({}, m[key], patch);
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(m)); } catch (_) {}
}
// 把覆盖层应用到原始条目，返回生效后的副本（含 _deleted 标记）
function effectiveEntry(e) {
  const ov = loadEdits()[entryKey(e)];
  if (!ov) return e;
  const merged = Object.assign({}, e);
  if (ov.deleted) merged._deleted = true;
  if (ov.title != null) merged.title = ov.title;
  if (ov.summary != null) merged.summary = ov.summary;
  return merged;
}
// 可复制的落盘命令（永久写回 data.json，换设备/清缓存仍在）
const editCmd = (e, fields) => {
  const parts = [`python3 <skill>/scripts/ai_logger.py --edit "${DATA.date}" ${e.seq}`];
  if ("title" in fields) parts.push(`--title ${shq(fields.title)}`);
  if ("summary" in fields) parts.push(`--summary ${shq(fields.summary)}`);
  return parts.join(" ");
};
const deleteCmd = (e) => `python3 <skill>/scripts/ai_logger.py --delete "${DATA.date}" ${e.seq}`;
// shell 单引号转义：把内部 ' 替换为 '\'' ，整体用单引号包裹
const shq = (s) => "'" + String(s == null ? "" : s).replace(/'/g, "'\\''") + "'";

