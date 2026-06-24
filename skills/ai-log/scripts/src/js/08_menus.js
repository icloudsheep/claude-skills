let ACTIVE = null;

// 编辑/删除后整页重渲染：重置选中态与连接线，重新 build，再同步吸顶高度
function rebuildAll() {
  ACTIVE = null;
  document.getElementById("linkpath").classList.remove("on");
  build();
  syncTopbar();
}

// 右键胶囊 → 在鼠标位置动画弹出上下文菜单（含「重命名」「清除自定义名」）
// 通用上下文菜单渲染器。items 元素：{label, act, check} 或 {sep:true}。head 可选（标题行）。
function openMenu(ev, { head, items }) {
  closeChipMenu();
  const menu = document.createElement("div");
  menu.className = "ctxmenu"; menu.id = "ctxmenu";
  const rows = items.map((it, i) => it.sep
    ? `<div class="ctx-sep"></div>`
    : `<div class="ctx-item" data-i="${i}">${it.label}${it.check ? '<span class="ck">✅</span>' : ""}</div>`).join("");
  menu.innerHTML = (head ? `<div class="ctx-head">${head}</div>` : "") + rows;
  document.body.appendChild(menu);
  // 先离屏测量，再夹取到视口内，避免贴边溢出
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = ev.clientX, y = ev.clientY;
  if (x + mw + 8 > innerWidth) x = innerWidth - mw - 8;
  if (y + mh + 8 > innerHeight) y = innerHeight - mh - 8;
  menu.style.left = x + "px"; menu.style.top = y + "px";
  menu.style.transformOrigin = `${ev.clientX - x}px ${ev.clientY - y}px`;
  requestAnimationFrame(() => menu.classList.add("on"));
  menu.querySelectorAll(".ctx-item").forEach((el) => {
    el.onclick = () => { const it = items[+el.dataset.i]; closeChipMenu(); it.act && it.act(); };
  });
}

// 右键胶囊菜单：显隐 / 重命名 / 恢复自动代号
function openChipMenu(ev, s) {
  const hasAlias = !!aliasOf(s.id);
  const items = [
    { label: s.hidden ? "👁️ 显示" : "🙈 隐藏",
      act: () => { const chip = document.querySelector(`.chip[data-sid="${cssEsc(s.id)}"]`); if (chip) toggleSession(s.id, chip); } },
    { label: "✏️ 重命名", act: () => renameSession(s) },
  ];
  if (hasAlias) items.push({ label: "↩️ 恢复自动代号", act: () => { saveLocalAlias(s.id, ""); refreshNames(); if (ACTIVE) drawLink(); showToast("已恢复自动代号", { title: "会话名称" }); console.log(renameCmd(s.id, "")); } });
  openMenu(ev, { head: `<span class="emo">${s.emoji}</span>${esc(autoName(s))}`, items });
}

