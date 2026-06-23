---
name: git-commit
description: 编写 git 提交信息、建分支、推送代码时遵循的规范（基于 Conventional Commits）。覆盖 type 选择、subject/body/footer 写法、多行 message 用 -F 文件提交、精确暂存、amend 与强推安全、分支命名。写 commit message / 建分支 / push 前使用本 skill。
metadata:
  short-description: Git 提交规范：type 选择、message 写法、安全提交与推送实务
---

# git-commit

> 基于 [Conventional Commits](https://www.conventionalcommits.org) 约定整理。
> 目的是让提交历史可读、可检索、可追溯。
>
> 若仓库**未**配置 commitlint 或 commit-msg 校验钩子，本规范以团队约定形式执行。

---

## 一、提交信息整体结构

```
<type>: <subject>            # 标题行（必填，一句话）

<body>                       # 正文（可选，解释「为什么」与「做了什么」）

<footer>                     # 脚注（可选，关联 issue / 协作署名 / 破坏性变更）
```

- 标题行与正文之间、正文与脚注之间各空一行。
- 标题行建议不超过 50 个字符（中文约 25 字），正文每行不超过 72 字符。
- **语言**：与仓库现状保持一致（中文仓库以中文为主），技术名词、类名、字段名保留英文原文。

---

## 二、type 类型

常用以下类型（按典型使用频率排序）：

| type       | 含义                                         | 示例场景                         |
| ---------- | -------------------------------------------- | -------------------------------- |
| `fix`      | 修复 bug                                     | 修复 NPE、修复 diff 误判         |
| `feat`     | 新增功能 / 字段 / 接口                       | 新增 area_owner 字段             |
| `test`     | 新增或修改测试，不改动生产代码               | 补充单测、修复测试代码           |
| `refactor` | 重构（不改变外部行为，无新功能、无修复）     | 抽取方法、调整结构               |
| `perf`     | 性能优化                                     | 减少 RPC 调用、缓存预热          |
| `style`    | 代码风格 / 格式（不影响逻辑）                | 消除代码异味、格式化             |
| `docs`     | 仅文档改动                                   | 补充 javadoc、更新 README        |
| `chore`    | 构建、依赖、脚手架等杂项                     | 升级依赖、调整构建配置           |
| `build`    | 构建系统或外部依赖变更                       | 修改打包脚本                     |
| `ci`       | CI 配置与脚本变更                            | 调整流水线                       |
| `revert`   | 回滚某次提交                                 | Revert "feat: xxx"               |

> 不确定用哪个时：有新增对外能力 → `feat`；解决线上/逻辑问题 → `fix`；只动测试 → `test`。

---

## 三、subject（标题）写法

- 用**动词开头的祈使句**，简明描述本次改动结果，如「新增」「修复」「优化」「删除」。
- 一行说清一件事，不堆砌多个不相关改动（一个提交只做一件事）。
- 结尾不加句号。
- 避免无意义标题：如 `0`、`update`、`fix bug`、`tmp`。

**推荐**

```
feat: 搜索推送链路新增 area_owner（条目/内容归属）字段
fix: alias naturalKey 不再引用 aliasLanguage 避免 diff 误判
```

**不推荐**

```
0
update code
修改了一些东西
```

---

## 四、body（正文）写法

正文是规范的核心价值所在，重点回答 **「为什么改」**，而不只是「改了什么」（改了什么看 diff 即可）。

建议包含：

1. **背景 / 根因**：问题是怎么产生的，触发条件是什么。
2. **修复 / 实现思路**：采用的方案，关键取舍。
3. **测试 / 验证**：新增或调整了哪些测试，覆盖什么场景。
4. **影响范围 / 已知取舍**：是否影响存量调用方、是否有意未处理的部分。

可用 `-` 列要点，用 `→` 表达因果链。示例：

```
fix: alias naturalKey 不再引用 aliasLanguage 避免 diff 误判

ItemAliasBO.naturalKey 之前包含 aliasLanguage 字段，但：
- 老数据 aliasLanguage=0、新入参 aliasLanguage=null（二期废弃此字段）
- 字符串拼接结果 "...|0" vs "...|null" 不相等
→ diffAndSyncAlias 误判同一行为"被删 + 重插"

修复：naturalKey 移除 aliasLanguage 维度。
测试：新增 testNaturalKey_aliasLanguageZeroVsNull_treatedSame 守住关键场景。
```

---

## 五、footer（脚注）写法

- **关联需求 / 缺陷**：如 `Refs: #1234`、`Closes: #5678`，或贴需求管理系统链接。
- **破坏性变更**：以 `BREAKING CHANGE:` 开头，单独成段说明不兼容点与迁移方式。
- **AI 协作署名**：使用 Claude Code 等工具协助提交时，保留自动追加的署名行：

  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

---

## 六、提交操作实务（AI / 命令行视角）

多行、含中文标点的 message 用 `git commit -m "..."` 极易踩坑，以下为实践总结：

- **多行 message 必须用 `-F` 文件方式**，不要用多个 `-m` 或在 `-m` 里塞 `\n`。
  正文含中文括号 `（）`、斜杠 `/`、引号 `"`、`#` 等字符时，`-m` 会被 shell 解析截断
  （真实事故：message 在第一段就被 shell 当成路径/命令中断，只提交了半句）。

  推荐流程：

  ```bash
  # 1. 把完整 message 写入临时文件（用文件写入工具，不经 shell 转义）
  #    /tmp/commit_msg.txt
  # 2. 提交
  git commit -F /tmp/commit_msg.txt
  # 3. 用完删除
  rm -f /tmp/commit_msg.txt
  ```

- **提交后核验 message**：`git log -1 --format='%B'` 确认完整、没被截断，再继续。

- **精确暂存，勿用 `git add .`**：只 `git add` 本次相关文件，避免把 `.idea/`、
  临时产物等无关文件带进提交。提交前用 `git status --short` 核对暂存内容。

- **修正未推送的提交用 `--amend`**：仅限**改写自己、尚未推送**的提交（追加遗漏文件、
  订正 message）。amend 同样建议配合 `-F` 文件方式重写 message：

  ```bash
  git commit --amend -F /tmp/commit_msg.txt
  ```

  已推送或被他人引用的提交，不要 amend（需要时改用新提交）。

- **改了什么写进 message**：amend 合并了多类改动时，message 要同步覆盖全部改动，
  不要只描述最初那一次。

---

## 七、分支与推送规范

- **分支命名**：`<域>/<日期>-<简述>`，例如
  `external-service/20260615-add-area_owner`。
- **不直接提交到 master/main**：在特性分支开发，通过 Merge / Pull Request 合入。
- **保持基于最新主干**：开发前 / 合入前尽量 rebase 到主干，减少合并噪音。
- **强制推送**：仅在改写过自己未合入分支的历史（rebase / amend）时使用，且优先
  `--force-with-lease`，避免覆盖他人提交：

  ```bash
  git push --force-with-lease origin <branch>
  ```

  共享分支慎用强推；改写已被他人引用的历史前先沟通。

---

## 八、完整示例

```
feat: 搜索推送链路新增 area_owner（条目归属）字段

为推往 databus topic ItemSearch-T 的搜索文档新增 area_owner 字段，
取值 domestic（国内）/ overseas（海外），覆盖 external 与 item-search 两套链路。

external 服务（ItemSearch）：
- 数据来源 t_item_base.area_owner，经 servant RPC proto 透传
- 在 supplementItemInfo 写入，缺失（null/空串）时兜底 domestic

item-search 服务（ItemDoc）：
- 暂无该字段数据源，不读库，直接兜底 domestic
- reduceItemSearchByItem 与 buildItemSearchBackdoor 均写入

说明：站外合作链路 expandSearch 暂不写入（归属无数据来源、语义存疑），
为已知的有意取舍，非遗漏。

Co-Authored-By: Claude <noreply@anthropic.com>
```

> 注：commit message 正文可以适度描述链路与取舍（这是"为什么"的一部分）；
> 但落到**代码注释**时须遵循 `code-comment` skill，收敛到当前作用域、不向上下游探索。

> **提交前建议先过 `code-review`**：本仓库的 `code-review` skill 覆盖提交前的拼写 / log 合理性 / 注释 / 参数边界等通用审查，提交前跑一轮能拦下多数低级问题。
> **跨 skill 调用需先征得用户同意**：若要在提交流程中主动触发 `code-review`（或其他 skill），先向用户说明要调用什么、做什么，获许可后再执行。

---

## 九、快速检查清单

提交前自检：

- [ ] 标题以 `type: ` 开头，type 选择正确
- [ ] 标题一句话说清，无句号，非无意义文案
- [ ] 改动聚焦单一主题（不混入无关改动）
- [ ] 正文说明了「为什么」，而非仅罗列「改了什么」
- [ ] 涉及测试的，已说明覆盖场景
- [ ] 有破坏性变更的，已写 `BREAKING CHANGE:`
- [ ] AI 协助的，保留 `Co-Authored-By` 署名
- [ ] 多行 / 含中文标点的 message 用 `-F 文件` 提交，提交后已 `git log -1` 核验未截断
- [ ] 暂存内容已用 `git status --short` 核对，无 `.idea/` 等无关文件
- [ ] amend 仅用于未推送的自己的提交，且 message 已覆盖全部合并改动
- [ ] 未直接推 master/main；强推使用 `--force-with-lease`
