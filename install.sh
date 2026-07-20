#!/usr/bin/env bash
# 把同一份 skills 软链到 Claude Code、Codex 或自定义目录。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO_DIR/skills"

usage() {
  cat <<'EOF'
用法：
  ./install.sh                         # 同时安装到 Claude Code 与 Codex
  ./install.sh --platform claude       # ~/.claude/skills
  ./install.sh --platform codex        # ${CODEX_HOME:-~/.codex}/skills
  ./install.sh --platform all          # 同时安装（默认）
  ./install.sh --target <目录>         # 安装到一个自定义目录
  ./install.sh <目录>                  # 兼容旧版的自定义目录写法
EOF
}

link_into() {
  local dest="$1"
  mkdir -p "$dest"
  for skill in "$SRC"/*/; do
    local name target
    name="$(basename "$skill")"
    target="$dest/$name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "跳过 ${name}：${target} 是真实文件/目录（非软链），未覆盖"
    else
      ln -sfn "$skill" "$target"
      echo "已链接 $name -> $target"
    fi
  done
}

platform="all"
target=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --platform)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      platform="$2"; shift 2 ;;
    --target)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      target="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    *)
      [ -z "$target" ] || { echo "只能指定一个自定义目录" >&2; exit 2; }
      target="$1"; shift ;;
  esac
done

if [ -n "$target" ]; then
  link_into "$target"
elif [ "$platform" = "claude" ]; then
  link_into "$HOME/.claude/skills"
elif [ "$platform" = "codex" ]; then
  link_into "${CODEX_HOME:-$HOME/.codex}/skills"
elif [ "$platform" = "all" ]; then
  link_into "$HOME/.claude/skills"
  link_into "${CODEX_HOME:-$HOME/.codex}/skills"
else
  echo "--platform 仅支持 all、claude、codex" >&2
  exit 2
fi

echo "完成。"
