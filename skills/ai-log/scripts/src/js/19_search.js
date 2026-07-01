// ── 全文搜索 ───────────────────────────────────────────────────
// 页面右上角常驻一个搜索图标（与大标题平行、上/右边距相等），点击展开搜索框；
// 对当前 ENTRIES（已应用编辑覆盖层）的所有文字字段做大小写不敏感匹配；
// 结果以列表浮层给出，每项含节点主信息 + 命中文本片段（高亮关键词）；
// 点击结果在主页展开该节点（select），并滚动到可视区、短暂高亮闪烁。

// 参与搜索的字段及其中文名（用于结果里标注命中位置）
const SEARCH_FIELDS = [
  ["title", "标题"], ["summary", "正文"], ["project", "项目"],
  ["branch", "分支"], ["model", "模型"], ["cwd", "目录"],
];

// 挂载搜索控件——固定在 body 右上角，只挂一次（build 重建 topbar 不影响它）。
// 默认折叠为图标，点击展开输入框；再次点击图标或点击外部收起。
function mountSearch() {
  if (document.getElementById("search")) return;  // 已挂载，避免 rebuild 重复
  const box = document.createElement("div");
  box.className = "search"; box.id = "search";
  box.innerHTML =
    `<div class="search-bar">`
    + `<button class="search-ico" title="搜索日志">🔍</button>`
    + `<input class="search-input" type="text" placeholder="搜索标题、正文、项目、分支……" spellcheck="false" />`
    + `<button class="search-clear" title="清空" hidden>✕</button>`
    + `</div>`
    + `<div class="search-results" hidden></div>`;
  document.body.appendChild(box);

  const ico = box.querySelector(".search-ico");
  const input = box.querySelector(".search-input");
  const clear = box.querySelector(".search-clear");
  const results = box.querySelector(".search-results");

  const closeResults = () => { results.hidden = true; results.innerHTML = ""; };
  const expand = () => {
    box.classList.add("open");
    setTimeout(() => input.focus(), 60);
    if (input.value.trim()) update();
  };
  const collapse = () => { box.classList.remove("open"); closeResults(); };

  const update = () => {
    const q = input.value.trim();
    clear.hidden = !q;
    if (!q) { closeResults(); return; }
    runSearch(q, results);
  };

  ico.onclick = (e) => { e.stopPropagation(); box.classList.contains("open") ? collapse() : expand(); };
  input.addEventListener("input", update);
  clear.onclick = () => { input.value = ""; clear.hidden = true; closeResults(); input.focus(); };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; clear.hidden = true; collapse(); }
  });
  // 点击控件外部：收起整个搜索框
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) collapse(); }, true);
}

// 执行搜索：遍历 ENTRIES 各字段，命中则记录字段名与命中片段；渲染结果列表。
function runSearch(q, results) {
  const ql = q.toLowerCase();
  const hits = [];
  ENTRIES.forEach((e, i) => {
    const s = META[e.id];
    const matched = [];  // {field, snippet}
    for (const [key, label] of SEARCH_FIELDS) {
      const val = e[key];
      if (!val) continue;
      const idx = String(val).toLowerCase().indexOf(ql);
      if (idx >= 0) matched.push({ label, snippet: makeSnippet(String(val), idx, q.length) });
    }
    // 会话名（自动代号 + 别名）也参与匹配
    const nm = (aliasOf(e.id) || "") + " " + autoName(s);
    if (nm.toLowerCase().includes(ql)) matched.push({ label: "会话", snippet: esc(aliasOf(e.id) || autoName(s)) });
    if (matched.length) hits.push({ i, e, s, matched });
  });

  if (!hits.length) {
    results.hidden = false;
    results.innerHTML = `<div class="search-empty">未找到包含「${esc(q)}」的日志</div>`;
    return;
  }
  results.hidden = false;
  results.innerHTML =
    `<div class="search-count">${hits.length} 条匹配</div>`
    + hits.map((h) => {
        const title = h.e.title ? esc(h.e.title) : esc(autoName(h.s));
        const fields = h.matched.map((m) =>
          `<div class="sr-hit"><span class="sr-field">${m.label}</span>${m.snippet}</div>`).join("");
        return `<div class="search-item" data-seq="${h.e.seq}" style="--c:${h.s.color}">`
          + `<div class="sr-head"><span class="sr-emo">${h.e.emoji}</span>`
          + `<span class="sr-title">${title}</span>`
          + `<span class="sr-seq">#${h.e.seq}</span></div>`
          + `<div class="sr-meta">${esc(displayNamePlain(h.s))} · ${esc(fmtAt(h.e.start, h.e.carryover ? h.e.carryover.prev_date : DATA.date))}</div>`
          + fields
          + `</div>`;
      }).join("");

  results.querySelectorAll(".search-item").forEach((el) => {
    el.onclick = () => openSearchResult(+el.dataset.seq);
  });
}

// 取命中位置周围一小段文本作为片段，关键词高亮；首尾按需加省略号。
function makeSnippet(text, idx, qlen) {
  const PAD = 30;
  const start = Math.max(0, idx - PAD);
  const end = Math.min(text.length, idx + qlen + PAD);
  const pre = (start > 0 ? "…" : "") + text.slice(start, idx);
  const mid = text.slice(idx, idx + qlen);
  const post = text.slice(idx + qlen, end) + (end < text.length ? "…" : "");
  // 片段里去掉换行让其单行展示
  const clean = (s) => esc(s.replace(/\s+/g, " "));
  return clean(pre) + `<mark>${clean(mid)}</mark>` + clean(post);
}

// 会话名纯文本（无 HTML），用于结果元信息行
function displayNamePlain(s) {
  const alias = aliasOf(s.id);
  return alias ? `${alias}(${autoName(s)})` : autoName(s);
}

// 点击搜索结果：在主页展开对应节点（按 seq 定位节点 → select），滚动到可视区并闪烁高亮。
function openSearchResult(seq) {
  const node = document.querySelector(`#stage .node[data-seq="${seq}"]`);
  if (!node) return;
  // 若该节点所属会话被隐藏，先显示它
  const s = META[node.dataset.sid];
  if (s && s.hidden) {
    const chip = document.querySelector(`.chip[data-sid="${cssEsc(node.dataset.sid)}"]`);
    if (chip) toggleSession(node.dataset.sid, chip);
  }
  select(+node.dataset.i, node);
  // 滚动左栏让节点可见 + 闪烁
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.remove("flash"); void node.offsetWidth; node.classList.add("flash");
}
