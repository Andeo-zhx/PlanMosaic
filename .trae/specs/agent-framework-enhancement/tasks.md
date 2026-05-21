# Tasks

- [x] Task 1: 新增网络搜索工具（web_search_evaluate）
  - [x] 1.1 在 `ai-tools.js` 中新增 `web_search_evaluate` 工具 Schema（函数名、描述、参数：query/purpose/max_results）
  - [x] 1.2 在 `server.js` 的 `executeSingleToolCall` 中新增 `case 'web_search_evaluate'` 分支
  - [x] 1.3 实现搜索逻辑：调用 DuckDuckGo Instant Answer API（免费免密钥）或 Bing Web Search API，返回标题+摘要+链接的结构化结果
  - [x] 1.4 处理搜索 API 不可用场景，返回友好降级提示

- [x] Task 2: 扩展日程健康度检查（analyze health_check）
  - [x] 2.1 在 `ai-tools.js` 的 `analyze` 工具 `action` 枚举中新增 `'health_check'`
  - [x] 2.2 在 `server.js` 的 `analyze` case 中新增 `health_check` 子分支
  - [x] 2.3 实现四维度评估逻辑：负荷均衡度、休息保障、时间分配、DDL 压力指数
  - [x] 2.4 返回百分制评分 + 综合建议

- [x] Task 3: 创建 Python ML 微服务（时间估算模型训练 + 推理）
  - [x] 3.1 创建 1000 条预置训练数据 `training_data.json`（覆盖学习/工作/生活/运动四类任务，每条含 task_name、category、context、estimated_minutes）
  - [x] 3.2 新建 `ai-agent-python/` 目录，创建 `requirements.txt`（flask, scikit-learn, numpy, pandas, joblib）
  - [x] 3.3 创建 `app.py` Flask 主文件，实现以下端点
  - [x] 3.4 实现 `model.py` 模块：TF-IDF 向量化 + RandomForestRegressor 训练/加载/推理
  - [x] 3.5 首次启动自动检测：无 .pkl 模型文件则加载 training_data.json 训练并保存

- [x] Task 4: server.js 集成时间估算工具 + 训练数据自动收集
  - [x] 4.1 在 `ai-tools.js` 中新增 `estimate_task_time` 工具 Schema（函数名、描述、参数：task_name/category/context）
  - [x] 4.2 在 `server.js` 的 `executeSingleToolCall` 中新增 `case 'estimate_task_time'` 分支
  - [x] 4.3 实现调用 Python `/api/estimate-task-time` 的逻辑（服务可用时），不可用时 LLM 降级
  - [x] 4.4 在 `manage_tasks` 的 `complete` 分支中：当用户提供 actual_minutes 时，自动调用 Python `/api/collect-training-data` 写入训练数据
  - [x] 4.5 在 System Prompt 中注入说明，告知 Agent 可以引导用户触发「重新训练时间估算模型」并调用 `/api/train-model`

- [x] Task 5: 实现 ReAct 转录后端
  - [x] 5.1 在 `server.js` 中新增 `POST /api/generate-react-log` 端点
  - [x] 5.2 实现转录核心逻辑：遍历 messages 数组，识别 user → assistant(tool_calls) → tool(result) → assistant(content) 序列
  - [x] 5.3 生成格式：Question → Thought → Action → Observation → ... → Final Answer
  - [x] 5.4 处理纯对话场景（无 tool_calls）：仅输出 Question + Final Answer
  - [x] 5.5 处理多轮 tool calls 场景：按时间顺序排列多组循环

- [x] Task 6: 桌面端 ReAct 转录 UI
  - [x] 6.1 在 `index.html` 对话底部区域添加「📋 生成ReAct记录」按钮
  - [x] 6.2 新增 ReAct 转录结果弹窗（Modal），展示格式化文本 + 一键复制按钮
  - [x] 6.3 在 `ai-agent.js` 中实现按钮点击 → 调用 `/api/generate-react-log` → 弹窗展示流程

- [x] Task 7: Android 端 ReAct 转录 UI
  - [x] 7.1 在 `AgentRepository.kt` 新增 `generateReActLog()` 方法，调用后端 `/api/generate-react-log`
  - [x] 7.2 在 `MosaScreen.kt` 右上角菜单添加「生成 ReAct 记录」选项
  - [x] 7.3 实现 ReAct 转录结果展示弹窗 + 复制功能

- [x] Task 8: Uni-app 端 ReAct 转录 UI
  - [x] 8.1 在 `mosa.vue` 对话底部添加「生成ReAct记录」按钮
  - [x] 8.2 实现弹窗展示转录结果 + 复制到剪贴板

- [x] Task 9: 准备多步调用演示案例
  - [x] 9.1 编写演示案例 1 对话脚本（查番茄工作法 + 排日程，涉及 web_search_evaluate → view_schedule → add_schedule）
  - [x] 9.2 编写演示案例 2 对话脚本（时间估算 + 任务拆解，涉及 estimate_task_time → view_schedule → manage_big_tasks）
  - [x] 9.3 编写演示案例 3 对话脚本（搜索 + SWOT + 决策矩阵，涉及 web_search_evaluate → swot_analysis → decision_matrix）
  - [x] 9.4 每个案例配截图或录屏，导出 ReAct 记录文本

- [x] Task 10: 撰写开题文档
  - [x] 10.1 填写选题背景与意义（结合 PlanMosaic 现有架构和 ReAct 范式研究）
  - [x] 10.2 撰写技术调研（Function Calling vs ReAct 对比分析，结合项目实际代码）
  - [x] 10.3 撰写系统设计与实现方案（ReAct 转录 + 新工具 + 小模型训练 + 多步调用演示）
  - [x] 10.4 撰写分工说明（同学 A: ReAct 转录，同学 B: 新工具 + Python ML 微服务，同学 C: 演示案例 + 文档）

# Task Dependencies
- Task 1、2、5 可并行开发（互不依赖）
- Task 3 独立开发（Python 微服务），不依赖其他 Task
- Task 4 依赖 Task 3（server.js 集成需 Python 服务端点就绪）
- Task 6 依赖 Task 5（桌面端 UI 需后端端点就绪）
- Task 7 依赖 Task 5（Android UI 需后端端点就绪）
- Task 8 依赖 Task 5（Uni-app UI 需后端端点就绪）
- Task 6、7、8 可并行开发
- Task 9 依赖 Task 1~8（演示案例需新工具和 ReAct 转录可用）
- Task 10 依赖 Task 1~9（文档需所有功能实现完成的素材）