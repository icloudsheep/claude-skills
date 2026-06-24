
// 多 toast 堆叠系统：右上角依序向下排布，进入/退出均有动画，移除后下方自动上移补位。
// opts: { onClick, duration(ms, 0=不自动消失), type('info'|'err'), title }
// 不传 title 时取默认标题；正文与标题分两行展示。
function showToast(msg, opts) {
  opts = opts || {};
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) { wrap = document.createElement("div"); wrap.id = "toast-wrap"; document.body.appendChild(wrap); }
  const t = document.createElement("div");
  t.className = "toast" + (opts.type === "err" ? " err" : "") + (opts.onClick ? " clickable" : "");
  const title = opts.title || (opts.type === "err" ? "出错了" : "提示");
  t.innerHTML = `<div class="t-title">${esc(title)}</div><div class="t-body">${esc(msg)}</div>`;
  wrap.appendChild(t);
  // 强制 reflow 后加 .on 触发进入动画
  void t.offsetWidth;
  requestAnimationFrame(() => t.classList.add("on"));

  const dismiss = () => {
    if (t._dismissed) return; t._dismissed = true;
    clearTimeout(t._timer);
    t.classList.remove("on"); t.classList.add("out");
    // 等高度压扁(补位)这条最长的过渡结束再移除，避免动画被截断
    t.addEventListener("transitionend", (e) => { if (e.propertyName === "max-height") t.remove(); });
    setTimeout(() => t.remove(), 1100);  // 兜底
  };
  if (opts.onClick) t.onclick = () => { opts.onClick(); dismiss(); };
  const dur = opts.duration != null ? opts.duration : 5200;  // 默认时长（已较原 2.6s 翻倍）
  if (dur > 0) t._timer = setTimeout(dismiss, dur);
  return t;
}

// 启动时检查 GitHub 最新 release 是否比本地版本新；有则弹可点击 toast，点击跳转仓库。
// api.github.com 返回 CORS 头 *，file:// 下也可 fetch。获取失败弹错误 toast。
function checkUpdate() {
  const ver = (typeof window.AILOG_VERSION !== "undefined" && window.AILOG_VERSION) || {};
  if (!ver.version) return;
  const repo = ver.repo || "https://github.com/icloudsheep/claude-skills";
  const m = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!m) return;
  fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`,
        { cache: "no-store", headers: { Accept: "application/vnd.github+json" } })
    .then((r) => r.ok ? r.json() : Promise.reject("HTTP " + r.status))
    .then((rel) => {
      const latest = rel.tag_name || "";
      if (latest && latest !== ver.version) {
        showToast(`新版本 ${latest}（当前 ${ver.version}），点击前往更新`,
          { title: "🎉 发现更新", onClick: () => window.open(rel.html_url || repo, "_blank", "noopener"), duration: 0 });
      }
    })
    .catch((e) => {
      showToast(`无法获取远程版本信息（${e}）`, { title: "⚠️ 检查更新失败", type: "err", duration: 8000 });
    });
}

