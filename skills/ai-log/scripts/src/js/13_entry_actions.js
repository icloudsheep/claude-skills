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
  // 原地更新（零重建）：编辑只改当前条的标题/正文，节点数量与位置不变——
  // 故无需 rebuildAll() 推倒重建，只刷新「内存条目 + 当前详情面板 + 该节点气泡」三处即可，
  // 详情面板不关闭、节点不重放入场动画、连接线不抖动，体验连续。
  applyEditInPlace(e, patch);
  showToast("已保存修改（本地即时生效）", { title: "编辑" });
}

// 把一条编辑就地反映到 UI：内存 ENTRIES、当前详情面板标题/正文、对应节点的悬停气泡。
function applyEditInPlace(e, patch) {
  // 1) 同步内存条目（select 直接读 ENTRIES[i].title/summary，不更新会导致再次打开显示旧值）
  const idx = ENTRIES.findIndex((x) => x === e || (x.id === e.id && x.seq === e.seq));
  const ent = idx >= 0 ? ENTRIES[idx] : null;
  if (ent) {
    if ("title" in patch) ent.title = patch.title;
    if ("summary" in patch) ent.summary = patch.summary;
  }
  // 2) 若当前详情面板正展示这一条，原地刷新标题与正文
  if (ent && ACTIVE && +ACTIVE.dataset.i === idx) {
    const wrap = document.getElementById("detailwrap");
    if ("title" in patch) {
      const titleEl = wrap.querySelector(".d-title");
      if (titleEl) titleEl.textContent = patch.title ? patch.title : autoName(META[ent.id]);
    }
    if ("summary" in patch) {
      const sumEl = wrap.querySelector(".d-sum");
      if (sumEl) {
        sumEl.innerHTML = renderMd(ent.summary);
        renderMermaid(sumEl);
        renderMath(sumEl);
      }
    }
  }
  // 3) 更新该节点的悬停气泡文案（标题变了，tip 跟着变）
  if (ent && "title" in patch) {
    const node = document.querySelector(`#stage .node[data-seq="${ent.seq}"]`);
    if (node) node.dataset.tip = patch.title ? patch.title : autoName(META[ent.id]);
  }
}

// 删除条目：二次确认 → 写覆盖层 deleted 标记，平滑移除节点（局部更新，非整页重建）。
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
  removeEntryInPlace(e);
  showToast("已删除（本地即时生效）", { title: "删除" });
}

// 平滑删除一条：被删节点淡出，其后所有节点上移补位，泳道线/stage 高度/胶囊计数/页脚随之更新。
// 复杂边界（删空、某会话被删光需移除胶囊列）回退 rebuildAll() 兜底，保证一致性优先于动画。
function removeEntryInPlace(e) {
  const idx = ENTRIES.findIndex((x) => x === e || (x.id === e.id && x.seq === e.seq));
  if (idx < 0) { rebuildAll(); return; }
  const victim = ENTRIES[idx];
  const sess = META[victim.id];
  ENTRIES.splice(idx, 1);
  // 边界回退：全删空、或被删条所属会话已无任何条目（需移除其胶囊与泳道列）
  const sessionEmptied = !ENTRIES.some((x) => x.id === victim.id);
  if (!ENTRIES.length || sessionEmptied) { rebuildAll(); return; }
  if (sess) sess.count -= 1;

  const stage = document.getElementById("stage");
  const node = stage && stage.querySelector(`.node[data-seq="${victim.seq}"]`);
  const finish = () => {
    if (node) node.remove();
    repositionNodesAfterDelete();
  };
  if (node) {
    // 被删节点淡出缩小，过渡结束后移除并重排其余节点
    node.style.transition = "opacity .28s ease, transform .28s ease";
    node.style.opacity = "0";
    node.style.transform = "translate(-50%, -50%) scale(.4)";
    let done = false;
    const onEnd = () => { if (done) return; done = true; node.removeEventListener("transitionend", onEnd); finish(); };
    node.addEventListener("transitionend", onEnd);
    setTimeout(onEnd, 360);  // 兜底
  } else {
    finish();
  }
  // 胶囊计数与页脚即时更新（不等动画）
  refreshChipCounts();
  renderFooter();
}

// 删除后：剩余节点按新顺序平移到正确行、更新 data-i/序号徽章，泳道线与 stage 高度收缩。
function repositionNodesAfterDelete() {
  const stage = document.getElementById("stage"), lane0 = document.getElementById("lane");
  if (!stage) return;
  const nodes = Array.from(stage.querySelectorAll(".node"));
  // 按当前 top 排序即为视觉顺序；与 ENTRIES 一一对应重新编号
  nodes.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
  nodes.forEach((n, i) => {
    n.style.transition = "top .42s cubic-bezier(.2,.8,.2,1)";
    n.style.top = rowY(i) + "px";
    n.dataset.i = i;
  });
  // 泳道竖线：每会话首末节点 y 重算
  const ns = "http://www.w3.org/2000/svg";
  const stageH = rowY(ENTRIES.length - 1) + TOP + 30;
  SESSIONS.forEach((s) => {
    const idxs = ENTRIES.map((en, k) => en.id === s.id ? k : -1).filter((k) => k >= 0);
    if (!idxs.length) return;
    const y1 = rowY(idxs[0]), y2 = rowY(idxs[idxs.length - 1]);
    stage.querySelectorAll(`.rail[data-sid="${cssEsc(s.id)}"]`).forEach((line) => {
      line.style.transition = "all .42s cubic-bezier(.2,.8,.2,1)";
      line.setAttribute("y1", y1); line.setAttribute("y2", y2);
      line.style.setProperty("--len", Math.max(y2 - y1, 1));
    });
    stage.querySelectorAll(`.rail-ext[data-sid="${cssEsc(s.id)}"]`).forEach((ext) => {
      ext.setAttribute("y2", stageH);
    });
  });
  stage.style.transition = "height .42s cubic-bezier(.2,.8,.2,1)";
  stage.style.height = stageH + "px";
}

// 删除/计数变化后刷新胶囊上的「×N」计数（不重建胶囊本身）
function refreshChipCounts() {
  document.querySelectorAll(".chip").forEach((c) => {
    const s = META[c.dataset.sid]; if (!s) return;
    const cnt = c.querySelector(".cnt");
    if (cnt) cnt.textContent = "×" + s.count;
  });
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
