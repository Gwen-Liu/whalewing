---
name: ab-test-analysis
description: 分析 A/B 测试结果时使用：检查样本量、测试时长和分流是否异常（SRM），算转化率差异的显著性和置信区间，看护栏指标，给出上线、延长、停止或排查的建议。
---

## A/B Test Analysis

Evaluate A/B test results with statistical rigor and translate findings into clear product decisions.

### Context

You are analyzing A/B test results for **the user's request**.

If the user provides data files (CSV, Excel, or analytics exports), read and analyze them directly. Generate Python scripts for statistical calculations when needed.

### Instructions

1. **Understand the experiment**:
   - What was the hypothesis?
   - What was changed (the variant)?
   - What is the primary metric? Any guardrail metrics?
   - How long did the test run?
   - What is the traffic split?

2. **Validate the test setup**:
   - **Sample size**: Is the sample large enough for the expected effect size?
     - Use the formula: n per group = ((Zα/2 + Zβ)² × 2 × p × (1-p)) / MDE² (Zα/2 = 1.96 for 95% confidence, Zβ = 0.84 for 80% power, MDE as an absolute difference)
     - Flag if the test is underpowered (<80% power)
   - **Duration**: Did the test run for at least 1-2 full business cycles?
   - **Randomization**: Any evidence of sample ratio mismatch (SRM)?
   - **Novelty/primacy effects**: Was there enough time to wash out initial behavior changes?

3. **Calculate statistical significance**:
   - **Conversion rate** for control and variant
   - **Relative lift**: (variant - control) / control × 100
   - **p-value**: Using a two-tailed z-test or chi-squared test
   - **Confidence interval**: 95% CI for the difference
   - **Statistical significance**: Is p < 0.05?
   - **Practical significance**: Is the lift meaningful for the business?

   If the user provides raw data, generate and run a Python script to calculate these.

4. **Check guardrail metrics**:
   - Did any guardrail metrics (revenue, engagement, page load time) degrade?
   - A winning primary metric with degraded guardrails may not be a true win

5. **Interpret results**:

   | Outcome | Recommendation |
   |---|---|
   | Significant positive lift, no guardrail issues | **Ship it** — roll out to 100% |
   | Significant positive lift, guardrail concerns | **Investigate** — understand trade-offs before shipping |
   | Not significant, positive trend | **Extend the test** — need more data or larger effect |
   | Not significant, flat | **Stop the test** — no meaningful difference detected |
   | Significant negative lift | **Don't ship** — revert to control, analyze why |

6. **Provide the analysis summary**:
   ```
   ## A/B Test Results: [Test Name]

   **Hypothesis**: [What we expected]
   **Duration**: [X days] | **Sample**: [N control / M variant]

   | Metric | Control | Variant | Lift | p-value | Significant? |
   |---|---|---|---|---|---|
   | [Primary] | X% | Y% | +Z% | 0.0X | Yes/No |
   | [Guardrail] | ... | ... | ... | ... | ... |

   **Recommendation**: [Ship / Extend / Stop / Investigate]
   **Reasoning**: [Why]
   **Next steps**: [What to do]
   ```

Think step by step. Save as markdown. Generate Python scripts for calculations if raw data is provided.

---

### Further Reading

- [A/B Testing 101 + Examples](https://www.productcompass.pm/p/ab-testing-101-for-pms)
- [Testing Product Ideas: The Ultimate Validation Experiments Library](https://www.productcompass.pm/p/the-ultimate-experiments-library)
- [Are You Tracking the Right Metrics?](https://www.productcompass.pm/p/are-you-tracking-the-right-metrics)

## 来源

收录自 [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-data-analytics/skills/ab-test-analysis)（提交 `07b34f64ee828df08953f505b7f747aef85ae7c6`，路径 `pm-data-analytics/skills/ab-test-analysis`），MIT 许可，全文见同目录 `LICENSE.txt`。正文保留上游原文；鲸翼的改动：技能说明换成中文；统一为 UTF-8、LF 换行并去掉行尾空格；正文里 Claude Code 的命令参数占位 `$ARGUMENTS` 改成 the user's request（DSH 加载技能时不做这种替换）；原文的样本量公式漏了检验功效项 Zβ，算出的只是约 50% 功效下的样本量，补成每组、80% 功效的标准写法。
