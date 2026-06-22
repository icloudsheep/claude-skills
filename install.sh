#!/usr/bin/env bash
# 把本仓库的 skills 安装（软链）到 Claude Code 的 skills 目录。
#
# 用法:
#   ./install.sh            # 安装到 ~/.claude/skills
#   ./install.sh <目标目录>  # 安装到指定目录
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO_DIR/skills"
DEST="${1:-$HOME/.claude/skills}"

mkdir -p "$DEST"

for skill in "$SRC"/*/; do
  name="$(basename "$skill")"
  target="$DEST/$name"
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "跳过 $name：$target 已存在"
  else
    ln -s "$skill" "$target"
    echo "已链接 $name -> $target"
  fi
done

# ai-log 的脚本/模板随 skill 目录就地使用，保存目录由配置决定（首次运行时询问），
# 无需复制到任何固定路径。

echo "完成。"
