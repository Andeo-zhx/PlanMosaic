# Desktop 端时间评估模型优化 Spec

## Why
当前 Desktop 端已经具备“任务完成后收集实际用时并重新训练模型”的基础能力，但现有方案主要依赖 `task_name + category + context` 的粗粒度文本特征，完成任务时写回的数据也较少，容易出现“学到了一点，但解释不清为什么这样估算”的问题。

这次优化不追求从零训练一个真正的大语言模型，而是在保留现有 Agent + 本地训练框架的前提下，把时间评估能力升级为“LLM 负责提取结构化信息，轻量模型负责校准时间”的可解释方案，让非计算机专业本科生也能理解训练逻辑。

## What Changes
- 新增结构化训练样本字段，在原有任务名、类别、上下文之外，补充难度、熟悉度、步骤数、截止压力、产出类型等低门槛特征
- 将时间评估改为两阶段流程：先生成规则基线时间，再由轻量模型做偏差校正，并返回影响估算的主要因素
- 新增训练数据清洗与异常值过滤，避免明显错误的实际用时直接污染模型
- 新增训练验证流程，使用训练集/验证集分离比较优化前后的 MAE，并保存最近一次训练报告
- 优化 Desktop 端提示词和交互文案，让 Mosa 只补问少量真正影响用时的关键信息
- 新增面向课程展示的“训练思路说明”，明确说明为什么本项目采用可解释轻量方案而不是从零训练大模型

## Impact
- Affected specs: `agent-framework-enhancement` 中的任务时间估算能力
- Affected code:
  - `PlanMosaic Desktop/server.js`
  - `PlanMosaic Desktop/ai-tools.js`
  - `Used/ai-agent-python/app.py`
  - `Used/ai-agent-python/model.py`
  - `Used/ai-agent-python/training_data.json`

## ADDED Requirements
### Requirement: Explainable Hybrid Time Estimation
系统 SHALL 以“结构化特征 + 基线规则 + 轻量回归校准”的混合方式提供时间评估，而不是只依赖原始文本直接回归。

#### Scenario: 用户请求估算任务时间
- **WHEN** 用户请求 Mosa 估算某个任务需要多久
- **THEN** 系统优先从任务描述中提取结构化特征，包括类别、难度、熟悉度、步骤数、截止压力、产出类型
- **THEN** 如果缺少高影响字段，Mosa 只补问 2 到 4 个必要问题
- **THEN** 后端先根据规则生成一个基线时间，再由轻量模型输出校正后的最终估算分钟数
- **THEN** 返回结果中包含“为什么比基线更长/更短”的简短解释

#### Scenario: 信息不足但用户不想继续补充
- **WHEN** 用户只给出一句简短任务描述，且不愿补充更多信息
- **THEN** 系统仍可基于已有字段给出保守估算
- **THEN** 响应中明确标注“当前信息较少，建议预留缓冲时间”

### Requirement: Structured Training Sample Collection
系统 SHALL 在任务完成时自动构建结构化训练样本，并只保存对训练真正有帮助的字段。

#### Scenario: 用户完成任务并填写实际用时
- **WHEN** 用户完成任务且提供 `actual_minutes`
- **THEN** 系统保存任务名称、类别、上下文、估算值、实际值，以及当次估算使用的结构化特征
- **THEN** 样本写入用户训练数据文件，用于后续重训练

#### Scenario: 样本明显异常
- **WHEN** 新样本的实际用时明显不合理，例如小于最小阈值、远高于同类任务常见范围，或关键字段缺失
- **THEN** 系统拒绝直接纳入训练集，或先标记为低可信样本
- **THEN** 训练报告中记录被过滤或降权的样本数量

### Requirement: Training Validation and Report
系统 SHALL 在每次重训练后生成易读的验证结果，展示模型是否真的比原方案更好。

#### Scenario: 用户触发重新训练
- **WHEN** 用户触发“重新训练时间估算模型”
- **THEN** 系统合并预置样本与用户样本，并划分训练集与验证集
- **THEN** 输出验证 MAE、样本数量、主要特征列表和模型版本
- **THEN** 保存最近一次训练报告，供课程展示和调试使用

#### Scenario: 新模型没有明显提升
- **WHEN** 新模型在验证集上的效果不优于当前线上模型
- **THEN** 系统保留旧模型继续服务，避免“越训越差”
- **THEN** 返回训练提示，说明本次训练未达替换条件

### Requirement: Human-Readable Training Explanation
系统 SHALL 提供适合非计算机专业本科生阅读的训练思路说明。

#### Scenario: 用户查看训练原理
- **WHEN** 用户在说明文案或课程展示中查看“时间评估模型是怎么训练的”
- **THEN** 系统使用自然语言解释 3 个核心步骤：整理样本、提取特征、校准估算
- **THEN** 说明“LLM 在这里主要负责理解任务文本，不负责从零学习全部时间规律”

## MODIFIED Requirements
### Requirement: Existing Task Time Estimation Workflow
系统 SHALL 将现有时间估算流程从“原始文本 TF-IDF + 单模型直接回归 + 训练集自评估”为主，修改为“结构化特征提取 + 基线规则 + 轻量模型校准 + 验证集评估”的可解释工作流，同时保持现有 `estimate_task_time` API 的基本调用方式不变。

#### Scenario: Python 服务可用
- **WHEN** `server.js` 调用 `/api/estimate-task-time`
- **THEN** Python 服务返回估算分钟数、区间、模型版本，以及简短因素解释

#### Scenario: Python 服务不可用
- **WHEN** Python 服务不可达
- **THEN** `server.js` 降级为规则基线估算与提示文案
- **THEN** 响应中不再只说“请自行估算”，而是给出基础时间建议和缓冲建议

## REMOVED Requirements
### Requirement: Raw-Text-Only Direct Regression as Sole Strategy
**Reason**: 仅依赖原始文本做直接回归，在小样本场景下可解释性弱、抗噪声能力不足，也不利于课程展示。
**Migration**: 保留现有 API 入口，但将后端实现迁移为“结构化特征 + 基线规则 + 轻量模型校准”的混合方案。
