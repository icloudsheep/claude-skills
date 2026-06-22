# claude-skills

一组可直接复用的 [Claude Code](https://docs.claude.com/en/docs/claude-code) / Agent Skills，沉淀日常开发中的工程规范与自动化能力。每个 skill 都是一个自包含目录，含 `SKILL.md`（带 YAML frontmatter）及其依赖资源，按需自动触发，不常驻占用上下文。

## 包含的 Skills

| Skill | 作用 | 触发时机 |
| ----- | ---- | -------- |
| [`code-comment`](skills/code-comment) | 代码注释规范：注释权责对齐当前作用域，不向上溯源调用链、不向下探索消费方、阶段性现状带时间戳、不写行号、不脑补业务 | 写 / 改任何代码注释（javadoc、行内、字段、测试注释）前 |
| [`git-commit`](skills/git-commit) | Git 提交规范：基于 Conventional Commits，覆盖 type 选择、subject/body/footer 写法、`-F` 文件提交、精确暂存、amend 与强推安全、分支命名 | 写 commit message / 建分支 / push 前 |
| [`ai-log`](skills/ai-log) | 记录 AI 工作日志：总结上次记录至今的工作内容，写入按天目录的 `data.json` 与可视化 `index.html`；保存目录由配置决定，首次使用询问是否永久指定 | 收到「记录日志」「log 一下」类指令时 |

## 目录结构

```
skills/
├── ai-log/
│   ├── SKILL.md
│   └── scripts/
│       ├── ai_logger.py      # 日志写入脚本
│       └── template.html     # 可视化时间线模板
├── code-comment/
│   └── SKILL.md
└── git-commit/
    └── SKILL.md
```

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
ln -s "$PWD/skills/git-commit"  ~/.claude/skills/git-commit
ln -s "$PWD/skills/ai-log"      ~/.claude/skills/ai-log
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
