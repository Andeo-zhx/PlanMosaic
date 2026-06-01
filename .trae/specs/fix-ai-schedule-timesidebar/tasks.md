# AI日程时间栏修复 - 任务列表

## 🔴 P0 — 数据流断裂修复

- [x] **Task 1**: 修复 `_write_schedule_data` 调用无异常保护
  - [x] 1.1 在 `backend/server.py` 的 `_call_ai_api_stream` 中，用 try-except 包裹 `_write_schedule_data(schedule_data)` 调用
  - [x] 1.2 catch 到 `OSError` 时记录日志，设置 `write_error = True`，但不 re-raise
  - [x] 1.3 确保即使 `_write_schedule_data` 失败，SSE 流仍正常发送 `result` 事件（含 `writeError: true`）
  - [x] 涉及文件: `backend/server.py`
  - [x] 同时修复了非流式 `_call_ai_api` 中的同样问题

- [x] **Task 2**: 修复二次API调用失败导致 `shouldRefresh` 丢失
  - [x] 2.1 在 `backend/server.py` 的 `_call_ai_api_stream` 的 except 分支（`httpx.ConnectError` 等网络异常）中，检查 `_parent_modified` 参数
  - [x] 2.2 若 `_parent_modified` 为 True 且当前有重试耗尽，在发送错误消息前先发送 `result` 事件 `shouldRefresh: true`
  - [x] 2.3 确保递归调用链中 `_parent_modified` 参数正确传递
  - [x] 涉及文件: `backend/server.py`
  - [x] 同时修复了非流式 `_call_ai_api` 中的同样问题（retry分支 + 最终return）

- [x] **Task 3**: 修复 `manage_schedule` 未注册到 dispatcher
  - [x] 3.1 在 `backend/tool_executor.py` 的 dispatcher 字典中添加 `'manage_schedule': self._execute_manage_schedule`
  - [x] 3.2 验证 `_execute_manage_schedule` 函数已存在（line 384）且功能完整
  - [x] 涉及文件: `backend/tool_executor.py`

- [x] **Task 4**: 修复工具返回 `error` 时仍设置 `has_data_modification` 的问题
  - [x] 4.1 在 `backend/server.py` 的 `_call_ai_api_stream` 工具结果解析处，增加对 `success` 字段的检查
  - [x] 4.2 仅当 `result_obj.get("success")` 不为 `False` 且无 `error` 字段时，才因 `shouldRefresh` 设置 `has_data_modification = True`
  - [x] 涉及文件: `backend/server.py`
  - [x] 同时修复了非流式 `_call_ai_api` 中的同样问题

## 🟡 P1 — 防御性增强

- [x] **Task 5**: 增加 `_call_ai_api_stream` 的关键路径日志
  - [x] 5.1 在 `has_data_modification` 被设置时记录日志：`logger.info("[AI Stream] Tool %s set has_data_modification=True", name)`
  - [x] 5.2 在 `_write_schedule_data` 成功后记录日志：已存在（`logger.info("[AI Stream] Schedule data written after all tools succeeded")`）
  - [x] 5.3 在 `result` 事件发送前记录日志：`logger.info("[AI Stream] Sending result: shouldRefresh=%s", total_modified)`
  - [x] 涉及文件: `backend/server.py`

- [x] **Task 6**: 前端 `refreshScheduleData` 增加 shouldRefresh 接收日志
  - [x] 6.1 在 `PlanMosaic Desktop/ai-agent.js` 的 `refreshScheduleData()` 调用点添加 `console.log('[AI Agent] shouldRefresh received, refreshing schedule data')`
  - [x] 6.2 在 `renderTimeSidebar()` 调用后添加 `console.log('[AI Agent] renderTimeSidebar called for', sidebarDate, 'slots:', ...)`
  - [x] 涉及文件: `PlanMosaic Desktop/ai-agent.js`

# Task Dependencies

- Task 1 (write保护) → 无依赖
- Task 2 (二次调用兜底) → 无依赖
- Task 3 (dispatcher注册) → 无依赖
- Task 4 (error检测) → 无依赖
- Task 5 (日志增强) → 依赖 Task 1-4 完成
- Task 6 (前端日志) → 无依赖

**推荐执行顺序**: Task 1、Task 2、Task 3、Task 4 可并行 → Task 5、Task 6 可并行