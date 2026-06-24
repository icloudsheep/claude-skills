
window.addEventListener("scroll", () => { scheduleDrawLink(); cancelNodeTip(); }, { passive: true });
window.addEventListener("resize", () => { syncTopbar(); scheduleDrawLink(); });

applyTheme();
build();
syncTopbar();
checkUpdate();
