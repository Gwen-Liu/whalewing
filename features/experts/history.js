/**
 * 修复前各版内置专家的原版（2026-10-11 至 2026-10-24 的 20 次提交，含改名鲸翼之前的版本），只用来推断旧记录里哪些字段员工没改过。
 * 修复前员工第一次编辑就把整份原版拷进记录，记录里看不出改了什么；与任一版原版相同的字段视为没改。
 * 修复后的记录另存了保存时原版的指纹（见 store.js），所以本表固定不变，以后改专家内容不用更新它。
 * rows 每行是“名称 介绍 提示词 的指纹 + 默认技能序号”（- 表示改名前的技能名，迁移时已换成新名，不参与比较），指纹算法同 store.js 的 fingerprint。
 */
export const originHistory = {
  manager: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-writing","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-writing","office","whalewing-plugin-management"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-writing","office","whalewing-plugin-management","obsidian-markdown","obsidian-bases","json-canvas"],
    ],
    rows: [
      'WaBPLYU6iyMb-_SF pX6XnlXeLKevy5jZ 0N6qJvhL8Alm33r6 -',
      'WaBPLYU6iyMb-_SF yucxPXisN4snpu8k kUbMvlVTSNv7QvxM -',
      'IcrHV6XdzJMwDt-s yucxPXisN4snpu8k weVKHrpHcTwqW7n4 0',
      'IcrHV6XdzJMwDt-s yucxPXisN4snpu8k weVKHrpHcTwqW7n4 1',
      'IcrHV6XdzJMwDt-s yucxPXisN4snpu8k 2QzV9eVWNj4TI--8 1',
      'IcrHV6XdzJMwDt-s yucxPXisN4snpu8k 2QzV9eVWNj4TI--8 2',
      'IcrHV6XdzJMwDt-s pvCCCy-vTi7D3VA1 qT2ocpx2l8T_EQ6O 3',
      'IcrHV6XdzJMwDt-s pvCCCy-vTi7D3VA1 oU1bHAFCGE2GNXaR 3',
      'IcrHV6XdzJMwDt-s pvCCCy-vTi7D3VA1 NkTeYO6uqZgoXUtB 4',
      'IcrHV6XdzJMwDt-s pvCCCy-vTi7D3VA1 9HSRLwpSnDYM2GTj 4',
      'IcrHV6XdzJMwDt-s pvCCCy-vTi7D3VA1 1UZyS11catXrf9bR 4',
    ],
  },
  presales: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","whalewing-clarify","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","whalewing-clarify","whalewing-research","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","whalewing-clarify","whalewing-research","office","competitive-landscape","market-sizing-analysis","copywriting","humanizer-zh"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","whalewing-clarify","whalewing-research","office","competitive-landscape","market-sizing-analysis","copywriting","humanizer-zh","whalewing-slides"],
    ],
    rows: [
      'CwgXAZmrk-Sw6-H_ 0-y96vlAOe73QbQb _EPYa5ET144_0ozi -',
      'CwgXAZmrk-Sw6-H_ oN-S1MlKGTOFmvFR kzZVY_AN4fSJGdAi -',
      'CwgXAZmrk-Sw6-H_ oN-S1MlKGTOFmvFR kzZVY_AN4fSJGdAi 0',
      'CwgXAZmrk-Sw6-H_ oN-S1MlKGTOFmvFR kzZVY_AN4fSJGdAi 1',
      'CwgXAZmrk-Sw6-H_ oN-S1MlKGTOFmvFR kzZVY_AN4fSJGdAi 2',
      'CwgXAZmrk-Sw6-H_ tsuNWMa9xI43HKgx G7Vv9V5TKkIC6-m9 3',
      'CwgXAZmrk-Sw6-H_ tsuNWMa9xI43HKgx IUiHp7qroTmZ1mcp 4',
      'CwgXAZmrk-Sw6-H_ tsuNWMa9xI43HKgx Sqjr7QKMg74kHyiE 5',
    ],
  },
  requirements: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-requirements","whalewing-system-screenshot-html","whalewing-research-solution","whalewing-engineering"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-frontend-design"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-frontend-design","whalewing-writing"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-frontend-design","whalewing-writing","grilling","customer-research"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-frontend-design","whalewing-writing","grilling","customer-research","create-prd","user-stories","prioritization-frameworks","opportunity-solution-tree","interview-script","north-star-metric","pre-mortem"],
    ],
    rows: [
      '_SawG5rAYQJrE9iF AKxvX4koKMD3Qs8e zeUyk0PYOvsgVT_R -',
      '_SawG5rAYQJrE9iF GwfmeUKaY5UWw2DM h-MlJ3zgiAD7GexK -',
      '_SawG5rAYQJrE9iF GwfmeUKaY5UWw2DM h-MlJ3zgiAD7GexK 0',
      '_SawG5rAYQJrE9iF GwfmeUKaY5UWw2DM h-MlJ3zgiAD7GexK 1',
      '_SawG5rAYQJrE9iF GwfmeUKaY5UWw2DM -CA_8jF6mlg21azw 1',
      '_SawG5rAYQJrE9iF GwfmeUKaY5UWw2DM -CA_8jF6mlg21azw 2',
      '_SawG5rAYQJrE9iF C_TbSs2TDCFCeNgm UA1-uWBMl82_N2zY 3',
      '_SawG5rAYQJrE9iF C_TbSs2TDCFCeNgm 1Y9MqfZpsC_5JZPM 4',
      'YglhlA78Wr1RT4uH _9TBB214BXyqQU-0 WFjrrsV2N7ayoVwj 4',
      'YglhlA78Wr1RT4uH 63B3KJcTSSEyKWS6 z_AuhPP53A9VHqVC 5',
    ],
  },
  development: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-engineering","whalewing-testing","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-coding","whalewing-debugging","whalewing-frontend-design"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-coding","whalewing-debugging","whalewing-code-review","whalewing-frontend-design"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-coding","whalewing-debugging","whalewing-code-review","whalewing-frontend-design","codebase-design","error-handling-patterns","api-design-principles","sql-optimization-patterns","git-advanced-workflows","architecture-decision-records","mcp-builder","javascript-testing-patterns","python-testing-patterns"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-coding","whalewing-debugging","whalewing-code-review","whalewing-frontend-design","codebase-design","error-handling-patterns","api-design-principles","sql-optimization-patterns","git-advanced-workflows","architecture-decision-records","mcp-builder","javascript-testing-patterns","python-testing-patterns","stride-analysis-patterns","security-requirement-extraction","sast-configuration"],
    ],
    rows: [
      'Mj1nPlHCMiM5kW7J 288xF8hySTy2RjDK fWrF8CrXc-iZLdLf -',
      'Mj1nPlHCMiM5kW7J awa8TRBBgsHmPxlw RUJg1pKF1Md6ASS2 -',
      'Mj1nPlHCMiM5kW7J awa8TRBBgsHmPxlw RUJg1pKF1Md6ASS2 0',
      'Mj1nPlHCMiM5kW7J awa8TRBBgsHmPxlw RUJg1pKF1Md6ASS2 1',
      'Mj1nPlHCMiM5kW7J MKNWqoUZudsjTgao ZQJNJnNdYzC9F1fv 1',
      'Mj1nPlHCMiM5kW7J MKNWqoUZudsjTgao ZQJNJnNdYzC9F1fv 2',
      'Mj1nPlHCMiM5kW7J -ZJsYzLEUOqc02Y6 MCOvvB4goVKnVNtW 3',
      'Mj1nPlHCMiM5kW7J -ZJsYzLEUOqc02Y6 hAHPL-j0ZvDS8Sev 4',
      'Mj1nPlHCMiM5kW7J -ZJsYzLEUOqc02Y6 YBdq8Rwgr8YoYyv1 4',
      'Mj1nPlHCMiM5kW7J -ZJsYzLEUOqc02Y6 F5QYPWU_2iAlTchS 5',
    ],
  },
  implementation: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-delivery","whalewing-system-screenshot-html","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","office","whalewing-data-analysis"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","office","whalewing-data-analysis","sql-optimization-patterns"],
    ],
    rows: [
      'kL0f3JqnCF0Yy3t9 yigCTsnBZE3tOhug 2mCIg-W60OpcBLYl -',
      'kL0f3JqnCF0Yy3t9 t86slfuW4yzier_g 0U-YJboTA_FcdHEO -',
      'kL0f3JqnCF0Yy3t9 t86slfuW4yzier_g 0U-YJboTA_FcdHEO 0',
      'kL0f3JqnCF0Yy3t9 t86slfuW4yzier_g 0U-YJboTA_FcdHEO 1',
      'kL0f3JqnCF0Yy3t9 t86slfuW4yzier_g V4Kf1Z20UqbRA0Jf 1',
      'kL0f3JqnCF0Yy3t9 t86slfuW4yzier_g V4Kf1Z20UqbRA0Jf 2',
      'kL0f3JqnCF0Yy3t9 GNtGVgE_FhY4J947 mmBPxubH7PH7PPst 3',
      'kL0f3JqnCF0Yy3t9 GNtGVgE_FhY4J947 fo9fkULYXCs-MqhA 4',
    ],
  },
  testing: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-testing","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-web-testing","whalewing-debugging"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-web-testing","whalewing-debugging","whalewing-code-review"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-web-testing","whalewing-debugging","whalewing-code-review","e2e-testing-patterns","javascript-testing-patterns","python-testing-patterns","web-quality-audit","accessibility","performance","core-web-vitals","best-practices","seo"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-web-testing","whalewing-debugging","whalewing-code-review","e2e-testing-patterns","javascript-testing-patterns","python-testing-patterns","web-quality-audit","accessibility","performance","core-web-vitals","best-practices","seo","wcag-audit-patterns","screen-reader-testing"],
    ],
    rows: [
      '2n2H9w-l4UiQK6FO hTeyW5U-mi4gyUJ9 RX8Om5hWWuVML8Ok -',
      '2n2H9w-l4UiQK6FO Abl-n0HD1P5StELs APvYm-4pC1bbqmjT -',
      '2n2H9w-l4UiQK6FO Abl-n0HD1P5StELs APvYm-4pC1bbqmjT 0',
      '2n2H9w-l4UiQK6FO Abl-n0HD1P5StELs APvYm-4pC1bbqmjT 1',
      '2n2H9w-l4UiQK6FO Abl-n0HD1P5StELs LPfTBOaQmLQRHRI6 1',
      '2n2H9w-l4UiQK6FO Abl-n0HD1P5StELs LPfTBOaQmLQRHRI6 2',
      '2n2H9w-l4UiQK6FO Kv4aCJ-7FdxRPM7Z wpc-qRgV8-32Tixc 3',
      '2n2H9w-l4UiQK6FO Kv4aCJ-7FdxRPM7Z q1dCuXuzPe3CMJcQ 4',
      '2n2H9w-l4UiQK6FO Kv4aCJ-7FdxRPM7Z 5NHTNvn3dxdNRsQX 4',
      '2n2H9w-l4UiQK6FO zcOBTPe3HxEOr3tr uytEOCqOg8Pvb5F5 5',
    ],
  },
  operations: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-operations","whalewing-research-solution"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-debugging"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-debugging","deployment-pipeline-design","github-actions-templates","secrets-management","incident-runbook-templates","postmortem-writing","bash-defensive-patterns","git-advanced-workflows"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-debugging","deployment-pipeline-design","github-actions-templates","secrets-management","incident-runbook-templates","postmortem-writing","bash-defensive-patterns","git-advanced-workflows","prometheus-configuration","grafana-dashboards","slo-implementation"],
    ],
    rows: [
      '-PYsODmtRVdVdUmt 41pKWMJsXFj19pya LnM59g9hxFw52r0g -',
      '-PYsODmtRVdVdUmt 7elCz1D1_i9Um-4U e0ldQjwWKEfAugbz -',
      '-PYsODmtRVdVdUmt 7elCz1D1_i9Um-4U e0ldQjwWKEfAugbz 0',
      '-PYsODmtRVdVdUmt 7elCz1D1_i9Um-4U e0ldQjwWKEfAugbz 1',
      '-PYsODmtRVdVdUmt 7elCz1D1_i9Um-4U e0ldQjwWKEfAugbz 2',
      '-PYsODmtRVdVdUmt EX8q25cE_C9QZ5mB Uw7mz5rGJfKCxQpX 2',
      '-PYsODmtRVdVdUmt EX8q25cE_C9QZ5mB 1C63590E4yo6uLKr 3',
      '-PYsODmtRVdVdUmt EX8q25cE_C9QZ5mB -m0GojHYaSiLaJc9 4',
    ],
  },
  design: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-frontend-design","whalewing-ui-review","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-frontend-design","whalewing-ui-review","office","ui-ux-pro-max","visual-design-foundations","design-system-patterns","interaction-design","responsive-design","accessibility","theme-factory"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-frontend-design","whalewing-ui-review","whalewing-visual","office","ui-ux-pro-max","visual-design-foundations","design-system-patterns","interaction-design","responsive-design","accessibility","theme-factory"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-frontend-design","whalewing-ui-review","whalewing-visual","whalewing-slides","frontend-slides","office","ui-ux-pro-max","visual-design-foundations","design-system-patterns","interaction-design","responsive-design","accessibility","theme-factory"],
    ],
    rows: [
      'Kz-4Wf99rBBO1a2I t-skc9DCaUfea4KY QrrClx79dhK629-2 0',
      'Kz-4Wf99rBBO1a2I t-skc9DCaUfea4KY N4iTBh1i56XDoqtd 1',
      'Kz-4Wf99rBBO1a2I t-skc9DCaUfea4KY bv2QqMI9CZSWeU4B 1',
      'Kz-4Wf99rBBO1a2I t-skc9DCaUfea4KY 81PdKdxrsgHX_f-m 2',
      'Kz-4Wf99rBBO1a2I t-skc9DCaUfea4KY qPafvhuo9e9DDM5M 3',
    ],
  },
  data: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-data-analysis","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-data-analysis","office","statistical-analysis","data-storytelling","kpi-dashboard-design","sql-optimization-patterns"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-data-analysis","office","statistical-analysis","data-storytelling","kpi-dashboard-design","sql-optimization-patterns","ab-test-analysis","cohort-analysis"],
    ],
    rows: [
      'GMIhFGJ2IDW1Hx96 QgdUPehUeMylyDOi fBG22A5K66Q4e5Pr 0',
      'GMIhFGJ2IDW1Hx96 QgdUPehUeMylyDOi T-CaUtAzXXwHGuBf 1',
      'GMIhFGJ2IDW1Hx96 Ky4bEa4JJX90g1Xn WXdAQVZ3A66xdTEp 2',
    ],
  },
  research: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-research","whalewing-writing"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-research","whalewing-writing","competitive-landscape","competitor-profiling","market-sizing-analysis","customer-research","obsidian-markdown"],
    ],
    rows: [
      'NXc4Sk9k3GWox0dH TlOsrZpHWPulUItV HcKgtip-3FuDtqvm 0',
      'NXc4Sk9k3GWox0dH TlOsrZpHWPulUItV 8AdSuM60CsbA_2HZ 1',
      'NXc4Sk9k3GWox0dH TlOsrZpHWPulUItV xpiJPJyOgHlWLdyd 1',
    ],
  },
  writing: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","whalewing-humanize","whalewing-clarify","office"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","humanizer-zh","whalewing-clarify","office","copywriting","copy-editing","baoyu-translate"],
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-writing","humanizer-zh","whalewing-clarify","office","copywriting","copy-editing","baoyu-translate","whalewing-slides"],
    ],
    rows: [
      'egPMc9ZD_4XK7A3J JCFxdbbSW8Foq3Kh q21XAAnENYcOvuRd 0',
      'egPMc9ZD_4XK7A3J JCFxdbbSW8Foq3Kh mJAswPSZJP3yrtXK 1',
      'egPMc9ZD_4XK7A3J JCFxdbbSW8Foq3Kh qPLdrmO1514qCnsN 2',
    ],
  },
  marketing: {
    skills: [
      ["whalewing-knowledge","whalewing-skill-evolution","whalewing-check","whalewing-clarify","whalewing-writing","whalewing-visual","whalewing-data-analysis","office","product-marketing","content-strategy","social","copywriting","copy-editing","humanizer-zh","competitor-profiling","seo-audit","ai-seo","launch","marketing-psychology","community-marketing","cro","emails","analytics"],
    ],
    rows: [
      'wq5D7k8_4Mu1cIpi auHCqQIG3QhsyvrV lDm-fv9IMI-ZZLqN 0',
    ],
  },
};
