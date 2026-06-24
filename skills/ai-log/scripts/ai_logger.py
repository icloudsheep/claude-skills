#!/usr/bin/env python3
"""AI 工作日志记录脚本（薄入口）。

实际逻辑在同目录的 ailog/ 包内，本文件仅作为命令行入口：
被 `python3 ai_logger.py ...` 直接调用时，确保脚本所在目录在 sys.path 上，
再委托给 ailog.cli.main()。详细用法见 ailog/cli.py 的模块文档。

之所以保留本文件作为入口（而非直接暴露包），是因为 skill 文档与网页里打印的
命令路径都是 <skill>/scripts/ai_logger.py，保持入口稳定即向后兼容。
"""
import os
import sys

# 直接以脚本方式运行时，__package__ 为空，需手动把脚本目录加入 sys.path 才能 import ailog
if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ailog.cli import main

if __name__ == "__main__":
    main()
