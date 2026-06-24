
function drawLink() {
  const path = document.getElementById("linkpath");
  if (!ACTIVE) { path.classList.remove("on"); return; }
  const wrap = document.getElementById("detailwrap");
  const a = ACTIVE.getBoundingClientRect(), b = wrap.getBoundingClientRect();
  const x1 = a.right, y1 = a.top + a.height / 2, x2 = b.left, y2 = b.top + 30, mx = x1 + (x2 - x1) * 0.5;
  path.setAttribute("d", `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
  path.setAttribute("stroke", ACTIVE.style.getPropertyValue("--c"));
  path.classList.add("on");
}
// rAF 节流：滚动/resize 时每帧最多重算一次连接线，避免高频 getBoundingClientRect 触发强制重排
let _linkRaf = 0;
function scheduleDrawLink() {
  if (_linkRaf) return;
  _linkRaf = requestAnimationFrame(() => { _linkRaf = 0; drawLink(); });
}
// 选中/重排后，详情框 fadein(~.84s) 与节点 pop/translate(~.9s) 持续改变端点坐标，
// 但 drawLink 仅在 scroll/resize 触发，动画期间连线会停在旧位置——玻璃主题尤甚（还叠加
// 背景流动重排）。这里在动画时长内每帧重算一次，让连线实时贴合两端，动画结束即停。
let _trackUntil = 0, _trackRaf = 0;
function trackLink(ms = 1000) {
  _trackUntil = Math.max(_trackUntil, performance.now() + ms);
  if (_trackRaf) return;
  const step = () => {
    drawLink();
    if (performance.now() < _trackUntil && ACTIVE) { _trackRaf = requestAnimationFrame(step); }
    else { _trackRaf = 0; }
  };
  _trackRaf = requestAnimationFrame(step);
}

function renderFooter() {
  const fo = document.getElementById("footer");
  const ver = (typeof window.AILOG_VERSION !== "undefined" && window.AILOG_VERSION) || {};
  const repo = ver.repo || "https://github.com/icloudsheep/claude-skills";
  const verLine = ver.version
    ? `<div class="f-row">版本 <span class="span f-ver">${esc(ver.version)}</span></div>` : "";
  const repoLine = `<div class="f-row"><a href="${esc(repo)}" target="_blank" rel="noopener">GitHub 仓库</a></div>`;
  const copyLine = `<div class="f-row f-copy">Copyright © 2026 UniEver Studio. All rights reserved.</div>`;

  if (!ENTRIES.length) {
    fo.innerHTML = `<div class="f-row">AI 工作日志</div>${verLine}${repoLine}${copyLine}`;
    return;
  }
  const firstE = ENTRIES[0], lastE = ENTRIES[ENTRIES.length - 1];
  const first = firstE.start, last = lastE.end;
  // 首条若为跨午夜接续，其 start 属于前一天；据此取正确日期，避免跨度显示出现 end 早于 start
  const firstDate = firstE.carryover ? firstE.carryover.prev_date : DATA.date;
  // 总时长 = 显示的跨度两端（带日期）之真实日历差，与上方跨度一致；
  // 不累加各条 duration（多会话区间重叠会重复计、跨午夜条目 duration 巨大会污染）
  const toMs = (date, time) => Date.parse(`${date}T${time}`);
  const span = toMs(firstDate, first), end = toMs(DATA.date, last);
  const totalSec = (isFinite(span) && isFinite(end) && end >= span) ? Math.round((end - span) / 1000) : 0;
  fo.innerHTML =
    `<div class="f-row">AI 工作日志 · 点击节点看详情 · 点击胶囊切换会话</div>`
    + `<div class="f-row">跨度 <span class="span">${fmtAt(first, firstDate)} → ${fmtAt(last, DATA.date)}</span></div>`
    + `<div class="f-row">共 <span class="span">${fmtDur(totalSec)}</span> · ${ENTRIES.length} 条</div>`
    + verLine + repoLine + copyLine;
}

// 测量吸顶实际高度，写入 --topbar-h，避免右侧/节点滚动时与磨砂玻璃碰撞
function syncTopbar() {
  const h = document.getElementById("topbar").offsetHeight;
  document.documentElement.style.setProperty("--topbar-h", h + "px");
}
