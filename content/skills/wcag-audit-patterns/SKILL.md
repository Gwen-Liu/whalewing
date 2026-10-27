---
name: wcag-audit-patterns
description: 按 WCAG 2.2 逐条审计网页无障碍时使用：A／AA 级成功准则核对清单、axe 和 Playwright 自动检查、按影响分级的问题和修复写法。
---

# WCAG Audit Patterns

Comprehensive guide to auditing web content against WCAG 2.2 guidelines with actionable remediation strategies.

## When to Use This Skill

- Conducting accessibility audits
- Fixing WCAG violations
- Implementing accessible components
- Preparing for accessibility lawsuits
- Meeting ADA/Section 508 requirements
- Achieving VPAT compliance

## Core Concepts

### 1. WCAG Conformance Levels

| Level   | Description            | Required For      |
| ------- | ---------------------- | ----------------- |
| **A**   | Minimum accessibility  | Legal baseline    |
| **AA**  | Standard conformance   | Most regulations  |
| **AAA** | Enhanced accessibility | Specialized needs |

### 2. POUR Principles

```
Perceivable:  Can users perceive the content?
Operable:     Can users operate the interface?
Understandable: Can users understand the content?
Robust:       Does it work with assistive tech?
```

### 3. Common Violations by Impact

```
Critical (Blockers):
├── Missing alt text for functional images
├── No keyboard access to interactive elements
├── Missing form labels
└── Auto-playing media without controls

Serious:
├── Insufficient color contrast
├── Missing skip links
├── Inaccessible custom widgets
└── Missing page titles

Moderate:
├── Missing language attribute
├── Unclear link text
├── Missing landmarks
└── Improper heading hierarchy
```

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.

## Best Practices

### Do's

- **Start early** - Accessibility from design phase
- **Test with real users** - Disabled users provide best feedback
- **Automate what you can** - 30-50% issues detectable
- **Use semantic HTML** - Reduces ARIA needs
- **Document patterns** - Build accessible component library

### Don'ts

- **Don't rely only on automated testing** - Manual testing required
- **Don't use ARIA as first solution** - Native HTML first
- **Don't hide focus outlines** - Keyboard users need them
- **Don't disable zoom** - Users need to resize
- **Don't use color alone** - Multiple indicators needed

## 来源

收录自 [wshobson/agents](https://github.com/wshobson/agents/tree/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/accessibility-compliance/skills/wcag-audit-patterns)（提交 `0874a27b17a22e2b7c2e2bcd725768e0803cad06`，路径 `plugins/accessibility-compliance/skills/wcag-audit-patterns`），MIT 许可，全文见同目录 `LICENSE.txt`。正文保留上游原文；鲸翼的改动：技能说明换成中文；统一为 UTF-8、LF 换行并去掉行尾空格。
