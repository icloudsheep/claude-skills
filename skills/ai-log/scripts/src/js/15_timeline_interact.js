// 点击胶囊 → 切换该会话；隐藏后压缩其列、整体左移、左栏变窄（日志框随之变宽）
function toggleSession(id, chip) {
  const s = META[id]; s.hidden = !s.hidden;
  chip.classList.toggle("off", s.hidden);
  if (s.hidden && ACTIVE && ACTIVE.dataset.sid === id) closeDetail();
  relayout();
}

// 仅对可见会话重排列号，节点/泳道线随之平移，左栏宽度收缩
function relayout() {
  let lane = 0;
  SESSIONS.forEach((s) => { s.lane = s.hidden ? -1 : lane++; });
  const visN = lane;

  document.querySelectorAll(".node").forEach((n) => {
    const s = META[n.dataset.sid];
    n.style.display = s.hidden ? "none" : "";
    if (!s.hidden) n.style.left = laneX(s.lane) + "px";
  });
  document.querySelectorAll(".rail, .rail-ext").forEach((r) => {
    const s = META[r.dataset.sid];
    r.style.display = s.hidden ? "none" : "";
    if (!s.hidden) { const x = laneX(s.lane); r.setAttribute("x1", x); r.setAttribute("x2", x); }
  });
  const stageW = LANE_X0 + Math.max(visN, 1) * LANE_GAP + 24;
  const stage = document.getElementById("stage"), lane0 = document.getElementById("lane");
  stage.style.transition = lane0.style.transition = "width .9s cubic-bezier(.2,.8,.2,1)";
  stage.style.width = stageW + "px";
  lane0.style.width = (stageW + 14) + "px";
  trackLink(1000);  // 列收缩平移动画(.9s)期间持续重算连线
}

function closeDetail() {
  document.querySelectorAll(".node.active").forEach((n) => n.classList.remove("active"));
  ACTIVE = null;
  document.getElementById("detailwrap").innerHTML = '<div class="box empty">👈 点击左侧任一节点查看该条日志详情</div>';
  document.getElementById("linkpath").classList.remove("on");
}

function select(i, node) {
  if (ACTIVE === node) { closeDetail(); return; }
  const e = ENTRIES[i], s = META[e.id], tail = e.id.split("-")[1] || "";
  document.querySelectorAll(".node.active").forEach((n) => n.classList.remove("active"));
  node.classList.add("active"); ACTIVE = node;

  const f = (k, v, cls) => v ? `<div class="f ${cls||""}"><div class="k">${k}</div><div class="v ${cls||""}">${esc(v)}</div></div>` : "";
  const box = (title, inner, d) => `<div class="box" style="--c:${s.color}; animation-delay:${d}ms">
    ${title ? `<div class="bt">${title}</div>` : ""}${inner}</div>`;

  // 跨午夜接续标注：本会话前一部分在上一日
  const co = e.carryover;
  const carryNote = co
    ? `<div class="carry">🌙 接续自 <b>${esc(co.prev_date)}</b>（本会话前一部分在上一日，止于 ${esc(co.prev_end)}）</div>`
    : "";

  // 首框：标题单独拎出置顶（无标题时回退为会话名），其下会话头 + 跨日标注
  const titleText = e.title ? esc(e.title) : autoName(s);
  const headInner =
    `<div class="d-actions"><button class="d-act" data-act="edit" title="编辑标题与正文">✏️ 编辑</button>`
    + `<button class="d-act danger" data-act="delete" title="删除本条日志">🗑️ 删除</button></div>`
    + `<div class="d-title">${titleText}</div>`
    + `<div class="d-head"><span class="d-emo">${e.emoji}</span><span class="d-who" data-sid="${esc(s.id)}">${displayNameHtml(s)}</span><span class="d-seq">#${e.seq != null ? e.seq : i + 1}</span></div>`
    + carryNote;

  // token / 轮数卡片（分段增量；transcript 不可用时该字段缺失，整框省略）
  const u = e.usage;
  const tokenBox = u
    ? box("📊 本段消耗", `<div class="metrics">`
        + f("输入 tokens", fmtTok(u.input))
        + f("输出 tokens", fmtTok(u.output))
        + f("缓存读取", fmtTok(u.cache_read))
        + (u.cache_write ? f("缓存写入", fmtTok(u.cache_write)) : "")
        + f("对话轮数", u.turns != null ? String(u.turns) : "")
        + f("API 调用", u.api_calls != null ? String(u.api_calls) : "")
        + `</div>`, 360)
    : "";

  // 拆成多个磨砂玻璃框，纵向堆叠（首框：标题置顶 + 会话头 + 跨日标注）
  const html =
    box("", headInner, 0)
    + box("📝 日志内容", `<div class="sumbox"><div class="d-sum md">${renderMd(e.summary)}</div></div>`, 120)
    + box("⏱ 时间", `<div class="metrics">${f("起", fmtAt(e.start, e.carryover ? e.carryover.prev_date : DATA.date), "wide")}${f("止", fmtAt(e.end, DATA.date), "wide")}${f("时长", fmtDur(e.duration))}</div>`, 240)
    + tokenBox
    + box("🌿 Git 分支", e.branch ? `<div class="v mono">${esc(e.branch)}</div>` : `<div class="v" style="color:var(--dim)">（不可用）</div>`, u ? 480 : 360)
    + box("🤖 模型", `<div class="v mono">${esc(e.model) || '<span style="color:var(--dim)">未知</span>'}</div>`, u ? 600 : 480)
    + box("📁 项目 / 目录", `<div class="metrics">${f("项目", e.project)}${f("工作目录", e.cwd, "wide")}</div>`, u ? 720 : 600);

  document.getElementById("detailwrap").innerHTML = html;
  renderMermaid(document.getElementById("detailwrap"));  // 渲染本条日志内的 mermaid 图
  renderMath(document.getElementById("detailwrap"));      // 渲染本条日志内的 LaTeX 公式
  // 绑定编辑/删除操作（操作对原始条目 e，落盘命令按 date#seq 定位）
  const wrap = document.getElementById("detailwrap");
  const btnEdit = wrap.querySelector('.d-act[data-act="edit"]');
  const btnDel = wrap.querySelector('.d-act[data-act="delete"]');
  if (btnEdit) btnEdit.onclick = () => editEntry(e);
  if (btnDel) btnDel.onclick = () => deleteEntry(e);
  trackLink(1000);  // 详情框 fadein + 节点 pop 动画期间持续重算连线，避免停在旧位置
}
