"""配置文件与保存目录（root）解析。

保存目录优先级：--root 显式 > ~/.config/ai-log/config.json > 兜底 ~/.cache/ai-log。
在线提交目标（report_url）优先级：--report-url 显式 > 环境变量 AILOG_REPORT_URL > config.json。
~/.config 与 ~/.cache 分别尊重 XDG_CONFIG_HOME / XDG_CACHE_HOME 环境变量。
"""
import json
import os


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


# ── 在线提交目标（report_url）──
# 优先级：--report-url 显式 > 环境变量 AILOG_REPORT_URL > config.json 的 report_url > 空（不上报）
def resolve_report_url(cli_report_url=None):
    """按优先级解析在线提交目标 URL，返回字符串（可能为空）。

    只需填根地址，如 https://ailogy.example.com，不用精确到具体方法。
    空字符串表示不上报。
    """
    if cli_report_url:
        return cli_report_url.rstrip("/")
    env = os.environ.get("AILOG_REPORT_URL", "").strip()
    if env:
        return env.rstrip("/")
    cfg = load_config()
    cfg_val = (cfg.get("report_url") or "").strip()
    if cfg_val:
        return cfg_val.rstrip("/")
    return ""


# ── 设备名（device）──
# 优先级：环境变量 AILOG_DEVICE > config.json 的 device > 主机名兜底。
def resolve_device():
    """解析上报设备名。env > config > 主机名。"""
    env = os.environ.get("AILOG_DEVICE", "").strip()
    if env:
        return env
    cfg = load_config()
    v = (cfg.get("device") or "").strip()
    if v:
        return v
    import socket
    return (socket.gethostname() or "unknown").split(".")[0]

