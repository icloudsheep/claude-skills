let META = {}, SESSIONS = [], ENTRIES = [];

function build() {
  // 应用本地编辑覆盖层：合并标题/正文改动、剔除已删除条目（seq 保持原值用于定位）
  ENTRIES = (DATA.entries || []).map(effectiveEntry).filter((e) => !e._deleted);

  // 重建前清空容器，使 rebuildAll() 可重复调用（编辑/删除后重渲染）
  document.getElementById("topbar").innerHTML = "";
  document.getElementById("app").innerHTML = "";

  // 会话元信息：列号 + 颜色
  SESSIONS = []; META = {};
  ENTRIES.forEach((e) => {
    if (!META[e.id]) {
      META[e.id] = { id: e.id, emoji: e.emoji, name: e.name, color: PALETTE[SESSIONS.length % PALETTE.length], lane: SESSIONS.length, count: 0, hidden: false };
      SESSIONS.push(META[e.id]);
    }
    META[e.id].count++;
  });

  // 吸顶头部：标题 + 图例胶囊
  const topbar = document.getElementById("topbar");
  const head = document.createElement("div");
  head.innerHTML = `<h1><span class="cal">🗓️</span> AI 工作日志 · ${esc(DATA.date)}</h1>
    <div class="sub">${SESSIONS.length} 个会话 · ${ENTRIES.length} 条记录 · 点击胶囊切换该会话显示</div>`;
  const legend = document.createElement("div");
  legend.className = "legend";
  SESSIONS.forEach((s) => {
    const c = document.createElement("div");
    c.className = "chip"; c.style.setProperty("--c", s.color); c.dataset.sid = s.id;
    c.innerHTML = `<span class="dot"></span><span class="emo">${s.emoji}</span><span class="chip-name">${displayNameHtml(s)}</span> <span class="cnt">×${s.count}</span>`;
    c.onclick = () => toggleSession(s.id, c);
    c.oncontextmenu = (ev) => { ev.preventDefault(); openChipMenu(ev, s); };
    c.title = "左键切换显隐 · 右键自定义名称";
    legend.appendChild(c);
  });
  head.appendChild(legend);
  topbar.appendChild(head);

  // 左侧泳道容器
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  // 左侧滚动视口
  const left = document.createElement("div");
  left.className = "left"; left.id = "lane";
  // 内部舞台（承载 svg + 节点，按全部内容高度撑开，在视口内滚动）
  const stage = document.createElement("div");
  stage.className = "stage"; stage.id = "stage";
  const stageW = LANE_X0 + SESSIONS.length * LANE_GAP + 24;
  const stageH = rowY(ENTRIES.length - 1) + TOP + 30;
  stage.style.width = stageW + "px";
  stage.style.height = stageH + "px";
  left.style.width = (stageW + 14) + "px";  // 14px 预留滚动条

  // 泳道竖线（同会话首末节点连线）
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "rails");
  SESSIONS.forEach((s) => {
    const idx = ENTRIES.map((e, k) => e.id === s.id ? k : -1).filter((k) => k >= 0);
    const y1 = rowY(idx[0]), y2 = rowY(idx[idx.length - 1]), x = laneX(s.lane);
    // 延伸线：贯穿整列高度（0 → 底部），半宽 + 半透明，置于主线之下作淡淡的延伸
    const ext = document.createElementNS(ns, "line");
    ext.setAttribute("x1", x); ext.setAttribute("x2", x); ext.setAttribute("y1", 0); ext.setAttribute("y2", stageH);
    ext.setAttribute("stroke", s.color); ext.setAttribute("class", "rail-ext");
    ext.dataset.sid = s.id;
    svg.appendChild(ext);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("y1", y1); line.setAttribute("y2", y2);
    line.setAttribute("stroke", s.color); line.setAttribute("class", "rail");
    line.dataset.sid = s.id;  // 用于 toggleSession 隐藏/显示
    line.style.setProperty("--len", Math.max(y2 - y1, 1));
    svg.appendChild(line);
  });
  stage.appendChild(svg);

  // 节点
  ENTRIES.forEach((e, i) => {
    const s = META[e.id], y = rowY(i);
    const n = document.createElement("div");
    n.className = "node"; n.style.left = laneX(s.lane) + "px"; n.style.top = y + "px";
    n.style.setProperty("--c", s.color); n.style.animationDelay = (500 + i * 110) + "ms";
    const moon = e.carryover ? `<span class="moon" title="接续自 ${esc(e.carryover.prev_date)}">🌙</span>` : "";
    const rocket = e.mode === "full" ? `<span class="rocket" title="按主题总结（full 模式）">🚀</span>` : "";
    n.innerHTML = `<div class="knob">${e.emoji}<span class="num">${e.seq != null ? e.seq : i + 1}</span>${moon}${rocket}</div>`;
    n.dataset.i = i; n.dataset.sid = e.id;  // 会话 ID 用于 toggle
    n.dataset.seq = e.seq != null ? e.seq : i + 1;  // 当天序号：删除重排时定位节点的稳定键
    n.dataset.tip = e.title ? e.title : autoName(s);  // 悬停气泡文案：标题，无则会话名
    // index 在删除重排时会变，故点击/右键时实时读 dataset.i（而非闭包捕获旧值）
    n.onclick = () => select(+n.dataset.i, n);
    n.addEventListener("mouseenter", () => scheduleNodeTip(n));
    n.addEventListener("mouseleave", cancelNodeTip);
    n.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); openNodeMenu(ev, +n.dataset.i, n); };
    stage.appendChild(n);
  });
  left.appendChild(stage);

  // 右侧容器（初始空）
  const right = document.createElement("div");
  right.className = "right";
  right.innerHTML = '<div class="box empty">👈 点击左侧任一节点查看该条日志详情</div>';
  right.id = "detailwrap";

  wrap.appendChild(left); wrap.appendChild(right);
  document.getElementById("app").appendChild(wrap);

  // 泳道滚动时重绘连接线
  left.addEventListener("scroll", () => { scheduleDrawLink(); cancelNodeTip(); }, { passive: true });

  // 页脚：标注时间跨度
  renderFooter();
}

