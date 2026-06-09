# Tasks

- [x] Task 1: 扩展时间评估训练样本结构
  - [x] 1.1 梳理现有 `estimate_task_time` 与任务完成回写链路，定义新的结构化样本字段
  - [x] 1.2 在任务完成与估算阶段保存难度、熟悉度、步骤数、截止压力、产出类型等关键特征
  - [x] 1.3 增加样本合法性校验、异常值过滤和低可信样本降权规则

- [x] Task 2: 实现可解释的两阶段估算器
  - [x] 2.1 定义“规则基线时间”计算方法，确保无模型时也能稳定工作
  - [x] 2.2 实现轻量模型校准逻辑，用于在基线时间上做增减修正
  - [x] 2.3 在接口返回中加入主要影响因素说明，便于用户理解为什么这样估算

- [x] Task 3: 优化对话侧特征采集与提示词
  - [x] 3.1 调整 Desktop 端 system prompt，让 Mosa 只补问少量高影响信息
  - [x] 3.2 优化 `estimate_task_time` 调用参数和上下文组织方式，减少“类别全是其他”的情况
  - [x] 3.3 改善 Python 服务不可用时的降级文案，输出基础时间建议和缓冲建议

- [x] Task 4: 建立训练验证与版本控制机制
  - [x] 4.1 在重训练流程中划分训练集/验证集，计算验证 MAE
  - [x] 4.2 保存最近一次训练报告，记录样本量、指标、保留/替换模型结论
  - [x] 4.3 当新模型验证效果未提升时，保留旧模型继续服务

- [x] Task 5: 提供适合课程展示的训练思路说明
  - [x] 5.1 输出面向非计算机专业本科生的训练说明文案
  - [x] 5.2 准备一个从“任务描述 -> 特征提取 -> 基线估算 -> 模型校准 -> 实际反馈”的完整示例
  - [x] 5.3 确保说明内容与真实代码实现一致，避免“文案和实现两张皮”

- [x] Task 6: 修复任务完成回写训练样本仍过于粗略的问题
  - [x] 6.1 在 Desktop 端为任务保存时间估算时的类别、上下文和结构化特征，避免完成时只能回传 `category="其他"` 与日期上下文
  - [x] 6.2 完成任务回写训练数据时优先复用原始估算快照或任务级时间评估元数据，保证训练样本保留任务语义
  - [x] 6.3 增加一次端到端校验，确认 `collect-training-data` 实际收到的样本包含类别、上下文和 5 个结构化字段

- [x] Task 7: 修复最新默认执行链路仍返回旧版 `estimate_task_time` stub 的问题
  - [x] 7.1 让 `PlanMosaic Desktop/backend/tool_executor.py` 的活跃链路调用 `Used/ai-agent-python/app.py` 暴露的时间估算服务
  - [x] 7.2 对齐返回字段，补齐 `estimated_minutes`、`major_factors`、`factor_details`、`baseline_minutes`、`baseline_comparison` 等新版结果
  - [x] 7.3 当 Python 服务不可用时返回规则基线与缓冲建议，而不是旧提示 stub
  - [x] 7.4 同步约束 `backend/tools.py` 与 `backend/server.py`，确保时间估算只补问少量高影响信息
  - [x] 7.5 为 `PlanMosaic Desktop/backend/tool_executor.py` 增加本地两阶段估算桥接，在独立 Flask 时间估算服务不可用时仍可复用 `Used/ai-agent-python/model.py`
  - [x] 7.6 回归验证 Desktop 默认后端链路，确认 checklist 第 3/4/5/9 项在实际执行链路成立

# Task Dependencies
- Task 1 先于 Task 2、Task 4 执行，因为估算器与训练验证都依赖新的样本结构
- Task 2 与 Task 3 可并行推进，但 Task 3 的最终提示词需要参考 Task 2 的输入字段
- Task 4 依赖 Task 1、Task 2 完成后才能稳定验证
- Task 5 依赖 Task 1 至 Task 4，确保讲解基于最终方案
- Task 6 依赖 Task 1 至 Task 3 的现有字段与调用链，修复后再重新核验 checklist 第 2 项
- Task 7 依赖 Task 2、Task 3 与 Task 6 的现有时间估算字段和 Python 服务接口，对齐活跃链路后再做一次回归验证
