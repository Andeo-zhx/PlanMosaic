# Tasks

- [x] Task 1: 搭建 Python 项目基础结构
  - [x] 创建 `backend/` 目录结构（`backend/server.py`、`backend/tools.py`、`backend/tool_executor.py`、`backend/paths.py`、`backend/config.py`、`backend/cli.py`）
  - [x] 创建 `backend/requirements.txt`（FastAPI、uvicorn、httpx、python-dotenv）
  - [x] 验证 `python -m backend.server` 能启动一个返回 "OK" 的健康检查端点

- [x] Task 2: 实现 Python 配置与路径管理模块（替代 `paths.js`）
  - [x] 实现跨平台 AppData 目录定位（Windows `%APPDATA%`、macOS `~/Library/Application Support`、Linux `~/.config`）
  - [x] 实现 `config.json` 加载（所有字段：api.deepseek.*、api.qwen.*、agent.provider、server.*、security.*、timeouts.*）
  - [x] 实现 `data.json`、`agent-log.json` 路径获取
  - [x] 实现数据备份创建与旧备份清理（保留最近 10 个）
  - [x] 验证各平台路径正确生成

- [x] Task 3: 实现 Python 工具定义模块（替代 `ai-tools.js`）
  - [x] 将 16 个工具定义（含 9 个核心工具 + 7 个深度规划专用工具）从 `ai-tools.js` 迁移为 Python dict 列表
  - [x] 确保每个工具的 JSON Schema 字段（type、function.name、function.description、function.parameters）与原版完全一致
  - [x] 验证 `json.dumps(tools)` 输出与原 JS 的 `JSON.stringify(AI_TOOLS)` 语义等价

- [x] Task 4: 实现 Python 工具执行引擎（替代 `main.js` 中的 `executeToolCall`）
  - [x] 实现工具路由映射表（旧名称→新名称，46 条映射）
  - [x] 实现 `view_schedule` 工具（list_all、keyword、单日期查看）
  - [x] 实现 `add_schedule` 工具（单次添加、周期性添加 daily/weekly/weekdays，含冲突检测）
  - [x] 实现 `modify_schedule` 工具（6 种操作子类型：delete_slots、modify_slot、add_slot、delete_all_matching、update_all_matching、batch_delete_dates）
  - [x] 实现 `manage_tasks` 工具（6 种操作子类型：add、complete、view、update、delete、batch_delete）
  - [x] 实现 `manage_big_tasks` 工具（7 种操作子类型：add、complete、view、update、delete、batch_delete、break_down）
  - [x] 实现 `manage_courses` 工具（10 种操作子类型）
  - [x] 实现 `check_conflicts`、`analyze`、`manage_templates` 工具
  - [x] 实现深度规划专用工具（value_monetization、roi_calculator、milestone_planner、swot_analysis、decision_matrix、web_search_evaluate、estimate_task_time）
  - [x] 实现数据持久化（读写 data.json，备份机制）

- [x] Task 5: 实现 Python FastAPI 服务器（替代 `server.js`）
  - [x] 实现 `POST /api/agent-chat`（普通聊天，含多轮工具调用递归、速率限制、重试、降级响应）
  - [x] 实现 `POST /api/agent-chat-stream`（SSE 流式聊天，含 content/reasoning/retry/status 事件类型）
  - [x] 实现 `POST /api/deep-planning-chat`（深度规划，reasoner 模型 + 工具白名单过滤）
  - [x] 实现 `POST /api/deep-planning-profile`（深度规划画像更新）
  - [x] 实现 `GET /api/schedule-data` / `POST /api/save-schedule`（日程数据读写）
  - [x] 实现 `GET /api/agent-history` / `POST /api/agent-save`（Agent 历史管理）
  - [x] 实现 `POST /api/agent-approve`（提案确认执行）
  - [x] 实现 `POST /api/generate-react-log`（ReAct 日志生成）
  - [x] 实现 `POST /api/test-connection`（网络连接测试）
  - [x] 实现 `GET /api/config` / `POST /api/config`（配置读写）
  - [x] 实现静态文件服务（替代 server.js 中的 MIME 处理）
  - [x] 实现意图识别（needsReasoning 逻辑）和模型自动选择
  - [x] 实现 Startup Scan 逻辑（每日问候生成）
  - [x] 新增 `GET /health`、`GET /api/startup-scan`、`POST /api/agent-archive`、`POST /api/agent-clear`

- [x] Task 6: 实现 Python CLI 工具（替代 `cli.js`）
  - [x] 实现默认模式：显示当前月日历，有安排的日期高亮
  - [x] 实现 `-m YYYY-MM` 参数：显示指定月日历
  - [x] 实现 `-d YYYY-MM-DD` 参数：显示指定日期的详细安排
  - [x] 实现 `-h` 参数：帮助信息输出

- [x] Task 7: 重构 Electron main.js（精简 IPC 处理）
  - [x] 实现 Python 后端子进程管理（启动、健康检查等待、退出清理）
  - [x] 重构 `agent-chat` IPC handler：改为 HTTP POST 到 Python 后端
  - [x] 重构 `agent-chat-stream` IPC handler：改为 SSE 消费并转发
  - [x] 重构 `agent-approve` IPC handler：改为 HTTP POST
  - [x] 重构所有 schedule 相关 IPC handler：改为 HTTP 调用
  - [x] 重构 `deep-planning-*` IPC handler：改为 HTTP 调用
  - [x] 重构配置管理 IPC：改为 HTTP 调用
  - [x] 移除 main.js 中所有直接调用 DeepSeek/Qwen API 的代码
  - [x] 移除 main.js 中所有工具执行代码
  - [x] 保持 preload.js 不变
  - [x] main.js 从 3446 行精简到 ~1062 行

- [x] Task 8: 端到端集成测试与验证
  - [x] 启动 Python 后端，验证所有 API 端点返回正确（8 个端点全部通过）
  - [x] CLI 工具功能验证（-h、-m、-d 全部通过）
  - [x] 所有 Python 模块可正常导入（paths、config、tools、tool_executor、server）

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 1（可与 Task 2 并行）
- Task 5 依赖 Task 2、Task 3、Task 4
- Task 6 依赖 Task 2（可与 Task 3、Task 4 并行）
- Task 7 依赖 Task 5
- Task 8 依赖 Task 5、Task 6、Task 7