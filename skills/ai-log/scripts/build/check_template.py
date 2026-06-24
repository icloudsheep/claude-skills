#!/usr/bin/env python3
"""校验 src/ 部件与 template.html 产物一致（构建不变量守卫）。

历史职责：本脚本最初是一次性脚手架，按行区间把单文件 template.html 切成 src/ 部件。
切分完成后，src/ 即成为唯一源码真源，template.html 改由 build_template.py 拼装。
继续维护一份硬编码行号的 MANIFEST 会随每次源码改动而漂移，是维护陷阱，故撤除。

现职责：守卫「build(src/) 字节级等于 template.html」这个真正要紧的不变量——
CI / 提交前跑一次即可发现「改了 src 忘了 build」或「手改了产物」。

用法：python3 build/check_template.py   （退出码 0=一致，1=不一致）
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
TEMPLATE = os.path.join(SCRIPTS, "template.html")


def main():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "build_template", os.path.join(HERE, "build_template.py"))
    bt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bt)

    # 按 build 顺序拼接 src/ 部件（与 build_template.build 同逻辑，但不落盘）
    parts = []
    for rel in bt.BUILD_ORDER:
        path = os.path.join(bt.SRC, rel)
        if not os.path.exists(path):
            raise SystemExit(f"❌ 缺少部件：{rel}")
        with io.open(path, "r", encoding="utf-8") as f:
            parts.append(f.read())
    built = "".join(parts)

    with io.open(TEMPLATE, "r", encoding="utf-8") as f:
        current = f.read()

    if built == current:
        print(f"✅ src/ 与 template.html 一致（{len(current)} 字节）")
        return
    print("❌ src/ 拼装结果与 template.html 不一致——"
          "请运行 build/build_template.py 重新生成产物，或检查是否手改了产物。")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
