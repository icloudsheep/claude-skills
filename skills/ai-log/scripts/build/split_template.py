#!/usr/bin/env python3
"""把 template.html 按行区间切分为 src/ 下的模块部件（一次性脚手架）。

设计原则——**纯行分区**：MANIFEST 把 1..N 行不重不漏地划给各部件，
切分只是按区间摘取连续行、不重排、不改字节。这样 build_template.py 顺序
拼接即可字节级还原 template.html（boundary 只决定模块化质量，不影响正确性）。

CSS/JS 模块文件是纯片段（不含 <style>/<script> 包裹标签）——包裹标签留在
HTML 外壳部件（shell_head / shell_mid / shell_tail）里，故拼接是纯粹的字符串相接。

用法：python3 build/split_template.py
产物：src/shell_head.html, src/css/*.css, src/shell_mid.html, src/js/*.js, src/shell_tail.html
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
TEMPLATE = os.path.join(SCRIPTS, "template.html")
SRC = os.path.join(SCRIPTS, "src")

# (相对 src 的输出路径, 起始行, 结束行)  —— 行号 1-based、闭区间，必须连续覆盖整个文件
MANIFEST = [
    ("shell_head.html",        1,   19),   # <!DOCTYPE> + 构建说明注释 + <head>…FOUC…<style>
    # ── CSS 模块（<style> 与 </style> 之间的纯片段）──
    ("css/01_theme_vars.css",  20,   93),  # :root 变量 + 明暗/风格三主题
    ("css/02_base_layout.css", 94,  121),  # reset + body flex + 非玻璃主题去磨砂
    ("css/03_background.css",  122, 148),  # 玻璃流动背景 + huewash 关键帧
    ("css/04_topbar_chip.css", 149, 175),  # 吸顶头部 + 会话图例胶囊
    ("css/05_toast.css",       176, 216),  # toast 通知系统
    ("css/06_ctxmenu.css",     217, 234),  # 右键上下文菜单
    ("css/07_modal.css",       235, 327),  # 模态框 + 关于弹窗 + 手风琴 + 编辑/预览
    ("css/08_timeline.css",    328, 383),  # 左侧泳道 + 节点 + 气泡 + 连接线
    ("css/09_detail.css",      384, 435),  # 右侧详情面板（box/标题/操作条/指标）
    ("css/10_markdown.css",    436, 469),  # markdown 排版 + mermaid + 公式
    ("css/11_footer.css",      470, 483),  # 页脚
    ("css/12_keyframes.css",   484, 489),  # 动画关键帧 + reduced-motion
    # ── HTML 外壳中段（</style>…</head><body>…资产引用…<script>）──
    ("shell_mid.html",         490, 512),
    # ── JS 模块（<script> 与 </script> 之间的纯片段）──
    ("js/01_constants_utils.js",    513,  546),  # DATA/PALETTE/几何常量 + esc/fmt 工具
    ("js/02_aliases.js",            547,  578),  # 会话别名软/硬两层
    ("js/03_edits.js",              579,  615),  # 条目本地编辑覆盖层 + 落盘命令
    ("js/04_markdown.js",           616,  679),  # mdInline + renderMd（含公式预处理）
    ("js/05_mermaid.js",            680,  726),  # mermaid 初始化与渲染
    ("js/06_katex.js",              727,  754),  # KaTeX 公式渲染
    ("js/07_build.js",              755,  865),  # META/SESSIONS/ENTRIES + build() 主构建
    ("js/08_menus.js",              866,  911),  # ACTIVE + openMenu/openChipMenu
    ("js/09_theme_page_menu.js",    912,  951),  # 主题切换 + 页面右键菜单
    ("js/10_fireworks_about.js",    952, 1144),  # 烟花特效 + 关于弹窗
    ("js/11_contextmenu_evt.js",   1145, 1164),  # 整页右键/关闭菜单事件绑定
    ("js/12_modals.js",            1165, 1275),  # 滚动锁定 + promptModal/editModal
    ("js/13_entry_actions.js",     1276, 1424),  # 编辑/删除/预览/重命名/节点菜单/确认框
    ("js/14_toast_update.js",      1425, 1478),  # showToast + checkUpdate
    ("js/15_timeline_interact.js", 1479, 1576),  # toggleSession/relayout/closeDetail/select
    ("js/16_node_tip.js",          1577, 1612),  # 节点悬停气泡
    ("js/17_link_footer.js",       1613, 1678),  # 连接线绘制/追踪 + 页脚 + syncTopbar
    ("js/18_init.js",              1679, 1686),  # 全局事件监听 + 初始化调用（必须最后）
    # ── HTML 外壳尾部（</script></body></html>）──
    ("shell_tail.html",           1687, 1689),
]


def main():
    with open(TEMPLATE, "r", encoding="utf-8") as f:
        lines = f.readlines()
    total = len(lines)

    # 校验 MANIFEST 连续、不重不漏地覆盖 1..total
    cursor = 1
    for rel, a, b in MANIFEST:
        if a != cursor:
            raise SystemExit(f"❌ 区间不连续：{rel} 起于 {a}，应为 {cursor}")
        if b < a:
            raise SystemExit(f"❌ 区间非法：{rel} {a}..{b}")
        cursor = b + 1
    if cursor != total + 1:
        raise SystemExit(f"❌ 未覆盖到文件末尾：止于 {cursor - 1}，文件共 {total} 行")

    for rel, a, b in MANIFEST:
        dst = os.path.join(SRC, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "w", encoding="utf-8") as f:
            f.writelines(lines[a - 1:b])

    print(f"✅ 已切分 {len(MANIFEST)} 个部件 -> {SRC}（覆盖 {total} 行，连续无缺漏）")


if __name__ == "__main__":
    main()
