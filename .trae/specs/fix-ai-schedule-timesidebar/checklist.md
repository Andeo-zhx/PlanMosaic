# AI日程时间栏修复 - 验证清单

## P0 — 数据写入保护

- [x] **C1**: `_call_ai_api_stream` 中 `_write_schedule_data` 调用被 try-except 包裹 → server.py:L776-L783
- [x] **C2**: `_write_schedule_data` 抛出 OSError 时，`has_data_modification` 被设为 False → server.py:L782
- [x] **C3**: `_write_schedule_data` 抛出 OSError 时，SSE result 事件包含 `writeError: true` → server.py:L783 + L812-L813
- [x] **C4**: `_write_schedule_data` 抛出 OSError 时，SSE 流不中断（仍发送 content + result + done） → 异常被捕获后代码继续执行

## P0 — shouldRefresh 兜底

- [x] **C5**: 当 depth=0 的工具执行成功但 depth=1 的 API 调用失败时，仍发送 `shouldRefresh: true` → server.py:L834-L836
- [x] **C6**: `_parent_modified` 参数在递归调用链中正确传递 → server.py:L805 + L697-L698 + L828-L830
- [x] **C7**: except 分支检查 `_parent_modified`，若为 True 则补充发送 result 事件 → server.py:L834-L836

## P0 — dispatcher 注册

- [x] **C8**: `ToolExecutor.execute_tool_call` 的 dispatcher 包含 `'manage_schedule': self._execute_manage_schedule` → tool_executor.py:L367
- [x] **C9**: AI 调用 `manage_schedule` 工具时不再返回 `Unknown tool` → 路由正确分发到 L385 `_execute_manage_schedule`

## P0 — shouldRefresh 精准检测

- [x] **C10**: 工具返回 `{"success": false, "error": "..."}` 时不设置 `has_data_modification` → server.py:L760-L761
- [x] **C11**: 工具返回 `{"shouldRefresh": true, "success": true}` 时正常设置 `has_data_modification` → server.py:L760-L761

## P1 — 日志

- [x] **C12**: 工具设置 `has_data_modification=True` 时有日志记录 → server.py:L579(非流式) + L762(流式)
- [x] **C13**: `result` 事件发送前有日志记录 `shouldRefresh` 值 → server.py:L814
- [x] **C14**: 前端 `refreshScheduleData` 调用点有 console.log → ai-agent.js:L718 + L766

## 端到端验证

- [ ] **C15**: 新用户（无 data.json）通过 AI 聊天添加日程 → 时间块在右侧 timeSidebar 中可见
- [ ] **C16**: 老用户（已有 data.json）通过 AI 聊天添加日程 → 时间块在右侧 timeSidebar 中可见
- [ ] **C17**: AI 回复"已安排"后，前端日志显示 `shouldRefresh received`
- [ ] **C18**: AI 添加日程后，F5 刷新页面 → 时间块仍然存在（数据持久化正确）