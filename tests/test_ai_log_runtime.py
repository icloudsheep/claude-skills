import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


AILOG_SCRIPTS = Path(__file__).parents[1] / "skills" / "ai-log" / "scripts"
sys.path.insert(0, str(AILOG_SCRIPTS))

from ailog.runtime import detect_platform, resolve_runtime  # noqa: E402
from ailog.transcript import find_transcript, usage_since  # noqa: E402
from ailog.config import resolve_device  # noqa: E402
from ailog.entry import write_entry  # noqa: E402


class RuntimeTest(unittest.TestCase):
    def test_codex_detection_and_explicit_precedence(self):
        env = {"CODEX_THREAD_ID": "codex-thread", "CLAUDE_CODE_SESSION_ID": "claude-session"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(detect_platform(), "codex")
            runtime = resolve_runtime(session_id="explicit", model="gpt-test")
        self.assertEqual(runtime, {
            "platform": "codex", "session_id": "explicit", "model": "gpt-test"
        })

    def test_claude_detection(self):
        env = {"CLAUDE_CODE_SESSION_ID": "claude-session", "ANTHROPIC_MODEL": "claude-test"}
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(resolve_runtime(), {
                "platform": "claude", "session_id": "claude-session", "model": "claude-test"
            })

    def test_codex_model_comes_from_latest_turn_context(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "rollout-thread.jsonl"
            rows = [
                {"type": "turn_context", "payload": {"model": "gpt-old"}},
                {"type": "turn_context", "payload": {"model": "gpt-current"}},
            ]
            path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            with patch.dict(os.environ, {}, clear=True):
                runtime = resolve_runtime("codex", "thread", transcript_path=str(path))
        self.assertEqual(runtime["model"], "gpt-current")

    def test_device_requires_explicit_env_or_config_for_stable_name(self):
        with tempfile.TemporaryDirectory() as td, patch.dict(os.environ, {
                "XDG_CONFIG_HOME": td, "AILOG_DEVICE": "工作 MacBook"}, clear=True):
            self.assertEqual(resolve_device(), "工作 MacBook")


class TranscriptTest(unittest.TestCase):
    def test_find_both_platform_transcripts(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            claude_file = root / "claude" / "projects" / "p" / "c1.jsonl"
            codex_file = root / "codex" / "sessions" / "2026" / "rollout-x1.jsonl"
            claude_file.parent.mkdir(parents=True)
            codex_file.parent.mkdir(parents=True)
            claude_file.write_text("", encoding="utf-8")
            codex_file.write_text("", encoding="utf-8")
            with patch.dict(os.environ, {
                    "CLAUDE_CONFIG_DIR": str(root / "claude"),
                    "CODEX_HOME": str(root / "codex")}, clear=True):
                self.assertEqual(find_transcript("claude", "c1"), str(claude_file))
                self.assertEqual(find_transcript("codex", "x1"), str(codex_file))

    def test_codex_usage_uses_incremental_token_rows(self):
        rows = [
            {"timestamp": "2026-07-20T01:00:00Z", "type": "event_msg",
             "payload": {"type": "user_message", "message": "hello"}},
            {"timestamp": "2026-07-20T01:00:01Z", "type": "event_msg",
             "payload": {"type": "token_count", "info": {"last_token_usage": {
                 "input_tokens": 10, "output_tokens": 4, "cached_input_tokens": 3,
                 "cache_write_input_tokens": 2}}}},
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "codex.jsonl"
            path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            stats = usage_since("codex", "x", None, datetime(2026, 7, 20, 9, 1), str(path))
        self.assertEqual(stats, {
            "input": 10, "output": 4, "cache_read": 3, "cache_write": 2,
            "turns": 1, "api_calls": 1,
        })

    def test_claude_usage_excludes_tool_result_turns(self):
        rows = [
            {"timestamp": "2026-07-20T01:00:00Z", "type": "user",
             "message": {"role": "user", "content": "hello"}},
            {"timestamp": "2026-07-20T01:00:01Z", "type": "user",
             "message": {"role": "user", "content": [{"type": "tool_result"}]}},
            {"timestamp": "2026-07-20T01:00:02Z", "type": "assistant",
             "message": {"usage": {"input_tokens": 7, "output_tokens": 5,
                                     "cache_read_input_tokens": 2,
                                     "cache_creation_input_tokens": 1}}},
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "claude.jsonl"
            path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            stats = usage_since("claude", "x", None, datetime(2026, 7, 20, 9, 1), str(path))
        self.assertEqual(stats, {
            "input": 7, "output": 5, "cache_read": 2, "cache_write": 1,
            "turns": 1, "api_calls": 1,
        })

    def test_claude_entry_end_to_end_records_platform_model_and_usage(self):
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        rows = [
            {"timestamp": now, "type": "user",
             "message": {"role": "user", "content": "记录日志"}},
            {"timestamp": now, "type": "assistant",
             "message": {"usage": {"input_tokens": 9, "output_tokens": 6}}},
        ]
        with tempfile.TemporaryDirectory() as td:
            transcript = Path(td) / "claude.jsonl"
            transcript.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
            _cn, _cid, html, entry = write_entry(
                str(Path(td) / "logs"), "完成双平台验证", "Claude 冒烟", None,
                platform="claude", session_id="claude-session", model="claude-test",
                transcript_path=str(transcript))
            self.assertTrue(Path(html).is_file())
        self.assertEqual(entry["platform"], "claude")
        self.assertEqual(entry["model"], "claude-test")
        self.assertEqual(entry["usage"]["turns"], 1)
        self.assertEqual(entry["usage"]["input"], 9)


if __name__ == "__main__":
    unittest.main()
