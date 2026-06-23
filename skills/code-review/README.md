# code-review

提交前代码审查 skill。在改动进入 git、进入他人视野之前，把会**腐化、误导、刷屏、埋雷**的东西拦下来。处在多个 skill 的交汇点：下游调用 `code-comment` 审查注释，可被 `git-commit` 在提交前触发，并能与 `ai-log` 衔接沉淀审查记录。

## 适用场景

提交代码前、或写 commit / 推送（git-commit 触发）前使用。

## 要点速览

- **审查范围**：默认本次提交的 diff；本分支有多条提交时，主动询问是否扩到相对主干的全部 diff。
- **逐项清查**：拼写 → log 合理性 → 注释（走 code-comment）→ commit message（走 git-commit）→ 参数校验与边界 → 其余常被忽视点（空指针链、集合误用、魔法值、重复代码、调试残留、测试覆盖）。
- **log 专项**：区分 B 端与 C 端。B 端关键节点可打、要合理合规可用、按需带 `trace_id`；C 端校验失败无需日志，直接抛错返回。热点路径 / 常规返回的 log 坚决删除。
- **衔接**：注释判定下游交给 `code-comment`；提交流程衔接 `git-commit`；审查发现可作为 `ai-log` 日志素材。

完整规范见 [`SKILL.md`](SKILL.md)。
