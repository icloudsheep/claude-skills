---
name: code-review
description: 提交前对本次改动做代码审查。核心范围是本次提交的 diff（必要时询问是否扩到本分支全部 diff）；逐项检查拼写、log 合理性、注释（下游调用 code-comment）、commit message 格式（衔接 git-commit）、参数校验与边界等通用问题；并可按用户意愿查询 CI 代码覆盖率（全局/diff 目标）。提交代码前、或 git-commit 触发时使用本 skill。
metadata:
  short-description: 提交前代码审查：拼写/log/注释/commit/边界/覆盖率清查
---

# code-review

——提交前的最后一道关。目标不是挑刺，而是在改动进入 git、进入他人视野之前，先把**会腐化、会误导、会刷屏、会埋雷**的东西拦下来。

> 本 skill 在「提交前」运行，处在几个 skill 的交汇点：
> - **下游调用 `code-comment`**：审查注释时，直接以 code-comment 的规范为准则。
> - **被 `git-commit` 触发**：写 commit / 推送前先跑一轮 review，再进入提交流程。
> - **与 `ai-log` 衔接**：review 结束后若用户要「记录日志」，本次发现的问题与处置可作为日志素材（见末节）。

---

## 一、审查范围

默认审查**本次提交的 diff**。

- 先看工作区与暂存区改动：

  ```bash
  git status --short
  git diff            # 未暂存
  git diff --cached   # 已暂存
  ```

- **若本分支近期存在多条提交**，主动询问用户：是否需要把范围扩到本分支相对主干的**全部 diff**（而非仅最后一次）。用户确认后再查：

  ```bash
  git log --oneline <主干>..HEAD      # 看本分支提交序列
  git diff <主干>...HEAD              # 本分支相对主干的累计 diff
  ```

- 聚焦**本次改动引入的问题**，不发散去重写存量代码；存量问题顺手发现可提示，但不强行纳入本次。

---

## 二、逐项检查清单

按以下维度过一遍 diff。每条都对照「本次改动」判断，不替用户做无关重构。

### 1. 拼写

- 标识符、注释、日志文案、用户可见文案里的拼写错误（英文单词拼错、中文别字）。
- 命名是否词义准确（`recieve`→`receive`、`lenght`→`length` 这类高频错拼）。
- 对外文案 / 错误提示的拼写与措辞是否得体。

### 2. log 合理性（重点，详见第三节）

- 每一条 log 都要问「这里到底需不需要打」。
- 区分 B 端关键节点 vs C 端用户路径。
- 杜绝刷屏式无效日志。

### 3. 注释（下游调用 code-comment）

- 审查注释时**以 `code-comment` skill 为准则**：不向上溯源调用链、不向下探索消费方、不横向引用其他方法、阶段性现状带 `[注: 截至 YYYY-MM-DD]`、不写硬编码行号、不脑补业务。
- 同时鼓励：复杂逻辑 / 关键取舍 / 边界坑点是否**缺**了该有的「为什么」注释。
- 发现注释问题时，按 code-comment 的正确写法给出修订建议。

### 4. commit message 格式（衔接 git-commit）

- 检查本次（及范围内历次）commit message 是否符合 `git-commit` skill：`type: subject` 结构、type 选得对、subject 一句话无句号、body 说清「为什么」、多行 message 是否被 shell 截断。
- 无意义 message（`update`、`fix bug`、`0`、`tmp`）一律打回。

### 5. 参数校验与边界

- **入参校验是否齐全**：必填项判空、长度上限、数值区间、格式合法性（如「逐项 check 不通过即抛 BAD_REQUEST」的写法，见第三节正例）。
- **边界与异常**：空集合 / null / 越界 / 除零 / 数值溢出 / 代理对（emoji 等补充平面字符按 code point 处理，不要按 char 拆开）。
- **异常处理**：catch 块是否吞异常、是否丢失上下文、是否该向上抛而被静默。
- **资源与并发**：流 / 连接是否关闭、共享可变状态（如复用的 `StringBuilder`）是否有内容污染或线程安全隐患、循环内是否重复 new 大对象。

### 6. 其余常被忽视的点

- **空指针链**：`a.getB().getC()` 式链式调用中途为 null。
- **集合误用**：在遍历中修改集合、`contains` 在大集合上的性能、用 `==` 比较包装类型 / 字符串。
- **魔法值**：散落的字面量数字 / 字符串是否该提为常量或枚举。
- **重复代码**：本次新增是否与既有工具方法重复（可复用而未复用）。
- **幂等与重试**：写操作在重试 / 重复消费下是否幂等。
- **时间 / 时区 / 精度**：金额用 `BigDecimal` 而非 `double`，时间处理时区是否明确。
- **死代码 / 调试残留**：`System.out.println`、临时 `log.info("aaa")`、注释掉的整段代码、`TODO` 是否该清理。
- **测试**：本次改动是否有对应测试，关键分支 / 边界是否覆盖（测试注释同样走 code-comment）。

---

## 三、log 使用规范（重点专项）

日志是高频被滥用的地方：**该打的不打、不该打的狂打**。每一条 log 都要单独做合理性审查——「这个环节到底有没有必要 log」。

### 核心判据：分清 B 端与 C 端

- **面向 B 端（后台 / 运营 / 内部管理 / 关键业务链路）**：**关键节点可以打日志**，但必须**合理、合规、可用**：
  - 打在**有排查价值的关键节点**（外部调用入口出口、状态流转、异常分支、重要决策点），而非每个分支都打。
  - 日志要**可用**：带上能定位问题的关键上下文（业务主键、操作类型、结果），并**注意是否需要 `trace_id`** 串联全链路。
  - **合规**：不把敏感信息（密钥、用户隐私）或整个大对象塞进日志。
- **面向 C 端（终端用户请求路径，尤其是参数校验失败）**：**无需日志，直接返回错误即可**。校验不通过就抛业务异常 / 返回错误码，不要为每次用户输入错误打一行 log——这类日志量大、无排查价值、纯刷屏。

### 反例（坚决避免）

```java
public static boolean containsEmoji(String value, boolean strict) {
    if (StringUtils.isBlank(value)) {
        return false;
    }
    // ... 按 code point 遍历匹配 ...
    for (int start = 0; start < codePoints.length; start++) {
        for (int end = start; end < endLimit; end++) {
            if (emojiData.emojiSet.contains(candidate.toString())) {
                log.info("EmojiUtil#containsEmoji >>> 找到Emoji:{}", candidate);  // 命中即打，热点路径刷屏
                return true;
            }
        }
    }
    log.info("EmojiUtil#containsEmoji >>> 未找到Emoji:{}", value);  // ← 完全不必要，会严重滥用 log
    return false;
}
```

- `未找到Emoji` 这一行**完全不必要**：这是一个纯工具方法的常规返回路径，会被高频调用，每次都打一行属于典型的 **log 滥用**，坚决删除。
- `找到Emoji` 同样要审视：工具方法内部命中与否不是「关键业务节点」，没有排查价值就不该打；真要观测，交给调用方在业务节点决定。

### 正例（C 端校验失败：不 log，直接抛）

```java
if (StringUtils.isBlank(request.getName()) || request.getId() == null
        || request.getId() <= 0L || StringUtils.isBlank(request.getProducer())
        /* ... 其余必填项 ... */) {
    throw new ServerException(ServerCode.BAD_REQUEST.getCode(), "必要参数为空");
}
if (request.getName().length() > 256 || request.getOverview().length() > 2048) {
    throw new ServerException(ServerCode.BAD_REQUEST.getCode(), "输入信息无效");
}
if (request.getRuntime() <= 0 || request.getRuntime() >= 20) {
    throw new ServerException(ServerCode.BAD_REQUEST.getCode(), "单集平均时长不可大于20");
}
```

校验失败直接抛业务异常返回错误码，不打日志。

### log 审查小结

逐条 log 自问：

- [ ] 这是 B 端关键节点，还是 C 端用户路径？C 端校验失败不该打 log。
- [ ] 这条 log 有没有**排查价值**？常规返回 / 热点工具方法内部不要打。
- [ ] 级别对不对？常规流水用 `info` 还是 `debug`？异常才用 `warn` / `error`。
- [ ] 关键链路是否需要 `trace_id` 串联？
- [ ] 是否打了敏感信息或整个大对象？
- [ ] 是否在循环 / 高频路径里打，会不会刷屏？

---

## 四、CI 代码覆盖率检查（询问后执行）

代码测试覆盖率是提交前值得一并确认的质量指标，但**是否检查、目标定多少，由用户决定**，不擅自跑。

### 触发方式

在完成逐项 diff 审查后，**主动询问用户**：

- 本次是否需要查询 CI 代码覆盖率？
- 若需要，覆盖率目标是多少？分两类目标，格式为「全局覆盖率 / diff 覆盖率」：
  - **全局覆盖率**：整个模块 / 包的累计覆盖率目标（如 `0` 表示不卡全局）。
  - **diff 覆盖率**：本次改动新增 / 修改代码的覆盖率目标（如 `70` 表示本次 diff 需覆盖 70%）。

### 执行方式

用户确认需要检查后，使用项目提供的覆盖率脚本执行，典型形式：

```bash
# 用法：check-coverage.sh <检查路径> <全局覆盖率目标>/<diff覆盖率目标>
bash check-coverage.sh app/hello/world 0/70
```

- **检查路径**：用户指定的模块 / 包路径（如 `app/hello/world`）。若用户未给，询问或按本次 diff 涉及的主要模块推断并与用户确认。
- **目标参数**：按用户给的「全局/ diff」两个数字拼接（如 `0/70` 表示全局不卡、diff 需 70%）。
- 脚本名 / 路径以项目实际为准（可能是 `check-coverage.sh` 或项目内类似封装）；先确认脚本存在再执行。

### 反馈方式

拿到脚本输出后，向用户清晰反馈：

- 实际全局覆盖率、实际 diff 覆盖率分别是多少。
- 是否达到用户设定的目标；未达标则指出**本次 diff 中哪些新增 / 改动代码未被覆盖**，并建议补哪些测试（测试注释走 code-comment）。
- 达标则明确告知通过，可继续提交流程。

---

## 五、审查输出与处置

- **分级呈现**：按「必须改（阻断提交）/ 建议改 / 可选优化」分组，每条给出**文件 + 方法/字段引用**（不写行号）、问题、建议改法。
- **能改则改**：注释、拼写、删除冗余 log 这类明确问题，可直接给出修订；涉及逻辑取舍的，说明清楚交用户定夺。
- **改完复检**：修订后重新过一遍 diff，确认问题闭环、未引入新问题；涉及代码改动的按项目方式构建 / 跑相关测试（如 Gradle 项目跑对应模块测试）。

---

## 六、与 git-commit / ai-log 的衔接

> **跨 skill 调用需先征得用户同意**：下面的联动是「允许」而非「自动」。本 skill 运行中若要触发另一个 skill（如审查后顺手按 git-commit 提交、或调 ai-log 记录），**必须先向用户说明要调用哪个 skill、做什么，获得明确许可后再执行**；未获许可则只完成本次审查职责。

- **被 git-commit 触发**：进入提交流程前，先完成本 skill 的检查清单；review 通过后，**经用户同意**再按 `git-commit` 规范写 message、精确暂存、提交。
- **下游 code-comment**：注释相关的所有判定与改法，统一以 `code-comment` skill 为准（读取其规范作为准则，属轻量引用，仍建议在动手改注释前知会用户）。
- **配合 ai-log**：若用户在 review 后要「记录日志」，本次审查的发现（拦下了哪些 log 滥用 / 注释腐化 / 边界问题、做了哪些修订）是高质量的日志素材，可在 ai-log 正文里结构化记录。

---

## 七、提交前总检查清单

- [ ] 拼写无误（标识符、注释、日志、对外文案）
- [ ] 每条 log 都过了合理性审查：C 端不打、热点/常规返回不打、B 端关键节点合理打且按需带 trace_id
- [ ] 注释满足 code-comment：不越界、带时间戳、无行号、不脑补，且该补的「为什么」已补
- [ ] commit message 符合 git-commit：type 正确、一句话 subject、body 说清为什么、未被截断
- [ ] 参数校验齐全（判空 / 长度 / 区间 / 格式），边界与异常处理到位
- [ ] 无空指针链、集合误用、魔法值、重复代码、调试残留
- [ ] 关键改动有测试覆盖
- [ ] 已询问用户是否检查 CI 覆盖率；如需要，按「全局/diff」目标跑覆盖率脚本并反馈结果
- [ ] 修订后已复检并构建 / 跑相关测试通过
