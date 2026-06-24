// 页面级右键菜单：刷新 / 主题切换（玻璃·拟态·报纸）/ 关于
// 主题两维：style(玻璃/拟态/报纸) + mode(光明/黑暗)，各存 localStorage、各自单选。
const STYLE_KEY = "ai-log:style", MODE_KEY = "ai-log:mode";
const ls = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
const curStyle = () => ls(STYLE_KEY, "glass");
const curMode = () => ls(MODE_KEY, "light");
const STYLE_LABEL = { glass: "玻璃", neumorphism: "拟态", newspaper: "报纸" };
const MODE_LABEL = { light: "光明", dark: "黑暗" };
// 把当前两维写到 <html> 属性，CSS 据此切换
function applyTheme() {
  document.documentElement.setAttribute("data-style", curStyle());
  document.documentElement.setAttribute("data-mode", curMode());
}
function openPageMenu(ev) {
  const st = curStyle(), md = curMode();
  const styleItem = (k, l) => ({ label: l, check: st === k, act: () => setStyle(k) });
  const modeItem = (k, l) => ({ label: l, check: md === k, act: () => setMode(k) });
  openMenu(ev, { items: [
    { label: "🔄 刷新", act: () => location.reload() },
    { sep: true },
    styleItem("glass", "🫧 玻璃"),
    styleItem("neumorphism", "🧊 拟态"),
    styleItem("newspaper", "📰 报纸"),
    { sep: true },
    modeItem("light", "☀️ 光明"),
    modeItem("dark", "🌙 黑暗"),
    { sep: true },
    { label: "ℹ️ 关于", act: showAbout },
  ] });
}
function setStyle(key) {
  try { localStorage.setItem(STYLE_KEY, key); } catch (_) {}
  applyTheme();
  showToast(`已切换为「${STYLE_LABEL[key]}」风格`, { title: "主题" });
}
function setMode(key) {
  try { localStorage.setItem(MODE_KEY, key); } catch (_) {}
  applyTheme();
  showToast(`已切换为「${MODE_LABEL[key]}」模式`, { title: "主题" });
}
