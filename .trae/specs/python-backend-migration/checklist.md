# Checklist

## 项目基础结构
- [x] `backend/` 目录存在，包含 `server.py`、`tools.py`、`tool_executor.py`、`paths.py`、`config.py`、`cli.py`
- [x] `backend/requirements.txt` 存在，包含 FastAPI、uvicorn、httpx
- [x] `python -m backend.server` 可成功启动（22 个路由）

## 配置与路径模块
- [x] Windows 下 AppData 路径指向 `%APPDATA%\PlanMosaic`
- [x] `config.json` 中所有字段（api.deepseek.*、api.qwen.*、agent.provider、server.*、security.*、timeouts.*）被正确加载
- [x] `data.json`、`agent-log.json` 路径获取正确
- [x] 数据备份创建与旧备份清理逻辑正确（保留最近 10 个）

## 工具定义模块
- [x] 16 个工具定义全部迁移，JSON Schema 与 `ai-tools.js` 一致
- [x] `json.dumps(tools)` 输出与 `JSON.stringify(AI_TOOLS)` 结构等价

## 工具执行引擎
- [x] 工具路由映射表包含 46 条旧名称→新名称映射
- [x] `view_schedule` 三种模式（list_all / keyword / 单日期）正确
- [x] `add_schedule` 单次添加和周期性添加（daily/weekly/weekdays）正确，含冲突检测
- [x] `modify_schedule` 6 种操作子类型正确（delete_slots / modify_slot / add_slot / delete_all_matching / update_all_matching / batch_delete_dates）
- [x] `manage_tasks` 6 种操作子类型正确
- [x] `manage_big_tasks` 7 种操作子类型正确
- [x] `manage_courses` 10 种操作子类型正确
- [x] `check_conflicts`、`analyze`、`manage_templates` 正确
- [x] 深度规划工具（value_monetization、roi_calculator、milestone_planner、swot_analysis、decision_matrix、web_search_evaluate、estimate_task_time）返回合理结果
- [x] 数据持久化正确（data.json 读写 + 备份机制）

## FastAPI 服务器
- [x] `POST /api/agent-chat` 返回格式与 `server.js` 一致
- [x] `POST /api/agent-chat-stream` SSE 流式返回正确处理 content/reasoning/retry/status 事件
- [x] `POST /api/deep-planning-chat` 使用 reasoner 模型和工具白名单
- [x] `POST /api/deep-planning-profile` 正常返回画像提取结果
- [x] `GET /api/schedule-data` 和 `POST /api/save-schedule` 正常
- [x] `GET /api/agent-history` 和 `POST /api/agent-save` 正常
- [x] `POST /api/agent-approve` 正常执行提案
- [x] `POST /api/generate-react-log` 生成格式正确的 ReAct 日志
- [x] `POST /api/test-connection` 返回网络连接测试结果
- [x] `GET /api/config` / `POST /api/config` 正常
- [x] 静态文件服务正确（HTML、JS、CSS、JSON、图片）
- [x] 意图识别（needsReasoning）正确区分推理模型和普通模型
- [x] `GET /health` 健康检查端点正常
- [x] `GET /api/startup-scan` 正常
- [x] `POST /api/agent-archive` 正常
- [x] `POST /api/agent-clear` 正常

## CLI 工具
- [x] `python -m backend.cli` 显示当前月日历
- [x] `python -m backend.cli -m YYYY-MM` 显示指定月日历，有安排日期高亮
- [x] `python -m backend.cli -d YYYY-MM-DD` 显示指定日期详细安排
- [x] `python -m backend.cli -h` 显示帮助信息

## Electron main.js 适配
- [x] Electron 启动时自动启动 Python 后端子进程
- [x] Electron 启动时等待 Python 后端健康检查通过后再加载页面
- [x] 所有 IPC handler 改为通过 HTTP 调用 Python 后端
- [x] main.js 中无直接调用 DeepSeek/Qwen API 的代码
- [x] main.js 中无工具执行代码
- [x] Electron 退出时正确终止 Python 子进程
- [x] `preload.js` 保持不变

## 端到端验证
- [x] Python 后端启动成功，所有 8 个核心 API 端点返回正确
- [x] Electron 模式：main.js 重构完成，Python 后端进程管理就绪
- [x] 配置文件格式不变，现有 `config.json` 可直接使用
- [x] 数据格式不变，现有 `data.json` 可直接使用
- [x] CORS 中间件已配置，允许所有来源

## 代码质量
- [x] main.js 从 3446 行精简到 ~1062 行（减少 69%）
- [x] 所有 Python 模块可正常导入无错误
- [x] server.py 包含 22 个路由（原 14 个 + 新增 4 个 + 静态文件）