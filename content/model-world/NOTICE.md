# 模型世界数据来源

模型世界的代码、界面和算法都由鲸翼自行实现，数据来自下面三个公开来源，展示时在界面“数据来源与算法”中注明。

- **模型目录与价格**：[models.dev](https://github.com/anomalyco/models.dev)（MIT，许可见 `LICENSE-models-dev.txt`）。员工点「更新数据」时读取 `models.json`（规范模型目录）和 `api.json`（各渠道价格），只收录图鉴名单内的厂商，价格只取厂商官方渠道。价格单位为美元／百万 token，不代表员工实际转发站费用；国产模型另按厂商官网人民币标价显示。
- **综合实力、梯队和性价比**：[Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) 智能指数及其单次任务成本，由 `scripts/update-model-index.mjs` 从 AA 免费接口生成后随插件提交；员工在「综合实力数据」里填了自己的 API Key 后，「更新数据」也会在线更新这部分。按 AA 的要求注明来源。
- **推理与知识、编程、智能体三个分项**：[Epoch AI Benchmarking Hub](https://epoch.ai/benchmarks) 公开数据包中的第三方评测成绩，依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名使用（见 [数据使用说明](https://epoch.ai/benchmarks/use-this-data)）；由 `scripts/update-model-bench.mjs` 生成后随插件提交。成绩换算为在名单内已测模型中的百分位后按维度取平均，不采信厂商自报。

未提供分数表示缺少评测，不表示模型较差。刷新不使用模型账户，失败时保留旧数据。
