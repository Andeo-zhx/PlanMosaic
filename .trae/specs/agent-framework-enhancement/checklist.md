# Checklist

## 网络搜索工具
- [x] `ai-tools.js` 中新增 `web_search_evaluate` 工具 Schema，包含 query/purpose/max_results 参数
- [x] `server.js` 中 `executeSingleToolCall` 新增 `case 'web_search_evaluate'` 分支
- [x] 搜索返回结构化结果（标题、摘要、链接）
- [x] 搜索 API 不可用时返回友好降级提示而非崩溃

## 日程健康度检查
- [x] `ai-tools.js` 的 `analyze` 工具 action 枚举包含 `'health_check'`
- [x] `server.js` 的 `analyze` case 新增 `health_check` 子分支
- [x] 健康度检查覆盖四个维度：负荷均衡度、休息保障、时间分配、DDL 压力
- [x] 返回百分制评分 + 综合建议

## 任务时间估算 — Python ML 微服务
- [x] `ai-agent-python/` 目录存在，结构完整（requirements.txt + app.py + model.py + training_data.json）
- [x] `training_data.json` 含 1000 条预置样本，覆盖学习/工作/生活/运动四类
- [x] Flask 服务提供 4 个端点：`/api/estimate-task-time`、`/api/train-model`、`/api/collect-training-data`、`/api/training-status`
- [x] `model.py` 实现 TF-IDF 向量化 + RandomForestRegressor 训练/加载/推理
- [x] 首次启动无 .pkl 文件时自动训练并保存模型
- [x] `/api/estimate-task-time` 返回 `{ estimated_minutes, confidence_interval, model_version }`
- [x] `/api/train-model` 合并预置 + 用户数据重训练，返回 `{ r2_score, mae, training_samples }`
- [x] `/api/collect-training-data` 追加用户数据到 `user_training_data.json`
- [x] 重训练后新模型覆盖旧 .pkl 文件

## 任务时间估算 — server.js 集成
- [x] `ai-tools.js` 中新增 `estimate_task_time` 工具 Schema
- [x] `server.js` 中 `executeSingleToolCall` 新增 `case 'estimate_task_time'` 分支
- [x] 调用 Python `/api/estimate-task-time`（服务可用时），不可用时 LLM 降级
- [x] `manage_tasks` complete 分支中：有 actual_minutes 时自动调用 `/api/collect-training-data`
- [x] System Prompt 含模型重训练引导说明

## ReAct 转录后端
- [x] `POST /api/generate-react-log` 端点可正常响应
- [x] 转录结果格式正确：Question → Thought → Action → Observation → Final Answer
- [x] 纯对话（无 tool_calls）场景仅输出 Question + Final Answer
- [x] 多轮 tool calls 场景按时间顺序排列多组循环

## ReAct 转录 — 桌面端 UI
- [x] `index.html` 对话区域有「生成ReAct记录」按钮
- [x] 点击按钮弹出 Modal 展示 ReAct 文本
- [x] Modal 支持一键复制
- [x] `ai-agent.js` 正确调用 `/api/generate-react-log` 并处理响应

## ReAct 转录 — Android UI
- [x] `AgentRepository.kt` 新增 `generateReActLog()` 方法
- [x] MosaScreen 右上角菜单含「生成 ReAct 记录」选项
- [x] 转录结果弹窗展示 + 复制功能正常

## ReAct 转录 — Uni-app UI
- [x] `mosa.vue` 对话底部有「生成ReAct记录」按钮
- [x] 弹窗展示转录结果 + 复制到剪贴板功能正常

## 演示案例
- [x] 案例 1 对话脚本：web_search_evaluate → view_schedule → add_schedule 调用链
- [x] 案例 2 对话脚本：estimate_task_time → view_schedule → manage_big_tasks 调用链
- [x] 案例 3 对话脚本：web_search_evaluate → swot_analysis → decision_matrix 调用链
- [x] 每个案例含完整 ReAct 记录文本（截图/录屏需实际运行时录制）

## 开题文档
- [x] 选题背景与意义已填写
- [x] 技术调研含 Function Calling vs ReAct 对比分析
- [x] 系统设计与实现方案完整
- [x] 分工说明清晰

## 现有功能不变
- [x] 现有 14 个工具全部保留，新增 2 个工具（共 16 个）
- [x] 日常助手 + 深度规划双模式对话正常（端点未移除）
- [x] Proposal 确认机制正常（manage_tasks update/delete 仍返回 proposal）
- [x] 流式输出（SSE）正常（/api/agent-chat 仍支持 stream 参数）
- [x] 三端 UI 架构未改动（仅做加法，未删除任何现有 UI 元素）