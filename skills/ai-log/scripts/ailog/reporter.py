"""带可选的在线提交：把日志条目 POST 到 Ailogy 后端。

与保存目录（root）管理模式一致：
- 提交目标（report_url）写入 config.json 的 "report_url" 字段，由 --set-report-url 设置
- 环境变量 AILOG_REPORT_URL 优先级高于配置文件
- 兜底为空字符串，即不上报

触发条件：
- 用户明确说「双提交」「在线提交」，或 CLI 收到 --report 参数
- 未配置 report_url 时有 --report 会提示未配置，但不阻断本地写入

失败不阻断本地写入，只打印 warning。
"""
import json
import urllib.request

TIMEOUT = 8  # 秒


def report_entry(report_url: str, entry_dict: dict) -> bool:
    """把一条 entry POST 到 Ailogy 后端的 /api/ingest/entries。

    report_url 形如 https://ailogy.example.com（不含尾部方法路径）。

    返回 True 表示上报成功；False 表示未配置或失败（本地已保存，上报是尽力而为）。
    """
    if not report_url:
        return False
    url = report_url.rstrip("/") + "/api/ingest/entries"
    body = json.dumps(entry_dict, ensure_ascii=False).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json",
        }, method="POST")
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"⚠️ 在线提交失败（本地已保存）：{e}")
        return False
