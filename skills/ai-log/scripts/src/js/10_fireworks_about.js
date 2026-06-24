// Canvas 烟花特效：在给定 canvas 上循环升空+爆炸的粒子动画，返回 {stop}
function startFireworks(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  let raf = 0, running = true, W = 0, H = 0, last = 0, spawnAcc = 0;
  const rockets = [], sparks = [];
  const COLORS = ["#ff9eb3", "#ffd17a", "#9ee6c4", "#8ec5ff", "#c5a3ff", "#ff9ed6", "#7ee787"];
  const rand = (a, b) => a + Math.random() * (b - a);
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  function launch() {
    rockets.push({ x: rand(W * .2, W * .8), y: H, vx: rand(-.4, .4), vy: rand(-7.5, -6), color: COLORS[(Math.random() * COLORS.length) | 0], ty: rand(H * .12, H * .5) });
  }
  function burst(x, y, color) {
    const n = 26 + (Math.random() * 18 | 0);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n, sp = rand(1.2, 3.6);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, size: rand(1.4, 2.6) });
    }
  }
  function frame(t) {
    if (!running) return;
    // 速率降为 30%：把有效时间步整体乘 0.3，所有位移/重力/衰减/生成节奏同步放慢
    const dt = (Math.min((t - last) || 16, 40) / 16) * 0.3; last = t;
    ctx.clearRect(0, 0, W, H);
    spawnAcc += dt;
    if (spawnAcc > 26 && rockets.length < 5) { launch(); spawnAcc = 0; }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.x += r.vx * dt; r.y += r.vy * dt; r.vy += .06 * dt;
      ctx.globalAlpha = 1; ctx.fillStyle = r.color;
      ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, 7); ctx.fill();
      if (r.vy >= -1 || r.y <= r.ty) { burst(r.x, r.y, r.color); rockets.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += .04 * dt; s.vx *= .985; s.life -= .012 * dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  launch();
  raf = requestAnimationFrame(frame);
  return { stop() { running = false; cancelAnimationFrame(raf); ro.disconnect(); } };
}

// 关于弹窗：版本 / GitHub 链接 / 本地版本日志 + （有新版时）新版日志与更新提示 + 烟花背景
function showAbout() {
  const ver = (typeof window.AILOG_VERSION !== "undefined" && window.AILOG_VERSION) || {};
  const repo = ver.repo || "https://github.com/icloudsheep/claude-skills";
  const local = ver.version || "";
  // 由 repo 推导 releases API
  const m = repo.match(/github\.com\/([^/]+)\/([^/]+)/);
  const apiBase = m ? `https://api.github.com/repos/${m[1]}/${m[2]}/releases` : null;
  const H = { Accept: "application/vnd.github+json" };

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal about" role="dialog" aria-modal="true">
      <canvas class="fireworks"></canvas>
      <div class="about-body">
        <div class="about-banner" id="about-banner" hidden></div>
        <div class="modal-title">AI 工作日志</div>
        <div class="about-ver">版本 <b>${esc(local || "未知")}</b></div>
        <a class="about-repo" href="${esc(repo)}" target="_blank" rel="noopener">${esc(repo.replace(/^https?:\/\//, ""))}</a>
        <div class="about-log-label">版本日志</div>
        <div class="acc" id="about-acc">
          <div class="acc-item" data-key="local">
            <div class="acc-head"><span class="acc-arrow">▸</span><span class="acc-title">当前版本 ${esc(local || "未知")}</span></div>
            <div class="acc-body"><div class="about-log md" id="about-log-local">正在从 GitHub 获取…</div></div>
          </div>
          <div class="acc-item" id="about-acc-latest" hidden data-key="latest">
            <div class="acc-head"><span class="acc-arrow">▸</span><span class="acc-title about-new-label">🎉 新版本</span></div>
            <div class="acc-body"><div class="about-log md" id="about-log-latest"></div></div>
          </div>
        </div>
        <div class="about-copy">Copyright © 2026 UniEver Studio. All rights reserved.</div>
        <div class="modal-actions">
          <button class="modal-btn ok">关闭</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  lockScroll();
  requestAnimationFrame(() => overlay.classList.add("on"));

  const fw = startFireworks(overlay.querySelector(".fireworks"));
  let done = false;
  const close = () => {
    if (done) return; done = true;
    fw && fw.stop();
    overlay.classList.remove("on");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => { overlay.remove(); unlockScroll(); }, 300);
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  overlay.querySelector(".ok").onclick = close;
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  // 手风琴：max-height 设为真实内容高度（封顶 60vh），展开/收缩走同一段距离、速度对称。
  const CAP = () => Math.round(window.innerHeight * 0.6);
  function setAccItem(item, open) {
    const body = item.querySelector(".acc-body");
    if (open) {
      item.classList.add("open");
      const target = Math.min(body.scrollHeight, CAP());
      body.style.maxHeight = target + "px";
      // 展开动画结束后放开滚动 + 解除 max-height 限制以适应后续内容变化
      const onEnd = (e) => {
        if (e.propertyName !== "max-height") return;
        body.removeEventListener("transitionend", onEnd);
        if (item.classList.contains("open")) {
          body.classList.toggle("scrollable", body.scrollHeight > CAP());
          if (body.scrollHeight <= CAP()) body.style.maxHeight = "none";
        }
      };
      body.addEventListener("transitionend", onEnd);
    } else {
      // 收缩：先把 auto/none 固定成当前像素高度，再下一帧过渡到 0，保证有动画起点
      body.classList.remove("scrollable");
      body.style.maxHeight = body.getBoundingClientRect().height + "px";
      void body.offsetHeight;
      requestAnimationFrame(() => { item.classList.remove("open"); body.style.maxHeight = "0px"; });
    }
  }
  function openOnly(item) {
    overlay.querySelectorAll(".acc-item").forEach((it) => { if (it !== item) setAccItem(it, false); });
    setAccItem(item, true);
  }
  overlay.querySelectorAll(".acc-head").forEach((h) => {
    h.onclick = () => {
      const item = h.parentElement;
      if (item.classList.contains("open")) setAccItem(item, false);
      else openOnly(item);
    };
  });
  // 初始：默认展开「当前版本」项（内容到位后再设高度）
  requestAnimationFrame(() => { const init = overlay.querySelector('.acc-item[data-key="local"]'); if (init) setAccItem(init, true); });

  const localEl = overlay.querySelector("#about-log-local");
  const renderRel = (rel) => {
    const body = (rel.body || "").trim();
    const tag = rel.tag_name ? `<div class="about-tag">${esc(rel.name || rel.tag_name)}</div>` : "";
    return tag + (body ? renderMd(body) : "（该 release 暂无版本日志）");
  };
  if (!apiBase) { localEl.textContent = "无法解析仓库地址。"; return; }
  // 内容异步到位后，若该项已展开则重算高度（max-height 跟上新内容）
  const refreshAcc = (item) => {
    if (!item.classList.contains("open")) return;
    const body = item.querySelector(".acc-body");
    const target = Math.min(body.scrollHeight, CAP());
    body.classList.toggle("scrollable", body.scrollHeight > CAP());
    body.style.maxHeight = body.scrollHeight > CAP() ? target + "px" : "none";
  };

  // 1) 本地版本对应 tag 的日志
  fetch(`${apiBase}/tags/${encodeURIComponent(local)}`, { cache: "no-store", headers: H })
    .then((r) => r.ok ? r.json() : Promise.reject("HTTP " + r.status))
    .then((rel) => { localEl.innerHTML = renderRel(rel); })
    .catch((e) => { localEl.innerHTML = `<span class="about-err">未找到本地版本 ${esc(local)} 的 release（${esc(String(e))}）</span>`; })
    .finally(() => refreshAcc(overlay.querySelector('.acc-item[data-key="local"]')));

  // 2) 最新版日志 + 更新提示：与本地比对，有新版才显示新版区与顶部提示条
  fetch(`${apiBase}/latest`, { cache: "no-store", headers: H })
    .then((r) => r.ok ? r.json() : Promise.reject("HTTP " + r.status))
    .then((rel) => {
      const latest = rel.tag_name || "";
      if (latest && latest !== local) {
        const banner = overlay.querySelector("#about-banner");
        banner.hidden = false;
        banner.innerHTML = `发现新版本 <b>${esc(latest)}</b>（当前 ${esc(local)}），点击前往更新 →`;
        banner.onclick = () => window.open(rel.html_url || repo, "_blank", "noopener");
        // 显示新版手风琴项并默认展开它（收起当前版本），把更要紧的新版日志推到眼前
        const latestItem = overlay.querySelector("#about-acc-latest");
        latestItem.hidden = false;
        latestItem.querySelector(".acc-title").textContent = "🎉 新版本 " + latest;
        overlay.querySelector("#about-log-latest").innerHTML = renderRel(rel);
        openOnly(latestItem);
      }
    })
    .catch(() => {});
}
// 整页右键弹页面菜单；胶囊上的右键由 chip 自身的 oncontextmenu 处理（stopPropagation 区分）
