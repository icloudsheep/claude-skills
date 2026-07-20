"""Claude Code / Codex transcript 定位与分段用量统计。"""
import json
import os
from datetime import datetime


def _home_root(platform):
    if platform == "codex":
        return os.path.expanduser(os.environ.get("CODEX_HOME", "~/.codex"))
    if platform == "claude":
        return os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude"))
    return ""


def find_transcript(platform, session_id, explicit=None):
    """定位 transcript；显式路径优先，平台目录仅作尽力而为的兼容读取。"""
    override = explicit or os.environ.get("AILOG_TRANSCRIPT")
    if override:
        path = os.path.abspath(os.path.expanduser(override))
        return path if os.path.isfile(path) else None
    if not session_id:
        return None
    root = _home_root(platform)
    if platform == "claude":
        root = os.path.join(root, "projects")
        target = session_id + ".jsonl"
    elif platform == "codex":
        root = os.path.join(root, "sessions")
        target = session_id + ".jsonl"
    else:
        return None
    if not os.path.isdir(root):
        return None
    for dirpath, _dirs, files in os.walk(root):
        if platform == "claude" and target in files:
            return os.path.join(dirpath, target)
        if platform == "codex":
            for filename in files:
                if filename.endswith(target):
                    return os.path.join(dirpath, filename)
    return None


def _local_naive(iso_ts):
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def _in_window(row, start_dt, end_dt):
    ts = _local_naive(row.get("timestamp", ""))
    return ts is not None and ts <= end_dt and (start_dt is None or ts > start_dt)


def _claude_usage(rows):
    agg = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
           "turns": 0, "api_calls": 0}
    for row in rows:
        msg = row.get("message") or {}
        content = msg.get("content")
        if row.get("type") == "user" and msg.get("role") == "user" and content:
            if not (isinstance(content, list) and all(
                    isinstance(x, dict) and x.get("type") == "tool_result" for x in content)):
                agg["turns"] += 1
        usage = msg.get("usage") or {}
        if usage:
            agg["api_calls"] += 1
            agg["input"] += usage.get("input_tokens", 0) or 0
            agg["output"] += usage.get("output_tokens", 0) or 0
            agg["cache_read"] += usage.get("cache_read_input_tokens", 0) or 0
            agg["cache_write"] += usage.get("cache_creation_input_tokens", 0) or 0
    return agg


def _codex_usage(rows):
    agg = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
           "turns": 0, "api_calls": 0}
    for row in rows:
        payload = row.get("payload") or {}
        if row.get("type") == "event_msg" and payload.get("type") == "user_message":
            agg["turns"] += 1
        if row.get("type") != "event_msg" or payload.get("type") != "token_count":
            continue
        usage = (payload.get("info") or {}).get("last_token_usage") or {}
        if not usage:
            continue
        agg["api_calls"] += 1
        agg["input"] += usage.get("input_tokens", 0) or 0
        agg["output"] += usage.get("output_tokens", 0) or 0
        agg["cache_read"] += usage.get("cached_input_tokens", 0) or 0
        agg["cache_write"] += usage.get("cache_write_input_tokens", 0) or 0
    return agg


def usage_since(platform, session_id, start_dt, end_dt, transcript_path=None):
    """统计 (start_dt, end_dt] 内的用量；不可用或格式变化时返回空字典。"""
    path = find_transcript(platform, session_id, transcript_path)
    if not path:
        return {}
    rows = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if _in_window(row, start_dt, end_dt):
                    rows.append(row)
    except OSError:
        return {}
    return _codex_usage(rows) if platform == "codex" else _claude_usage(rows)
