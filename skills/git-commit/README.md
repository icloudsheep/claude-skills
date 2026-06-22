# git-commit

Git 提交规范 skill。基于 [Conventional Commits](https://www.conventionalcommits.org)，结合实际仓库习惯整理，让提交历史可读、可检索、可追溯。

## 适用场景

写 commit message、建分支、推送代码前触发。

## 要点速览

- **结构**：`<type>: <subject>` + 空行 + `body` + 空行 + `footer`。
- **type**：`fix` / `feat` / `test` / `refactor` / `perf` / `style` / `docs` / `chore` / `build` / `ci` / `revert`。
- **subject**：动词开头祈使句，一句话说清一件事，结尾不加句号。
- **body**：重点回答「为什么改」，而非罗列「改了什么」。
- **提交实务**：多行 / 含中文标点的 message 用 `git commit -F 文件` 提交，避免 shell 截断；提交后 `git log -1 --format='%B'` 核验。
- **暂存**：精确 `git add`，勿用 `git add .`。
- **安全**：`--amend` 仅限未推送的自己的提交；强推用 `--force-with-lease`；不直接推 master。

完整规范见 [`SKILL.md`](SKILL.md)。
