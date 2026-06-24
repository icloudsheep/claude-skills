let _scrollLocks = 0, _savedPadRight = "";
function lockScroll() {
  if (_scrollLocks++ === 0) {
    // 只冻结文档滚动容器（标准模式下为 documentElement/html）的 overflow。
    // 关键：不要给 body 设 overflow:hidden——body 是 min-height:100vh 的 flex 容器，
    // 给它设 overflow 会生成新的 BFC，使 position:sticky 的吸顶头部失去滚动上下文而“消失”。
    // 仅锁 html 既能冻结背景滚动、又保持 topbar 原地吸顶可见。
    const sbw = window.innerWidth - document.documentElement.clientWidth;  // 滚动条宽度
    _savedPadRight = document.documentElement.style.paddingRight;
    if (sbw > 0) document.documentElement.style.paddingRight = sbw + "px";
    document.documentElement.style.overflow = "hidden";
  }
}
function unlockScroll() {
  if (_scrollLocks > 0 && --_scrollLocks === 0) {
    document.documentElement.style.overflow = "";
    document.documentElement.style.paddingRight = _savedPadRight;
  }
}

// 自定义居中模态输入框：背景黑化遮罩 + 磨砂半透明卡片 + 动画展开。
// 返回 Promise<string|null>：确定 → 输入值（已 trim）；取消 / 关闭 → null。
function promptModal({ title, desc, value = "", placeholder = "", okText = "确定", cancelText = "取消" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${title}</div>
        ${desc ? `<div class="modal-desc">${desc}</div>` : ""}
        <input class="modal-input" type="text" placeholder="${esc(placeholder)}" />
        <div class="modal-actions">
          <button class="modal-btn cancel">${esc(cancelText)}</button>
          <button class="modal-btn ok">${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    lockScroll();
    const input = overlay.querySelector(".modal-input");
    input.value = value;
    requestAnimationFrame(() => overlay.classList.add("on"));
    setTimeout(() => { input.focus(); input.select(); }, 60);

    let done = false;
    const close = (val) => {
      if (done) return; done = true;
      overlay.classList.remove("on");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => { overlay.remove(); unlockScroll(); }, 260);   // 等退出动画
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "Enter") { e.preventDefault(); close(input.value.trim()); }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.querySelector(".ok").onclick = () => close(input.value.trim());
    overlay.querySelector(".cancel").onclick = () => close(null);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
  });
}

// 可复制的 --rename 命令（便于永久固化到 aliases.js）
const renameCmd = (id, alias) => `python3 <skill>/scripts/ai_logger.py --rename "${id}" "${alias}"`;

// 条目编辑模态：标题（单行文本）+ 正文（markdown 源码多行框）。
// 返回 Promise<{title, summary}|null>：确定 → 改后的值；取消 / 关闭 → null。
function editModal({ title = "", summary = "" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal edit" role="dialog" aria-modal="true">
        <div class="modal-title">编辑日志</div>
        <div class="modal-desc">正文为 <b>Markdown 源码</b>（支持 mermaid 代码块与 $LaTeX$ 公式）· ⌘/Ctrl+Enter 保存</div>
        <label class="edit-label">标题</label>
        <input class="modal-input edit-title" type="text" placeholder="日志标题（留空则显示会话名）" />
        <label class="edit-label">正文（Markdown）</label>
        <textarea class="modal-input edit-body" spellcheck="false" placeholder="在此编辑 Markdown 源码…"></textarea>
        <div class="modal-actions">
          <button class="modal-btn cancel">取消</button>
          <button class="modal-btn ok">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    lockScroll();
    const tEl = overlay.querySelector(".edit-title"), bEl = overlay.querySelector(".edit-body");
    tEl.value = title; bEl.value = summary;
    requestAnimationFrame(() => overlay.classList.add("on"));
    setTimeout(() => { bEl.focus(); }, 60);

    let done = false;
    const close = (val) => {
      if (done) return; done = true;
      overlay.classList.remove("on");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => { overlay.remove(); unlockScroll(); }, 260);
      resolve(val);
    };
    const submit = () => close({ title: tEl.value.trim(), summary: bEl.value });
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.querySelector(".ok").onclick = submit;
    overlay.querySelector(".cancel").onclick = () => close(null);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(null); });
  });
}

// 编辑条目：弹源码编辑框 → 写 localStorage 覆盖层即时生效，控制台打印落盘命令。
// 只把「与原值不同」的字段写入覆盖层，保持 patch 最小。
