---
name: bash-defensive-patterns
description: 编写可靠的 Bash 脚本时使用：严格模式、引号和变量、错误处理、清理、幂等和可移植性。
---

# Bash Defensive Patterns

Comprehensive guidance for writing production-ready Bash scripts using defensive programming techniques, error handling, and safety best practices to prevent common pitfalls and ensure reliability.

## When to Use This Skill

- Writing production automation scripts
- Building CI/CD pipeline scripts
- Creating system administration utilities
- Developing error-resilient deployment automation
- Writing scripts that must handle edge cases safely
- Building maintainable shell script libraries
- Implementing comprehensive logging and monitoring
- Creating scripts that must work across different platforms

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.

## Best Practices Summary

1. **Always use strict mode** - `set -Eeuo pipefail`
2. **Quote all variables** - `"$variable"` prevents word splitting
3. **Use [[]] conditionals** - More robust than [ ]
4. **Implement error trapping** - Catch and handle errors gracefully
5. **Validate all inputs** - Check file existence, permissions, formats
6. **Use functions for reusability** - Prefix with meaningful names
7. **Implement structured logging** - Include timestamps and levels
8. **Support dry-run mode** - Allow users to preview changes
9. **Handle temporary files safely** - Use mktemp, cleanup with trap
10. **Design for idempotency** - Scripts should be safe to rerun
11. **Document requirements** - List dependencies and minimum versions
12. **Test error paths** - Ensure error handling works correctly
13. **Use `command -v`** - Safer than `which` for checking executables
14. **Prefer printf over echo** - More predictable across systems

## 来源

收录自 [wshobson/agents](https://github.com/wshobson/agents/tree/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/shell-scripting/skills/bash-defensive-patterns)（提交 `0874a27b17a22e2b7c2e2bcd725768e0803cad06`，路径 `plugins/shell-scripting/skills/bash-defensive-patterns`），MIT 许可，全文见同目录 `LICENSE.txt`。正文保留上游原文；鲸翼的改动：技能说明换成中文；统一为 UTF-8、LF 换行并去掉行尾空格。
