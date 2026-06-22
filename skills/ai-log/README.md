# ai-log

记录 AI 工作日志 skill。把「上次记录到现在」的工作内容总结后，追加写入按天目录的结构化数据与可视化时间线。

## 适用场景

收到「记录日志」「记一下日志」「log 一下」类指令时触发。

## 保存目录如何确定

脚本**不写死任何路径**。保存目录按优先级解析：

1. `--root <目录>`：仅本次生效，不落盘。
2. `~/.config/ai-log/config.json` 的 `root`：永久位置，由 `--set-root` 写入。
3. 兜底 `~/.cache/ai-log`：临时位置，未永久指定时使用。

（`~/.config` / `~/.cache` 分别尊重 `XDG_CONFIG_HOME` / `XDG_CACHE_HOME`。）

**首次使用**：skill 会先 `--status` 查状态，若 `configured:false` 则询问用户是否要永久指定一个目录。用户给目录就 `--set-root` 永久落盘；暂不指定则本次落临时兜底目录，下次再问。永久路径只存进独立配置文件，不污染 SKILL.md。

## 工作流程

1. **查状态 / 按需询问**：`ai_logger.py --status`，未永久指定时询问用户。
2. **拟标题 + 总结**：先拟一句标题（≤30 字），再概述上次记录至今的工作（正文默认 1000 字内，正文不写一级大标题、只用小标题与列表）。
3. **写入**：调用 `ai_logger.py --title "<标题>" --summary "<总结>"`，summary 用单引号 heredoc 传参避免 shell 篡改；用户选择永久指定时用 `--set-root <目录> --title ... --summary ...` 一步到位。
4. **确认**：仅输出一句确认。

## 脚本接口

```bash
ai_logger.py --status                                       # 输出配置状态 JSON，不写日志
ai_logger.py --title "..." --summary "..."                  # 按当前配置/兜底记一条
ai_logger.py --title "..." --summary "..." --root <目录>     # 本次临时指定目录
ai_logger.py --set-root <目录> [--title "..." --summary "..."]  # 永久指定目录（可顺带记一条）
ai_logger.py --summary "..." --id <会话名>                   # 手动覆盖会话代号
```

脚本读取环境变量 `CLAUDE_CODE_SESSION_ID`（派生稳定会话代号）与 `ANTHROPIC_MODEL`（记录模型名）。

## 跨午夜接续

当天本会话还没记录、但更早日期里有本会话的尾巴时，脚本会把新日志存到**今天**，起点继承昨日结束时间、时长按真实跨日计算，并写入 `carryover` 字段。网页在该条详情面板与时间线节点（🌙 角标）上标注「前一部分在上一日」。无需传任何跨日参数。

## 产物（`<root>/{YYYY-MM-DD}/`）

- `data.json`：结构化数据真源，含 `title`、会话代号、起止时间、项目、分支、模型、总结等字段，跨日条目附 `carryover`。
- `index.html`：由 `scripts/template.html` 注入数据生成的可视化时间线，标题在详情面板顶部单独展示，双击离线打开。

## 依赖文件

`scripts/ai_logger.py` 与 `scripts/template.html` 必须同目录（脚本按自身位置定位模板）。无需把它们复制到任何固定路径——保存目录由配置决定。

完整规范见 [`SKILL.md`](SKILL.md)。
