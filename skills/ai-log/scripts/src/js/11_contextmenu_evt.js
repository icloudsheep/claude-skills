document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".chip")) return;  // 胶囊交给 openChipMenu
  if (e.target.closest("#stage .node")) return;  // 节点交给 openNodeMenu
  e.preventDefault();
  openPageMenu(e);
});

function closeChipMenu() {
  const m = document.getElementById("ctxmenu");
  if (m) m.remove();
}
// 关闭菜单：任意点击 / Esc / 滚动
document.addEventListener("click", (e) => { if (!e.target.closest(".ctxmenu")) closeChipMenu(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChipMenu(); });
window.addEventListener("scroll", closeChipMenu, { passive: true });

// 模态打开期间锁定背景上下滚动（引用计数，支持多层模态叠加）。
// 锁定时给 body 补一段 padding 抵消滚动条消失带来的横向跳动。解锁还原。
// overflow 同时压到 html 与 body：本页 body 为 flex 列布局、视口滚动条多挂在 html 上，
// 只锁 body 不一定生效，两者都锁才稳。
