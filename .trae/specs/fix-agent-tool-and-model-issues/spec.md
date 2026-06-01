# 修复 Agent 工具调用错误与模型路由问题 Spec

## Why

Agent 在执行工具调用时出现三个问题：(1) `executeToolCall` 在 `check_conflicts` 分支中使用数组解构提取 `parseTimeRange` 返回的对象，导致 `TypeError`；(2) 流式路径中 `executeToolCall` 缺少 try/catch 保护，一次工具执行失败即终止整个 Agent 循环，导致 Agent 无法连续调用工具；(3) `getModelForIntent` 仍在某些意图下路由到已废弃的 `deepseek-reasoner` 模型。

## What Changes

- **修复 `check_conflicts` 中的解构错误**：将第 1012、1015 行的数组解构 `const [sS, sE] = parseTimeRange(...)` 改为对象解构 `const { startMinutes: sS, endMinutes: sE } = parseTimeRange(...)`
- **流式路径添加 try/catch 保护**：在 `callDeepseekAPIMessages` 的流式分支（约第 1705-1710 行）中为 `executeToolCall` 调用包裹 try/catch，与同步分支（第 1772-1780 行）保持一致
- **移除 deepseek-reasoner 路由**：修改 `getModelForIntent` 函数，始终返回 `MODEL_NAME`，不再根据意图切换到 `REASONER_MODEL_NAME`

## Impact

- Affected specs: 无
- Affected code:
  - `PlanMosaic Desktop/main.js` — `executeToolCall` 函数（check_conflicts 分支）、`callDeepseekAPIMessages` 函数（流式路径工具执行）、`getModelForIntent` 函数

## MODIFIED Requirements

### Requirement: check_conflicts 正确解析时间段

系统 SHALL 在 `check_conflicts` 工具执行中正确解构 `parseTimeRange` 返回的对象（包含 `startMinutes`、`endMinutes` 等属性），而非将其视为可迭代对象进行数组解构。

#### Scenario: 检测时间冲突
- **WHEN** Agent 调用 `check_conflicts` 工具，传入 `date` 和 `time_slot` 参数
- **THEN** 系统正确解析 `time_slot`（如 `"16:00-16:45"`）为起始/结束分钟数
- **THEN** 遍历该日期的已有时间段，正确检测是否存在重叠冲突
- **THEN** 返回冲突检测结果（JSON 格式），不抛出 `TypeError`

### Requirement: 流式路径工具执行错误隔离

系统 SHALL 在 `callDeepseekAPIMessages` 的流式分支中，对 `executeToolCall` 调用进行 try/catch 保护，单个工具执行失败不应中断整个 Agent 循环。

#### Scenario: 流式模式下单个工具调用失败
- **WHEN** Agent 在流式模式下并行执行多个工具调用，其中某个工具抛出异常
- **THEN** 该工具返回 JSON 格式的错误信息（`{ error: "..." }`）
- **THEN** 其他工具调用正常完成
- **THEN** Agent 循环继续，可进行后续工具调用

### Requirement: Agent 始终使用快速模型

系统 SHALL 在 Agent 对话中始终使用配置的默认模型（`MODEL_NAME`，即 `deepseek-v4-flash`），不再根据消息意图切换到推理模型（`REASONER_MODEL_NAME`）。

#### Scenario: 复杂意图不再触发模型切换
- **WHEN** 用户发送包含规划/安排/分析类关键词的消息
- **THEN** `getModelForIntent` 返回 `MODEL_NAME`（`deepseek-v4-flash`），而非 `REASONER_MODEL_NAME`（`deepseek-reasoner`）
- **THEN** API 调用日志中不出现 `deepseek-reasoner` 模型

#### Scenario: 简单意图仍然正确
- **WHEN** 用户发送简单查询类消息
- **THEN** `getModelForIntent` 返回 `MODEL_NAME`（`deepseek-v4-flash`）
- **THEN** 行为与修复前保持一致