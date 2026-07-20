# Claude Code / Codex 运行时解析

仅在排查会话归属、模型名、transcript、用量或设备名时读取本文。

## 一、平台

解析顺序固定为：

1. CLI `--platform`
2. 环境变量 `AILOG_PLATFORM`
3. 存在 `CODEX_THREAD_ID` 时为 `codex`
4. 存在 `CLAUDE_CODE_SESSION_ID` 时为 `claude`
5. 否则为 `generic`

若两个平台变量同时存在，Codex 优先。显式平台仅接受 `claude`、`codex`、`generic`，非法值直接报错，不静默猜测。

## 二、会话 ID 与代号

原始会话 ID 的解析顺序：

1. CLI `--session-id`
2. `AILOG_SESSION_ID`
3. Codex：`CODEX_THREAD_ID`
4. Claude Code：`CLAUDE_CODE_SESSION_ID`
5. 空值

原始 ID 仅用于内存中的 transcript 定位和 SHA1 派生，不写入日志。日志只保存 `Fox-3f2a` 形式的代号，避免暴露完整平台 ID。

派生算法：以 UTF-8 编码的原始 ID 计算 SHA1；前 8 位十六进制数对动物表取模，接下来 4 位作为后缀。同一 ID 永远得到同一代号。没有 ID 时固定为 `🐾 Anon-0000`，不使用 PID、当前时间或随机数，因为这些值会把同一会话错误拆开。

## 三、模型名

解析顺序：

1. CLI `--model`
2. `AILOG_MODEL`
3. Claude Code：`ANTHROPIC_MODEL`
4. Codex：`CODEX_MODEL`（若平台提供）
5. Codex transcript 中最后一个 `turn_context.payload.model`
6. 空值

模型无法确定时留空，不从提供商、客户端版本或历史记录猜测。调用者已经从当前运行时可靠获知模型时，应通过 `--model` 传入完整模型名。

## 四、transcript

路径解析顺序：

1. CLI `--transcript`
2. `AILOG_TRANSCRIPT`
3. Claude Code：递归搜索 `${CLAUDE_CONFIG_DIR:-~/.claude}/projects` 下的 `<session-id>.jsonl`
4. Codex：递归搜索 `${CODEX_HOME:-~/.codex}/sessions` 下以 `<thread-id>.jsonl` 结尾的 rollout

显式路径不存在时视为不可用，不再偷偷读取另一个会话。默认搜索仅匹配当前 session/thread ID。

Claude Code 用量取 `message.usage`；纯 `tool_result` 回灌不计用户轮次。Codex 用量取 `event_msg/token_count/info/last_token_usage`，不能累加 `total_token_usage`，否则会重复计数；`event_msg/user_message` 计为用户轮次。

统计区间统一为 `(上一条日志时间, 当前时间]`。文件缺失、无权限、JSON 损坏或平台格式变化时返回空用量，日志仍可写入。

## 五、设备名

设备名解析顺序：

1. `AILOG_DEVICE`
2. `~/.config/ai-log/config.json` 的 `device`
3. `socket.gethostname()` 的第一个点号前部分
4. `unknown`

设备名是展示和筛选标签，不是硬件唯一 ID。环境变量和配置值视为用户显式设置；主机名仅为建议值。首次在线上报时，如果 `--status` 返回 `device_configured:false`，必须让用户确认名称并用 `--set-device` 持久化后再上报。

建议名称同时包含设备与环境，例如 `工作 MacBook`、`家用 Linux`，并确保多台设备不重名。不得读取序列号、MAC 地址等敏感硬件标识来自动生成名称。

## 六、诊断

运行：

```bash
python3 <SKILL_DIR>/scripts/ai_logger.py --status
```

重点检查：

- `runtime.platform`
- `runtime.session_id`
- `runtime.model`
- `runtime.transcript`
- `device`、`device_source`、`device_configured`

优先使用 CLI 或 `AILOG_*` 修正一次性/跨平台差异，不要修改平台自己的会话文件。
