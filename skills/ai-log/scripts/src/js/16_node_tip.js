
// 节点悬停气泡：单例 body 级元素，按节点屏幕位置摆在其正上方（夹取进视口避免溢出）。
// 悬停需停留 ~0.5s 才弹出（防止划过时频繁闪现）；移出或滚动立即取消并隐藏。
let _nodeTipEl = null, _nodeTipTimer = 0;
function scheduleNodeTip(node) {
  clearTimeout(_nodeTipTimer);
  _nodeTipTimer = setTimeout(() => showNodeTip(node), 500);
}
function cancelNodeTip() {
  clearTimeout(_nodeTipTimer);
  hideNodeTip();
}
function showNodeTip(node) {
  const text = node.dataset.tip || "";
  if (!text) return;
  if (!_nodeTipEl) {
    _nodeTipEl = document.createElement("div");
    _nodeTipEl.className = "node-tip";
    document.body.appendChild(_nodeTipEl);
  }
  const tip = _nodeTipEl;
  tip.textContent = text;
  const r = node.getBoundingClientRect();
  // 先显示以便测量自身尺寸，再夹取定位
  tip.style.left = "0px"; tip.style.top = "0px";
  tip.classList.add("on");
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 10;                       // 默认置于节点上方
  if (y < 6) y = r.bottom + 10;                  // 顶部空间不足则翻到下方
  x = Math.max(6, Math.min(x, window.innerWidth - tw - 6));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideNodeTip() {
  if (_nodeTipEl) _nodeTipEl.classList.remove("on");
}
