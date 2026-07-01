#!/usr/bin/env python3
"""从 src/ 部件拼装出 template.html（单文件自包含产物）。

template.html 是构建产物，不应手改——改源码请改 src/ 下对应部件后重跑本脚本。
ai_logger.py 渲染时仍读 template.html 原样铺到各日 index.html，故产物零行为变化。

拼装即纯顺序相接：BUILD_ORDER 列出部件相对路径，CSS/JS 模块是不含包裹标签的
纯片段，<style>/<script> 包裹标签已包含在 shell_head/shell_mid 部件内。
顺序对 JS 至关重要——底部 init 部件（含 build()/applyTheme() 调用）必须最后。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
SRC = os.path.join(SCRIPTS, "src")
OUT = os.path.join(SCRIPTS, "template.html")

# 拼装顺序：外壳头 → CSS 模块 → 外壳中段 → JS 模块 → 外壳尾
BUILD_ORDER = [
    "shell_head.html",
    "css/01_theme_vars.css",
    "css/02_base_layout.css",
    "css/03_background.css",
    "css/04_topbar_chip.css",
    "css/05_toast.css",
    "css/06_ctxmenu.css",
    "css/07_modal.css",
    "css/08_timeline.css",
    "css/09_detail.css",
    "css/10_markdown.css",
    "css/11_footer.css",
    "css/12_keyframes.css",
    "css/13_search.css",
    "shell_mid.html",
    "js/01_constants_utils.js",
    "js/02_aliases.js",
    "js/03_edits.js",
    "js/04_markdown.js",
    "js/05_mermaid.js",
    "js/06_katex.js",
    "js/07_build.js",
    "js/08_menus.js",
    "js/09_theme_page_menu.js",
    "js/10_fireworks_about.js",
    "js/11_contextmenu_evt.js",
    "js/12_modals.js",
    "js/13_entry_actions.js",
    "js/14_toast_update.js",
    "js/15_timeline_interact.js",
    "js/16_node_tip.js",
    "js/17_link_footer.js",
    "js/19_search.js",
    "js/18_init.js",
    "shell_tail.html",
]


def build():
    parts = []
    for rel in BUILD_ORDER:
        path = os.path.join(SRC, rel)
        if not os.path.exists(path):
            raise SystemExit(f"❌ 缺少部件：{rel}")
        with open(path, "r", encoding="utf-8") as f:
            parts.append(f.read())
    html = "".join(parts)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"✅ 已从 {len(BUILD_ORDER)} 个部件拼出 {OUT}（{len(html)} 字节）")


if __name__ == "__main__":
    build()
