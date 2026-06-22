#!/usr/bin/env python3
"""AI 工作日志记录脚本（GitHub 可移植版）。

用法:
    # 记录一条日志（root 解析顺序见下）
    python3 ai_logger.py --summary "<总结正文>" [--title "<标题, ≤30字>"] [--id "<可选会话名>"] [--root <本次保存目录>]

    # 永久指定保存目录（写入配置后退出；可同时带 --summary 立即记一条）
    python3 ai_logger.py --set-root <目录> [--summary "..."]

    # 查询当前配置状态（输出 JSON，供调用方判断是否需要询问用户），不写日志
    python3 ai_logger.py --status

    # 永久重命名会话：写 <root>/aliases.json 并重渲染所有日期 HTML（传空名清除）
    python3 ai_logger.py --rename "Fox-3f2a" "重构专项"

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
    跨午夜：当天本会话无记录、但更早日期里有本会话尾巴时，新一天首条继承昨日
    结束时间为起点、时长按真实跨日计算，并写入 carryover 标注「前一部分在上一日」。

产物（按天一个目录 <root>/{YYYY-MM-DD}/）:
    data.json   —— 结构化数据真源（脚本读写），条目含 usage(token/轮数) 等字段
    data.js     —— 当天数据的 JS 资产（window.AILOG_DATA），供 index.html <script src> 加载
    index.html  —— 纯静态模板（同 template.html），运行时读 ./data.js 与 ../aliases.js 渲染
另有 <root>/aliases.json + aliases.js —— 跨所有日期共享的会话别名（真源 + JS 资产），由 --rename 维护
    数据走外部 JS 资产（file:// 下 <script src> 不受 CORS 限制），故改别名只重写 aliases.js
    一个文件，所有日期页面刷新即生效，无需重渲染 HTML。

token / 轮数:
    据 CLAUDE_CODE_SESSION_ID 定位会话 transcript（~/.claude/projects/*/<id>.jsonl），
    统计「本会话上一条记录之后到现在」分段的 input/output/cache tokens、对话轮数与
    API 调用数，写入条目 usage 字段；transcript 不可用时省略该字段。
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

DATE_FMT = "%Y-%m-%d"
TIME_FMT = "%H:%M:%S"
# 模板与脚本同目录，随仓库一起分发，不依赖任何外部固定路径
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html")
# mermaid 库本地副本（随 skill 分发）：渲染时拷到 root 根，所有日期页面共享引用
# ../mermaid.min.js，离线断网也能画图；缺失时模板回退 CDN。
MERMAID_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mermaid.min.js")
# 数据以独立 JS 资产加载（file:// 下 <script src> 经典脚本不受 CORS 限制）：
# 当天数据 → 同目录 data.js；会话别名 → root 根 aliases.js（所有日期页面共享引用 ../aliases.js）。
# 故改别名只需重写一个 aliases.js，所有 index.html 刷新即生效，无需重渲染。
DATA_JS_GLOBAL = "window.AILOG_DATA"
ALIASES_JS_GLOBAL = "window.AILOG_ALIASES"
# Claude Code 会话 transcript 根目录（每会话一个 <session-id>.jsonl）
PROJECTS_DIR = os.path.expanduser("~/.claude/projects")

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


def find_prev_day_with_session(root, today_str, codename_id):
    """跨午夜检测：在 root 下早于 today 的日期目录里，倒序找本会话最后一条。

    用于「同一会话上一条落在前一天」的情形：返回该条所在日期与结束时间，
    供新一天首条继承起点、并标注 carryover。找不到返回 (None, None)。
    """
    if not os.path.isdir(root):
        return None, None
    # 收集形如 YYYY-MM-DD 且严格早于今天的目录，按日期倒序
    day_dirs = []
    for name in os.listdir(root):
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", name) and name < today_str:
            day_dirs.append(name)
    for date_str in sorted(day_dirs, reverse=True):
        data_path = os.path.join(root, date_str, "data.json")
        if not os.path.exists(data_path):
            continue
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                day = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        prev_end = last_end_of_session(day.get("entries", []), codename_id)
        if prev_end is not None:
            return date_str, prev_end
    return None, None


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


def find_transcript(session_id):
    """按 session_id 在 ~/.claude/projects 下定位会话 transcript 文件（.jsonl）。"""
    if not session_id or not os.path.isdir(PROJECTS_DIR):
        return None
    target = session_id + ".jsonl"
    for dirpath, _dirs, files in os.walk(PROJECTS_DIR):
        if target in files:
            return os.path.join(dirpath, target)
    return None


def _is_real_user_turn(row):
    """判断一条 transcript 记录是否为「用户真实提问」（排除工具结果回灌）。"""
    if row.get("type") != "user":
        return False
    msg = row.get("message") or {}
    if msg.get("role") != "user":
        return False
    content = msg.get("content")
    if isinstance(content, list):
        # 全是 tool_result 的不算一轮新提问
        return not all(
            isinstance(x, dict) and x.get("type") == "tool_result" for x in content
        )
    return bool(content)


def _local_naive(iso_ts):
    """把 transcript 的 ISO 时间戳（多为 UTC，带 Z）转成本地无时区 datetime。"""
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def usage_since(session_id, start_dt, end_dt):
    """统计 transcript 中 (start_dt, end_dt] 区间内本段的 token 与轮数（分段增量）。

    start_dt/end_dt 为本地无时区 datetime；start_dt 为 None 表示从会话起点算。
    返回字段全为整数的字典；transcript 不可用时返回空字典（调用方据此跳过）。
    """
    path = find_transcript(session_id)
    if not path:
        return {}
    agg = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
           "turns": 0, "api_calls": 0}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts = _local_naive(row.get("timestamp", ""))
                # 无时间戳的元数据行跳过；区间为左开右闭，归属「本段」
                if ts is None or ts > end_dt or (start_dt is not None and ts <= start_dt):
                    continue
                if _is_real_user_turn(row):
                    agg["turns"] += 1
                msg = row.get("message") or {}
                u = msg.get("usage") or {}
                if u:
                    agg["api_calls"] += 1
                    agg["input"] += u.get("input_tokens", 0) or 0
                    agg["output"] += u.get("output_tokens", 0) or 0
                    agg["cache_read"] += u.get("cache_read_input_tokens", 0) or 0
                    agg["cache_write"] += u.get("cache_creation_input_tokens", 0) or 0
    except OSError:
        return {}
    return agg


def aliases_path(root):
    """会话别名底稿（数据真源，人读/可编辑）：root 下跨所有日期共享的 aliases.json。"""
    return os.path.join(root, "aliases.json")


def aliases_js_path(root):
    """别名的 JS 资产：root 下 aliases.js，被所有日期页面以 ../aliases.js 引用。"""
    return os.path.join(root, "aliases.js")


def load_aliases(root):
    """读 root 下的 aliases.json（{会话id: 自定义名}）；不存在/损坏返回空字典。"""
    p = aliases_path(root)
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def write_aliases_js(root):
    """据 aliases.json 写出 aliases.js（window.AILOG_ALIASES=...）。

    所有日期页面共享引用 ../aliases.js，故改别名只重写此一个文件即全局生效，
    无需重渲染任何 index.html。
    """
    al = load_aliases(root)
    payload = json.dumps(al, ensure_ascii=False)
    with open(aliases_js_path(root), "w", encoding="utf-8") as f:
        f.write(f"{ALIASES_JS_GLOBAL} = {payload};\n")


def save_alias(root, codename_id, alias):
    """把单个会话别名写入/删除 aliases.json 并同步刷新 aliases.js（alias 空则删除该项）。"""
    al = load_aliases(root)
    if alias:
        al[codename_id] = alias
    else:
        al.pop(codename_id, None)
    with open(aliases_path(root), "w", encoding="utf-8") as f:
        json.dump(al, f, ensure_ascii=False, indent=2)
    write_aliases_js(root)


def rerender_all_days(root):
    """重写 root 下所有日期目录的 data.js 与 index.html（模板升级时用）。

    日常改别名无需调用此函数（save_alias 已自动刷新 aliases.js 即全局生效）；
    仅当模板本身变化、需要把新模板铺到历史页面时才全量重渲染。
    """
    if not os.path.isdir(root):
        return 0
    n = 0
    for name in sorted(os.listdir(root)):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", name):
            continue
        data_path = os.path.join(root, name, "data.json")
        if not os.path.exists(data_path):
            continue
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                day = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        if render_html(day, os.path.join(root, name, "index.html"), root):
            n += 1
    return n


def secs_between(start, end, cross_days=0):
    """HH:MM:SS 之间的秒差；cross_days 为跨越的天数（end 比 start 晚多少天）。

    同日且 end 早于 start 时按 0 计；跨日时把 cross_days*86400 计入，
    用于「上一条落在前一天、本条接续到今天」的真实时长。
    """
    fmt = lambda t: sum(int(x) * f for x, f in zip(t.split(":"), (3600, 60, 1)))
    return max(0, fmt(end) - fmt(start) + cross_days * 86400)


def days_between(date_a, date_b):
    """两个 YYYY-MM-DD 之间相差的天数（date_b - date_a），解析失败返回 0。"""
    try:
        da = datetime.strptime(date_a, DATE_FMT)
        db = datetime.strptime(date_b, DATE_FMT)
        return (db - da).days
    except ValueError:
        return 0


def _prev_entry_datetime(today_entries, codename_id, root, today_str):
    """本会话上一条记录的完整 datetime（用于 token/轮数分段游标）。

    先看当天本会话上一条；当天没有则回溯更早日期的最后一条。
    返回本地无时区 datetime；本会话尚无任何历史记录时返回 None（从会话起点统计）。
    """
    # 当天本会话最后一条
    for e in reversed(today_entries):
        if e.get("id") == codename_id and e.get("datetime"):
            try:
                return datetime.strptime(e["datetime"], "%Y-%m-%d %H:%M:%S")
            except ValueError:
                return None
    # 当天无 → 回溯更早日期
    if os.path.isdir(root):
        days = [n for n in os.listdir(root)
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", n) and n < today_str]
        for date_str in sorted(days, reverse=True):
            data_path = os.path.join(root, date_str, "data.json")
            if not os.path.exists(data_path):
                continue
            try:
                with open(data_path, "r", encoding="utf-8") as f:
                    day = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            for e in reversed(day.get("entries", [])):
                if e.get("id") == codename_id and e.get("datetime"):
                    try:
                        return datetime.strptime(e["datetime"], "%Y-%m-%d %H:%M:%S")
                    except ValueError:
                        return None
    return None


def render_html(day, html_path, root=None):
    """生成当天 index.html（纯静态模板）+ 同目录 data.js（当天数据），并刷新 root/aliases.js。

    数据走外部 JS 资产而非内联注入：file:// 下 <script src> 经典脚本不受 CORS 限制，
    页面运行时自行读取 window.AILOG_DATA / AILOG_ALIASES。改别名只需重写 aliases.js，
    所有日期页面刷新即生效，无需重渲染 HTML。模板缺失则跳过（仅留 data.json）。
    """
    if not os.path.exists(TEMPLATE):
        return False
    # 1) 当天数据资产 data.js（与 index.html 同目录）
    day_dir = os.path.dirname(html_path)
    payload = json.dumps(day, ensure_ascii=False)
    with open(os.path.join(day_dir, "data.js"), "w", encoding="utf-8") as f:
        f.write(f"{DATA_JS_GLOBAL} = {payload};\n")
    # 2) 静态模板原样写出（数据/别名由页面内 <script src> 自行加载）
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        tpl = f.read()
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(tpl)
    # 3) 全局别名资产 aliases.js（root 根，所有日期共享 ../aliases.js）
    if root is not None:
        write_aliases_js(root)
        ensure_mermaid(root)
    return True


def ensure_mermaid(root):
    """把本地 mermaid 库副本放到 root 根（缺失或体积不符才拷），供 ../mermaid.min.js 引用。"""
    if not os.path.exists(MERMAID_SRC):
        return
    dst = os.path.join(root, "mermaid.min.js")
    try:
        if os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(MERMAID_SRC):
            return  # 已是同一份，免重复拷贝
        import shutil
        shutil.copyfile(MERMAID_SRC, dst)
    except OSError:
        pass


def write_entry(root, summary, title, id_override):
    """把一条日志写入 <root>/{date}/ 下的 data.json，并刷新 index.html。

    返回 (会话代号字典, 会话 id, index.html 路径)，供调用方回显。
    跨午夜接续：本会话当天无记录、但更早日期里有，则起点继承昨日结束时间、
    时长按真实跨日计算，并写入 carryover 元信息供 UI 标注「前一部分在上一日」。
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

    # 起点解析：优先继承「本会话」当天上一条的结束时间（同日，cross_days=0）
    start_time = last_end_of_session(day["entries"], codename_id)
    cross_days = 0
    carryover = None
    if start_time is None:
        # 当天本会话无记录 → 看更早日期是否有本会话尾巴（跨午夜接续）
        prev_date, prev_end = find_prev_day_with_session(root, date_str, codename_id)
        if prev_end is not None:
            start_time = prev_end
            cross_days = days_between(prev_date, date_str)
            carryover = {"prev_date": prev_date, "prev_end": prev_end}
        else:
            start_time = end_time  # 全新会话首条：0 时长起点

    cwd = os.getcwd()
    entry = {
        "seq": len(day["entries"]) + 1,           # 当天全局序号（记录顺序）
        "id": codename_id,
        "emoji": cn["emoji"],
        "name": cn["name"],
        "title": (title or "").strip(),
        "start": start_time,
        "end": end_time,
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "duration": secs_between(start_time, end_time, cross_days),  # 本条耗时（秒，含跨日）
        "cwd": cwd,
        "project": os.path.basename(cwd.rstrip("/")) or cwd,
        "branch": git_branch(cwd),
        "model": os.environ.get("ANTHROPIC_MODEL", ""),
        "summary": summary.strip(),
    }
    if carryover:
        entry["carryover"] = carryover  # 标注：本会话前一部分在 prev_date

    # 分段 token / 轮数：统计「本会话上一条记录之后」到现在的 transcript 增量
    prev_dt = _prev_entry_datetime(day["entries"], codename_id, root, date_str)
    stats = usage_since(os.environ.get("CLAUDE_CODE_SESSION_ID"), prev_dt, now)
    if stats:
        entry["usage"] = stats  # input/output/cache_read/cache_write/turns/api_calls

    day["entries"].append(entry)

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(day, f, ensure_ascii=False, indent=2)
    render_html(day, html_path, root)
    return cn, codename_id, html_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", default=None)
    parser.add_argument("--title", default=None,
                        help="本条日志标题（建议 ≤30 字），在网页详情面板顶部单独展示")
    parser.add_argument("--id", default=None, help="可选，手动覆盖会话代号 name")
    parser.add_argument("--root", default=None, help="本次保存目录（仅当次生效，不落盘）")
    parser.add_argument("--set-root", default=None, dest="set_root",
                        help="永久指定保存目录，写入 ~/.config/ai-log/config.json")
    parser.add_argument("--status", action="store_true",
                        help="输出当前 root 配置状态（JSON）后退出，不写日志")
    parser.add_argument("--rename", nargs=2, metavar=("会话ID", "自定义名"),
                        default=None,
                        help="把会话 ID（如 Fox-3f2a）永久重命名为自定义名，写入"
                             " <root>/aliases.json 并重渲染所有日期 HTML；传空名清除别名")
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

    # --rename：固化会话别名到 aliases.json 并刷新 aliases.js（所有日期页面刷新即生效，无需重渲染）。
    if args.rename is not None:
        root, _src = resolve_root(args.root)
        cid, alias = args.rename[0].strip(), args.rename[1].strip()
        save_alias(root, cid, alias)
        verb = f"重命名为「{alias}」" if alias else "清除别名"
        print(f"🏷️ 会话 {cid} 已{verb} -> {aliases_js_path(root)}（刷新页面即生效）")
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
    cn, codename_id, html_path = write_entry(root, args.summary, args.title, args.id)

    print(f"✅ 日志已保存（{cn['emoji']} {codename_id}）-> {html_path}")
    if source == "cache":
        # 用了临时兜底目录，提示调用方下次仍可询问用户是否永久指定
        print(f"ℹ️ 当前为临时位置（未永久指定）：{root}", file=sys.stderr)


if __name__ == "__main__":
    main()
