"""Claude Code / Codex 运行时探测。

所有平台差异集中在此模块。显式参数和 AILOG_* 环境变量始终优先，
避免平台内部格式变化时让日志功能完全不可用。
"""
import json
import os


PLATFORMS = {"claude", "codex", "generic"}


def detect_platform(explicit=None):
    """确定当前平台：显式值 > AILOG_PLATFORM > 平台会话变量 > generic。"""
    value = (explicit or os.environ.get("AILOG_PLATFORM") or "").strip().lower()
    if value:
        if value not in PLATFORMS:
            raise ValueError(f"不支持的平台：{value}")
        return value
    if os.environ.get("CODEX_THREAD_ID"):
        return "codex"
    if os.environ.get("CLAUDE_CODE_SESSION_ID"):
        return "claude"
    return "generic"


def resolve_session_id(platform, explicit=None):
    """确定原始会话 ID；显式覆盖优先，未探测到时返回空串。"""
    override = (explicit or os.environ.get("AILOG_SESSION_ID") or "").strip()
    if override:
        return override
    if platform == "codex":
        return os.environ.get("CODEX_THREAD_ID", "").strip()
    if platform == "claude":
        return os.environ.get("CLAUDE_CODE_SESSION_ID", "").strip()
    return ""


def _latest_codex_model(transcript_path):
    if not transcript_path:
        return ""
    latest = ""
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                except (json.JSONDecodeError, TypeError):
                    continue
                if row.get("type") == "turn_context":
                    latest = str((row.get("payload") or {}).get("model") or latest)
    except OSError:
        return ""
    return latest.strip()


def resolve_model(platform, explicit=None, transcript_path=None):
    """确定模型名：显式值 > AILOG_MODEL > 平台公开信息 > 空串。"""
    override = (explicit or os.environ.get("AILOG_MODEL") or "").strip()
    if override:
        return override
    if platform == "claude":
        return os.environ.get("ANTHROPIC_MODEL", "").strip()
    if platform == "codex":
        return (
            os.environ.get("CODEX_MODEL", "").strip()
            or _latest_codex_model(transcript_path)
        )
    return ""


def resolve_runtime(platform=None, session_id=None, model=None, transcript_path=None):
    """返回写日志所需的统一运行时信息。"""
    resolved_platform = detect_platform(platform)
    resolved_session = resolve_session_id(resolved_platform, session_id)
    return {
        "platform": resolved_platform,
        "session_id": resolved_session,
        "model": resolve_model(resolved_platform, model, transcript_path),
    }
