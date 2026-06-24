"""data.json 读写、时间线计算、跨午夜接续、日期目录遍历。

本模块只读写「按天目录」数据真源，不涉及 HTML 渲染（见 render）。
"""
import json
import os
import re
from datetime import datetime

DATE_FMT = "%Y-%m-%d"
TIME_FMT = "%H:%M:%S"


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
