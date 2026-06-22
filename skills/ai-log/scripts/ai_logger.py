#!/usr/bin/env python3
"""AI 工作日志记录脚本（GitHub 可移植版）。

用法:
    # 记录一条日志（root 解析顺序见下）
    python3 ai_logger.py --summary "<一两句话总结>" [--id "<可选会话名>"] [--root <本次保存目录>]

    # 永久指定保存目录（写入配置后退出；可同时带 --summary 立即记一条）
    python3 ai_logger.py --set-root <目录> [--summary "..."]

    # 查询当前配置状态（输出 JSON，供调用方判断是否需要询问用户），不写日志
    python3 ai_logger.py --status

保存目录（root）解析顺序:
    1. --root 显式指定（仅本次生效，不落盘为永久配置）
    2. 配置文件 ~/.config/ai-log/config.json 中的 "root"（永久，由 --set-root 写入）
    3. 兜底 ~/.cache/ai-log（临时位置；此时 --status 报告 configured=false）
    （~/.config 与 ~/.cache 分别尊重 XDG_CONFIG_HOME / XDG_CACHE_HOME 环境变量）

会话 ID:
    默认读环境变量 CLAUDE_CODE_SESSION_ID，由其哈希确定性派生出
    「emoji + 动物名 + 4位后缀」形式的会话代号（如 🦊 Fox-3f2a）。
    同一会话永远得到同一代号，不同会话彼此独立；可用 --id 手动覆盖。

计时:
    本次开始时间 = 「同一会话」当天上一条的结束时间（无则等于本次结束时间），
    因此不同会话的时间区间允许相互重叠。

产物（按天一个目录 <root>/{YYYY-MM-DD}/）:
    data.json   —— 结构化数据真源（脚本读写）
    index.html  —— 由脚本同目录 template.html 注入数据生成的可视化时间线
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime

DATE_FMT = "%Y-%m-%d"
TIME_FMT = "%H:%M:%S"
# 模板与脚本同目录，随仓库一起分发，不依赖任何外部固定路径
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html")
DATA_TOKEN = "__LOG_DATA__"

# 动物代号表：哈希取模选一项，保证「同会话同代号、规律可读」。可自由扩充。
ANIMALS = [
    ("🦊", "Fox"), ("🐺", "Wolf"), ("🦅", "Eagle"), ("🦉", "Owl"),
    ("🐬", "Dolphin"), ("🦌", "Deer"), ("🐯", "Tiger"), ("🐼", "Panda"),
    ("🦁", "Lion"), ("🐢", "Turtle"), ("🦫", "Beaver"), ("🦦", "Otter"),
    ("🐙", "Octopus"), ("🦋", "Butterfly"), ("🐝", "Bee"), ("🦜", "Parrot"),
    ("🐉", "Dragon"), ("🦓", "Zebra"), ("🦒", "Giraffe"), ("🐘", "Elephant"),
    ("🦏", "Rhino"), ("🐳", "Whale"), ("🦭", "Seal"), ("🦔", "Hedgehog"),
    ("🐿️", "Squirrel"), ("🦇", "Bat"), ("🐊", "Croc"), ("🦚", "Peacock"),
    ("🐧", "Penguin"), ("🦩", "Flamingo"),
]


def config_dir():
    """配置目录（尊重 XDG_CONFIG_HOME），存放 ai-log 永久设置。"""
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(base, "ai-log")


def config_path():
    return os.path.join(config_dir(), "config.json")


def cache_root():
    """未永久指定时的临时兜底目录（尊重 XDG_CACHE_HOME）。"""
    base = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    return os.path.join(base, "ai-log")


def load_config():
    """读配置文件；不存在 / 解析失败时返回空字典。"""
    p = config_path()
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_config(cfg):
    """把配置写回 config.json（自动建目录）。"""
    os.makedirs(config_dir(), exist_ok=True)
    with open(config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def resolve_root(cli_root):
    """按优先级解析保存目录，返回 (root 绝对路径, source)。

    source ∈ {"explicit", "config", "cache"}，供调用方判断是否已永久配置。
    """
    if cli_root:
        return os.path.abspath(os.path.expanduser(cli_root)), "explicit"
    cfg = load_config()
    if cfg.get("root"):
        return os.path.abspath(os.path.expanduser(cfg["root"])), "config"
    return cache_root(), "cache"


def session_codename(seed):
    """由会话种子确定性派生代号：emoji + 动物名 + 4位十六进制后缀。

    同一 seed 永远得到同一结果，不同 seed 几乎不重复；
    seed 为空（无会话环境变量）时退化为固定占位代号。
    """
    if not seed:
        return {"emoji": "🐾", "name": "Anon", "suffix": "0000"}
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    emoji, name = ANIMALS[int(digest[:8], 16) % len(ANIMALS)]
    return {"emoji": emoji, "name": name, "suffix": digest[8:12]}


def load_day(data_path):
    """读当天 data.json；不存在则返回空结构。"""
    if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"date": "", "entries": []}


def last_end_of_session(entries, codename_id):
    """取「同一会话」最后一条的结束时间；无则返回 None，使区间可跨会话重叠。"""
    for e in reversed(entries):
        if e.get("id") == codename_id:
            return e["end"]
    return None


def git_branch(cwd):
    """安全读取 cwd 所在仓库的当前分支名；非仓库 / 出错时返回空串。"""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=cwd, capture_output=True, text=True, timeout=2,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def secs_between(start, end):
    """同日 HH:MM:SS 之间的秒差（end 早于 start 时按 0 计）。"""
    fmt = lambda t: sum(int(x) * f for x, f in zip(t.split(":"), (3600, 60, 1)))
    return max(0, fmt(end) - fmt(start))


def render_html(day, html_path):
    """把当天数据注入模板生成 index.html；模板缺失则跳过（仅留 data.json）。"""
    if not os.path.exists(TEMPLATE):
        return False
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        tpl = f.read()
    payload = json.dumps(day, ensure_ascii=False)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(tpl.replace(DATA_TOKEN, payload))
    return True


def write_entry(root, summary, id_override):
    """把一条日志写入 <root>/{date}/ 下的 data.json，并刷新 index.html。

    返回 (会话代号字典, 会话 id, index.html 路径)，供调用方回显。
    """
    cn = session_codename(os.environ.get("CLAUDE_CODE_SESSION_ID"))
    if id_override:
        cn = {"emoji": "🔖", "name": id_override, "suffix": "0000"}
    codename_id = f"{cn['name']}-{cn['suffix']}"

    now = datetime.now()
    date_str = now.strftime(DATE_FMT)
    end_time = now.strftime(TIME_FMT)

    day_dir = os.path.join(root, date_str)
    os.makedirs(day_dir, exist_ok=True)
    data_path = os.path.join(day_dir, "data.json")
    html_path = os.path.join(day_dir, "index.html")

    day = load_day(data_path)
    day["date"] = date_str
    # 开始时间继承「本会话」上一条的结束时间 → 不同会话区间可重叠
    start_time = last_end_of_session(day["entries"], codename_id) or end_time

    cwd = os.getcwd()
    day["entries"].append({
        "seq": len(day["entries"]) + 1,           # 当天全局序号（记录顺序）
        "id": codename_id,
        "emoji": cn["emoji"],
        "name": cn["name"],
        "start": start_time,
        "end": end_time,
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "duration": secs_between(start_time, end_time),  # 本条耗时（秒）
        "cwd": cwd,
        "project": os.path.basename(cwd.rstrip("/")) or cwd,
        "branch": git_branch(cwd),
        "model": os.environ.get("ANTHROPIC_MODEL", ""),
        "summary": summary.strip(),
    })

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(day, f, ensure_ascii=False, indent=2)
    render_html(day, html_path)
    return cn, codename_id, html_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", default=None)
    parser.add_argument("--id", default=None, help="可选，手动覆盖会话代号 name")
    parser.add_argument("--root", default=None, help="本次保存目录（仅当次生效，不落盘）")
    parser.add_argument("--set-root", default=None, dest="set_root",
                        help="永久指定保存目录，写入 ~/.config/ai-log/config.json")
    parser.add_argument("--status", action="store_true",
                        help="输出当前 root 配置状态（JSON）后退出，不写日志")
    args = parser.parse_args()

    # --status：仅报告，不写日志。供调用方判断是否需要询问用户永久位置。
    if args.status:
        root, source = resolve_root(None)
        print(json.dumps({
            "configured": source == "config",   # 是否已永久指定
            "source": source,                    # config / cache（status 下不会是 explicit）
            "root": root,
            "config_path": config_path(),
        }, ensure_ascii=False))
        return

    # --set-root：把永久目录写入配置；后续若带 --summary 则用该目录立即记一条。
    chosen_root = None
    if args.set_root:
        chosen_root = os.path.abspath(os.path.expanduser(args.set_root))
        cfg = load_config()
        cfg["root"] = chosen_root
        save_config(cfg)
        print(f"📌 已永久指定日志保存目录：{chosen_root}")
        if args.summary is None:
            return

    if args.summary is None:
        parser.error("缺少 --summary（除非使用 --status 或仅 --set-root）")

    # 解析本次保存目录：--root / --set-root > config > cache 兜底
    root, source = resolve_root(args.root or chosen_root)
    cn, codename_id, html_path = write_entry(root, args.summary, args.id)

    print(f"✅ 日志已保存（{cn['emoji']} {codename_id}）-> {html_path}")
    if source == "cache":
        # 用了临时兜底目录，提示调用方下次仍可询问用户是否永久指定
        print(f"ℹ️ 当前为临时位置（未永久指定）：{root}", file=sys.stderr)


if __name__ == "__main__":
    main()
