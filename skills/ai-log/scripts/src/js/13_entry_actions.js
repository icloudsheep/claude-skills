async function editEntry(e) {
  const cur = effectiveEntry(e);
  const res = await editModal({ title: cur.title || "", summary: cur.summary || "" });
  if (res === null) return;
  const patch = {}, cmdFields = {};
  if (res.title !== (e.title || "")) { patch.title = res.title; cmdFields.title = res.title; }
  if (res.summary !== (e.summary || "")) { patch.summary = res.summary; cmdFields.summary = res.summary; }
  if (!Object.keys(patch).length) { showToast("内容未变更", { title: "编辑" }); return; }
  saveEdit(entryKey(e), patch);
  console.log(
    `已即时生效（本地）。如需永久写回 data.json（换设备/清缓存仍在），可运行：\n  ${editCmd(e, cmdFields)}`
  );
  rebuildAll();
  showToast("已保存修改（本地即时生效）", { title: "编辑" });
}

// 删除条目：二次确认 → 写覆盖层 deleted 标记即时隐藏，控制台打印落盘命令。
async function deleteEntry(e) {
  const ok = await confirmModal({
    title: "删除这条日志？",
    desc: `<b>${esc(effectiveEntry(e).title || autoName(META[e.id]))}</b><br>本地删除即时生效（可清除 localStorage 恢复）。永久删除需运行控制台打印的命令。`,
    okText: "删除", danger: true,
  });
  if (!ok) return;
  saveEdit(entryKey(e), { deleted: true });
  console.log(`已本地删除。如需永久从 data.json 移除（换设备/清缓存仍生效），可运行：\n  ${deleteCmd(e)}`);
  closeDetail();
  rebuildAll();
  showToast("已删除（本地即时生效）", { title: "删除" });
}

// 节点右键菜单：预览 / 编辑 / 删除。i 为条目索引，node 为节点元素。
function openNodeMenu(ev, i, node) {
  cancelNodeTip();
  const e = ENTRIES[i], s = META[e.id];
  const head = `<span class="emo">${e.emoji}</span>${esc(effectiveEntry(e).title || autoName(s))}`;
  openMenu(ev, { head, items: [
    { label: "👁️ 预览", act: () => previewEntry(e) },
    { label: "✏️ 编辑", act: () => editEntry(e) },
    { sep: true },
    { label: "🗑️ 删除", act: () => deleteEntry(e) },
  ] });
}

// 预览：复用编辑模态的外壳尺寸，但只读——渲染 markdown / mermaid / 公式，无输入框与保存。
function previewEntry(e) {
  const cur = effectiveEntry(e), s = META[e.id];
  const title = cur.title || autoName(s);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal edit preview" role="dialog" aria-modal="true">
      <div class="modal-title">${esc(title)}</div>
      <div class="preview-body md"></div>
      <div class="modal-actions">
        <button class="modal-btn ok">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  lockScroll();
  const bodyEl = overlay.querySelector(".preview-body");
  bodyEl.innerHTML = renderMd(cur.summary || "");
  renderMermaid(bodyEl);   // 渲染预览里的 mermaid 图
  renderMath(bodyEl);      // 渲染预览里的 LaTeX 公式
  requestAnimationFrame(() => overlay.classList.add("on"));

  let done = false;
  const close = () => {
    if (done) return; done = true;
    overlay.classList.remove("on");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => { overlay.remove(); unlockScroll(); }, 260);
  };
  const onKey = (ev2) => { if (ev2.key === "Escape") { ev2.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey, true);
  overlay.querySelector(".ok").onclick = close;
  overlay.addEventListener("mousedown", (ev2) => { if (ev2.target === overlay) close(); });
}

// 二次确认模态（复用 modal 样式）：返回 Promise<boolean>。danger=true 时确定键为红色。
function confirmModal({ title, desc, okText = "确定", cancelText = "取消", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${esc(title)}</div>
        ${desc ? `<div class="modal-desc">${desc}</div>` : ""}
        <div class="modal-actions">
          <button class="modal-btn cancel">${esc(cancelText)}</button>
          <button class="modal-btn ok${danger ? " danger" : ""}">${esc(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    lockScroll();
    requestAnimationFrame(() => overlay.classList.add("on"));
    let done = false;
    const close = (val) => {
      if (done) return; done = true;
      overlay.classList.remove("on");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => { overlay.remove(); unlockScroll(); }, 260);
      resolve(val);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); close(false); }
      else if (ev.key === "Enter") { ev.preventDefault(); close(true); }
    };
    document.addEventListener("keydown", onKey, true);
    overlay.querySelector(".ok").onclick = () => close(true);
    overlay.querySelector(".cancel").onclick = () => close(false);
    overlay.addEventListener("mousedown", (ev) => { if (ev.target === overlay) close(false); });
  });
}

// 重命名：自定义模态输入 → 写 localStorage 即时生效（跨所有日期同源共享），
// 并在控制台打印 --rename 命令用于永久固化（换设备/清缓存仍保留）。
async function renameSession(s) {
  const cur = aliasOf(s.id) || "";
  const input = await promptModal({
    title: "自定义会话名称",
    desc: `会话 <b>${esc(autoName(s))}</b> · 留空则恢复自动代号`,
    value: cur,
    placeholder: "输入易记的名称，如「重构专项」",
  });
  if (input === null) return;            // 取消
  const alias = input.trim();
  saveLocalAlias(s.id, alias);
  refreshNames();                        // 即时刷新所有展示位
  if (ACTIVE) drawLink();
  console.log(
    alias
      ? `已即时生效。如需永久保存（换设备/清缓存后仍在），可运行：\n  ${renameCmd(s.id, alias)}`
      : `已清除自定义名。永久清除可运行：\n  ${renameCmd(s.id, "")}`
  );
  showToast(alias ? `已重命名为「${alias}」（本地即时生效）` : "已恢复自动代号", { title: "会话名称" });
}

// 别名变更后，原地刷新所有「会话名展示位」：胶囊 + 当前详情面板
function refreshNames() {
  document.querySelectorAll(".chip").forEach((c) => {
    const s = META[c.dataset.sid]; if (!s) return;
    const span = c.querySelector(".chip-name");
    if (span) span.innerHTML = displayNameHtml(s);
  });
  document.querySelectorAll(".d-who").forEach((el) => {
    const s = META[el.dataset.sid]; if (s) el.innerHTML = displayNameHtml(s);
  });
}
