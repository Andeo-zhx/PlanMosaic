# AI Agent 框架增强 Spec

## Why
PlanMosaic 已具备成熟的 native function calling 架构（14 个工具 + 双模式对话 + Proposal 确认机制），但选题「AI Agent 框架搭建」要求显式展示 ReAct 范式（Reasoning + Acting）、扩展工具覆盖领域、提供多步调用演示案例。本方案在现有架构基础上做加法，通过 ReAct 转录、新工具扩展和演示案例满足课程要求。

## What Changes
- **ReAct 对话转录**: 新增 `/api/generate-react-log` 端点，将 function calling 格式的对话历史翻译为 ReAct 格式文本，三端前端加「生成ReAct记录」按钮
- **网络搜索工具**: `ai-tools.js` 新增 `web_search_evaluate` 工具 Schema，`server.js` 的 `executeSingleToolCall` 新增对应分支
- **任务时间估算工具（小模型训练）**: `ai-tools.js` 新增 `estimate_task_time` 工具 Schema，`server.js` 新增执行分支；Python 服务基于 1000 条预置训练数据训练回归模型，用户任务完成数据自动入库，支持手动触发重训练
- **日程健康度检查**: `analyze` 工具的 action 枚举扩展 `health_check`，`server.js` 新增对应分析逻辑
- **Python 时间估算微服务**: 新建 `ai-agent-python/` 目录，提供 `/api/estimate-task-time`、`/api/train-model`、`/api/training-status` 等端点
- **演示案例**: 准备 3 个多步 tool calling 演示对话脚本
- **开题文档**: 基于模板填写完整开题报告

## Impact
- Affected specs: 无（全新独立 spec，不改动现有功能）
- Affected code:
  - `ai-tools.js`: 新增 2 个工具 Schema（web_search_evaluate, estimate_task_time），analyze 工具 action 枚举扩展
  - `server.js`: 新增 2 个 API 端点（/api/generate-react-log, /api/web-search-proxy），executeSingleToolCall 新增 2 个 case 分支，analyze case 新增 health_check 子分支
  - `ai-agent.js`（桌面端）: 新增 ReAct 转录按钮 UI + 调用逻辑
  - `index.html`（桌面端）: 新增 ReAct 转录弹窗 HTML/CSS
  - `AgentRepository.kt`（Android）: ReAct 转录 API 调用 + MosaScreen 菜单项
  - `mosa.vue`（Uni-app）: ReAct 转录按钮 + 弹窗
  - `ai-agent-python/`（新建）: Python Flask 微服务（时间估算模型训练 + 推理），含 `training_data.json`（1000 条预置训练样本）

## ADDED Requirements

### Requirement: ReAct Conversation Transcription
系统 SHALL 提供将 function calling 格式对话历史翻译为 ReAct 格式文本的能力。

#### Scenario: 用户完成对话后生成 ReAct 记录
- **WHEN** 用户在对话界面点击「生成ReAct记录」按钮
- **THEN** 系统遍历当前会话的 messages 数组，提取 user → assistant(tool_calls) → tool(result) → assistant(content) 序列
- **THEN** 将每步翻译为 Thought / Action / Observation / Final Answer 格式
- **THEN** 以弹窗展示完整 ReAct 文本，支持一键复制

#### Scenario: 对话中仅含普通消息无 tool calls
- **WHEN** 对话历史不包含任何 tool_calls
- **THEN** ReAct 转录结果仅包含 Question 和 Final Answer，无 Action/Observation 段落

#### Scenario: 对话包含多轮 tool calls
- **WHEN** 对话包含多次 tool 调用（如先搜索再计算）
- **THEN** ReAct 文本按时间顺序展示多组 Thought→Action→Observation 循环，最后以 Final Answer 收尾

### Requirement: Web Search Evaluation Tool
系统 SHALL 提供网络搜索评估工具，允许 Agent 搜索网络资源并汇总分析。

#### Scenario: Agent 调用网络搜索
- **WHEN** Agent 调用 `web_search_evaluate` 工具，传入搜索关键词和目的
- **THEN** 系统通过搜索 API 获取前 N 条结果（标题+摘要+链接）
- **THEN** 返回结构化搜索结果供 Agent 二次加工

#### Scenario: 搜索 API 不可用
- **WHEN** 搜索 API 密钥未配置或请求失败
- **THEN** 返回明确的错误信息告知 Agent 搜索不可用，Agent 应基于已有知识回答

### Requirement: Task Time Estimation via Trained Small Model
系统 SHALL 基于机器学习回归模型提供任务时间估算，模型使用预置的 1000 条训练样本初始化，并在用户使用过程中持续积累训练数据。

#### Scenario: 初始模型训练
- **WHEN** Python 微服务首次启动且无已训练的模型文件
- **THEN** 系统加载 1000 条预置训练样本（task_name + category + context → estimated_minutes），使用 RandomForestRegressor 训练回归模型
- **THEN** 模型序列化保存为 `.pkl` 文件，后续启动直接加载

#### Scenario: Agent 调用时间估算
- **WHEN** Agent 调用 `estimate_task_time`，传入任务名称、类别和上下文
- **THEN** server.js 调用 Python `/api/estimate-task-time` 端点
- **THEN** Python 服务将输入文本向量化（TF-IDF），传入已训练的 RandomForest 模型，返回预测分钟数 + 置信区间

#### Scenario: 用户完成任务后自动收集训练数据
- **WHEN** 用户在 `manage_tasks` 中执行 `complete` 操作，提供了 actual_minutes
- **THEN** server.js 自动将该任务的 task_name、category、estimated_minutes、actual_minutes 写入 Python 服务的训练数据存储
- **THEN** 新数据追加到 `user_training_data.json`，不覆盖预置数据

#### Scenario: 用户手动触发重训练
- **WHEN** 用户（通过 Agent 对话或管理界面）触发「重新训练时间估算模型」
- **THEN** server.js 调用 Python `/api/train-model` 端点
- **THEN** Python 服务合并预置 1000 条 + 用户积累数据，重新训练 RandomForest 模型
- **THEN** 新模型覆盖旧模型文件，返回训练指标（R²、MAE）和新训练集大小
- **THEN** 用户积累数据成为新的训练集基础，后续用户数据继续追加

#### Scenario: Python 服务不可用时降级
- **WHEN** Python 微服务未运行或不可达
- **THEN** server.js 降级使用 LLM 根据任务名称和类别估算时间，并提示「当前使用基础估算，启动 Python 服务可启用模型估算」

### Requirement: Schedule Health Check
系统 SHALL 在 `analyze` 工具中新增 `health_check` 分析类型，评估日程健康状况。

#### Scenario: 执行健康度检查
- **WHEN** Agent 调用 `analyze(action="health_check")`
- **THEN** 系统从负荷均衡度、休息保障、时间分配、DDL 压力四个维度评估日程
- **THEN** 返回各维度评分（百分制）和综合建议

#### Scenario: 无日程数据时检查
- **WHEN** 指定时间段内无任何日程数据
- **THEN** 返回提示「该时段暂无日程安排，建议先规划日程」

### Requirement: Python ML Microservice
系统 SHALL 提供独立的 Python Flask 微服务作为时间估算模型的训练和推理节点，包含 1000 条预置训练样本。

#### Scenario: 微服务启动与模型初始化
- **WHEN** Python 微服务启动
- **THEN** 检查是否存在已训练的模型文件（`.pkl`），存在则直接加载
- **THEN** 不存在则自动加载 `training_data.json`（1000 条预置样本）训练 RandomForest 模型并保存

#### Scenario: 提供推理端点
- **WHEN** server.js 调用 `POST /api/estimate-task-time` 传入 task_name、category、context
- **THEN** 返回 `{ estimated_minutes: number, confidence_interval: [low, high], model_version: string }`

#### Scenario: 提供训练端点
- **WHEN** server.js 调用 `POST /api/train-model`
- **THEN** 合并预置训练数据 + 用户积累数据，重新训练模型
- **THEN** 返回 `{ r2_score: number, mae: number, training_samples: number, message: string }`

#### Scenario: 用户数据自动收集
- **WHEN** server.js 调用 `POST /api/collect-training-data` 传入任务完成记录
- **THEN** 数据追加到 `user_training_data.json`，返回当前用户数据总量

#### Scenario: 微服务不可用时
- **WHEN** server.js 无法连接 Python 服务
- **THEN** `estimate_task_time` 降级为 LLM 文本估算，并在响应中附带提示

### Requirement: Multi-Step Demo Cases
系统 SHALL 提供至少 3 个多步 tool calling 演示案例。

#### Scenario: 演示案例 1 — 查资料 + 排日程
- **WHEN** 用户输入「帮我查一下番茄工作法的最佳实践，然后在我明天下午安排两个番茄钟时段」
- **THEN** Agent 依次调用 web_search_evaluate → view_schedule → add_schedule

#### Scenario: 演示案例 2 — 时间估算 + 任务拆解
- **WHEN** 用户输入「我下周一要交一个2000字的实验报告，帮我规划一下」
- **THEN** Agent 依次调用 estimate_task_time → view_schedule → manage_big_tasks(break_down)

#### Scenario: 演示案例 3 — 搜索 + SWOT + 决策
- **WHEN** 用户在深度规划模式输入「我在纠结考研还是直接工作，帮我分析一下」
- **THEN** Agent 依次调用 web_search_evaluate → swot_analysis → swot_analysis → decision_matrix