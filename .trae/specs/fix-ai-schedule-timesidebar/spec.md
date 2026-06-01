# AI添加日程后右侧timeSidebar不显示时间块 Spec

## Why
用户通过AI聊天添加日程后，AI回复"已安排"，但右侧 Schedule 面板的 timeSidebar 时间栏中不显示已安排的时间块。经全面排查后端`add_schedule`工具执行 → 数据保存 → SSE流 → `shouldRefresh` → 前端刷新 → `renderTimeSidebar` 整条链路，发现**2处已修复** + **4处待修复**的数据流断裂点。

## What Changes
- **已修复** `_execute_add_schedule` 中 `schedule_data.get('schedules', {})` 引用丢失问题（新数据文件无`schedules`键时修改无法回写）
- **待修复** `_write_schedule_data` 在 `_call_ai_api_stream` 中无异常保护 → 写入失败导致 `shouldRefresh=false`且不通知前端
- **待修复** AI二次API调用失败时 `shouldRefresh` 被吞没 → 工具已执行但前端不刷新
- **待修复** `_execute_manage_schedule` 存在但未注册到 `dispatcher` → AI调用 `manage_schedule` 时返回 `Unknown tool`
- **待修复** `has_data_modification` 通过 `shouldRefresh` 检测不可靠 → 工具返回 `error` 而非 `success:false` 时漏检

## Impact
- Affected specs: `fix-schedule-timebar-display`（相关但不同范围）
- Affected code:
  - `backend/tool_executor.py` — `_execute_add_schedule`（已修复）+ `execute_tool_call` dispatcher + `_execute_manage_schedule` 注册
  - `backend/server.py` — `_call_ai_api_stream` 异常保护和 shouldRefresh 兜底

## ADDED Requirements

### Requirement: 新文件首次保存数据引用链完整性
`_execute_add_schedule` SHALL 确保当 `schedule_data` 中无 `schedules` 键时，`schedules` 变量与 `schedule_data['schedules']` 指向同一对象。

#### Scenario: 新用户首次添加日程
- **WHEN** data.json 不存在或不含 `schedules` 键
- **AND** AI调用 `add_schedule` 工具
- **THEN** `schedule_data['schedules']` 应包含新增的 timeSlots
- **STATUS**: ✅ 已修复（`tool_executor.py:609-610`）

### Requirement: 数据写入失败时前端能感知
`_call_ai_api_stream` SHALL 在 `_write_schedule_data` 失败时捕获异常，设置 `has_data_modification=false` 并通过 SSE result 事件通知前端 `shouldRefresh: false, writeError: true`。

#### Scenario: 磁盘满导致写入失败
- **WHEN** `_write_schedule_data` 抛出 OSError
- **THEN** 系统应发送 `result` 事件包含 `shouldRefresh: false, writeError: true`
- **AND** 不应向上抛出未处理异常导致 SSE 流中断

### Requirement: 二次API调用失败时保留 shouldRefresh
`_call_ai_api_stream` SHALL 在递归调用（depth+1）的 except 分支中，当 `_parent_modified` 为 True 时，仍发送 `result` 事件包含 `shouldRefresh: true`。

#### Scenario: 工具执行成功后二次API调用网络超时
- **WHEN** depth=0 中 add_schedule 执行成功并写入数据
- **AND** depth=1 的 API 调用因网络问题进入 except 分支
- **THEN** except 分支应检查 `_parent_modified` 并输出 `result` 事件 `shouldRefresh: true`

### Requirement: `manage_schedule` 工具注册到 dispatcher
`ToolExecutor.execute_tool_call` 的 dispatcher SHALL 包含 `'manage_schedule': self._execute_manage_schedule` 条目。

#### Scenario: AI 调用 manage_schedule 工具
- **WHEN** AI 调用 `manage_schedule` 工具（通过 TOOL_ROUTING 路由）
- **THEN** 应正确分发到 `_execute_manage_schedule` 而非返回 `Unknown tool`

### Requirement: 工具返回 `error` 字段时不应设置 shouldRefresh
`_call_ai_api_stream` SHALL 在解析工具返回结果时，除检查 `shouldRefresh` 外，还应检查 `success` 字段。若 `success: false` 或存在 `error` 字段，不应设置 `has_data_modification = True`。

#### Scenario: 工具返回 success:false 但无异常
- **WHEN** execute_tool_call 返回 `{"success": false, "error": "..."}` 
- **THEN** `has_data_modification` 应保持 False

## MODIFIED Requirements
无

## REMOVED Requirements
无