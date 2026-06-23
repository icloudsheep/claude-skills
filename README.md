# claude-skills

一组可直接复用的 [Claude Code](https://docs.claude.com/en/docs/claude-code) / Agent Skills，沉淀日常开发中的工程规范与自动化能力。每个 skill 都是一个自包含目录，含 `SKILL.md`（带 YAML frontmatter）及其依赖资源，按需自动触发，不常驻占用上下文。

## 包含的 Skills

| Skill | 作用 | 触发时机 |
| ----- | ---- | -------- |
| [`code-comment`](skills/code-comment) | 代码注释规范：注释权责对齐当前作用域，不向上溯源调用链、不向下探索消费方、阶段性现状带时间戳、不写行号、不脑补业务 | 写 / 改任何代码注释（javadoc、行内、字段、测试注释）前 |
| [`code-review`](skills/code-review) | 提交前代码审查：按本次 diff 逐项查拼写、log 合理性（B 端关键节点合理打 / C 端校验失败不打）、注释、commit message、参数校验与边界；下游调 `code-comment`，可被 `git-commit` 触发 | 提交代码前 / 写 commit / push 前 |
| [`git-commit`](skills/git-commit) | Git 提交规范：基于 Conventional Commits，覆盖 type 选择、subject/body/footer 写法、`-F` 文件提交、精确暂存、amend 与强推安全、分支命名 | 写 commit message / 建分支 / push 前 |
| [`ai-log`](skills/ai-log) | 记录 AI 工作日志：总结上次记录至今的工作内容，写入按天目录的 `data.json` 与可视化 `index.html`；保存目录由配置决定，首次使用询问是否永久指定 | 收到「记录日志」「log 一下」类指令时 |

## Skills 协作关系

这四个 skill 不是孤立的，围绕「写代码 → 审查 → 提交 → 记录」一条链路彼此衔接：

```
code-comment ──被调用──► code-review ──衔接──► git-commit
                              │                    │
                              └────────┬───────────┘
                                       ▼
                                    ai-log（汇总本段工作 + 审查/提交结果）
```

- **code-review → code-comment**：审查注释时，以 code-comment 的规范为准则。
- **code-review ↔ git-commit**：提交前先审查；审查通过后按 git-commit 规范写 message、暂存、提交。
- **ai-log ← 其余三者**：记录日志时，ai-log 可复用本段已有的产物（commit message、审查发现、注释改动）作为高质量正文素材，而非从零编造，以此提升效率与准确性。

> **互相调用需先征得用户同意**：以上联动是「允许」而非「自动」。任一 skill 在运行中要触发另一个 skill（例如 code-review 想顺手跑 git-commit 提交、或 ai-log 想去读取 git log / 审查结论）时，**必须先向用户说明要调用哪个 skill、做什么，获得明确许可后再执行**。用户未许可则只完成本 skill 职责，不擅自展开。


## 目录结构

```
skills/
├── ai-log/
│   ├── SKILL.md
│   ├── README.md
│   ├── version.json
│   └── scripts/
│       ├── ai_logger.py      # 日志写入脚本
│       ├── template.html     # 可视化时间线模板
│       └── mermaid.min.js    # 本地 mermaid 渲染库（离线可用）
├── code-comment/
│   ├── SKILL.md
│   └── README.md
├── code-review/
│   ├── SKILL.md
│   └── README.md
└── git-commit/
    ├── SKILL.md
    └── README.md
```

> 每个 skill 目录均含 `SKILL.md`（规范正文，带 YAML frontmatter，运行时加载）与 `README.md`（仓库浏览用的人读说明）。

## 安装

将 skill 目录放到 Claude Code 能发现的位置即可：

- 用户级（全局生效）：`~/.claude/skills/`
- 项目级（随仓库共享）：`<repo>/.claude/skills/`

一键安装到用户级目录：

```bash
./install.sh            # 等价于 ./install.sh ~/.claude/skills
./install.sh <目标目录>  # 安装到指定目录
```

或手动软链 / 拷贝：

```bash
ln -s "$PWD/skills/code-comment" ~/.claude/skills/code-comment
ln -s "$PWD/skills/code-review"  ~/.claude/skills/code-review
ln -s "$PWD/skills/git-commit"   ~/.claude/skills/git-commit
ln -s "$PWD/skills/ai-log"       ~/.claude/skills/ai-log
```

### ai-log 的保存目录

`ai-log` 的脚本与模板（`ai_logger.py`、`template.html`）放在 `skills/ai-log/scripts/` 下，脚本按自身位置定位模板，无需复制到任何固定路径。

日志保存目录由配置决定，不写死：

1. `--root <目录>`：仅本次生效。
2. `~/.config/ai-log/config.json` 的 `root`：永久位置（由 `--set-root` 写入）。
3. 兜底 `~/.cache/ai-log`：临时位置。

首次使用时 skill 会查询状态（`--status`），若未永久指定则询问用户是否要永久指定一个目录；用户选定后写入配置文件（不污染 SKILL.md），之后不再打扰。脚本会读取环境变量：

- `CLAUDE_CODE_SESSION_ID`：派生稳定的会话代号（同会话恒定）。
- `ANTHROPIC_MODEL`：记录当前模型名（可选）。

## 许可证

[MIT](LICENSE)
