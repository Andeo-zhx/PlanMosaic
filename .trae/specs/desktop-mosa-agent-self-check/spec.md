# Desktop 端 Mosa Agent 自我检查能力强化 Spec

## Why
当前 Desktop 端 Mosa Agent 存在"自我宣告成功"与"实际数据落盘"不一致的风险：工具返回 `success=true` 不代表数据真的被修改（`fix-tool-call-apply-gaps` 已部分修复），且 Agent 完成写操作后从不主动回读验证。一旦底层工具静默失败、proposal 审批未触发实际写入、或并发覆盖导致数据回滚，Agent 仍会对用户宣称"已安排好"，造成严重的"以为完成实际未完成"问题。本 Spec 在不改动现有 9 个核心工具的前提下，通过新增专用自检工具、改造 System Prompt、增加回读校验链路，让 Mosa 养成"完成任何工作后都重新设法检查效果"的肌肉记忆。

## What Changes
- **新增 `verify_changes` 自检工具**：接受一组"断言条件"（date / scheduleId / slotKey / 期望字段值），在工具执行层从最新数据源（`schedules` dict / `data.json`）回读并对比，返回每条断言的 PASS/FAIL 明细
- **System Prompt 注入自检纪律**：所有写操作类工具（`add_schedule` / `modify_schedule` / `manage_tasks` / `manage_courses` / `manage_templates`）完成后必须追加一次 `verify_changes`，将断言结果融入对用户的回复
- **Frontend 展示自检徽章**：在 Agent 流式回复的气泡底部追加"✅ 已校验 / ⚠️ 校验未通过 / ⏭️ 跳过校验"三态徽章，点击可展开断言明细
- **失败自动重试 + 兜底上报**：当 `verify_changes` 返回 FAIL 且工具可重试（幂等），Agent 最多自动重试 1 次；不可重试时切换为 `analyze(action="health_check")` 报告数据状态，并对用户诚实说明"我尝试了 X 但未通过自检"
- **录制 ReAct 转录时携带自检轨迹**：扩展 `/api/generate-react-log` 输出格式，在 Action 行后追加 `Self-Check` 段落
- **CLI 端到端自检脚本**：在 `test/cases/` 新增 `agent-self-check.js`，覆盖 3 类典型场景：① 添加日程→回读断言字段；② 删除时间段→断言该 time 不再存在；③ 修改任务完成时间→断言 estimated_vs_actual 字段已更新

## Impact
- Affected specs: `fix-tool-call-apply-gaps`（自检是它的"运行时保险"补强）、`agent-framework-enhancement`（ReAct 转录格式需扩展）
- Affected code:
  - `planmosaic desktop/ai-tools.js`：在工具数组尾部追加 `verify_changes` 工具定义
  - `planmosaic desktop/main.js`：System Prompt 注入自检纪律段；`callDeepseekAPIMessages` 流式分支在工具执行后根据 `shouldSelfCheck` 标记自动追加 `verify_changes` 二次调用
  - `planmosaic desktop/backend/tool_executor.py`：新增 `_execute_verify_changes` 分支（与 `tool_executor.py:L1680` 旁的 dispatcher 对齐）
  - `planmosaic desktop/server.js`：`/api/generate-react-log` 扩展输出 `Self-Check` 段
  - `planmosaic desktop/ai-agent.js`：前端消息气泡追加自检徽章 UI，监听 SSE 的 `self_check` 自定义事件
  - `planmosaic desktop/index.html`：徽章 CSS + 折叠明细样式
  - `planmosaic desktop/test/cases/agent-self-check.js`（新增）：CLI 自检测试脚本

## ADDED Requirements

### Requirement: verify_changes 自检工具
系统 SHALL 提供一个 `verify_changes` 工具，让 Agent 在写操作完成后以声明式断言的方式回读数据并验证落盘结果。

#### Scenario: 添加日程后校验新增字段
- **WHEN** Agent 刚调用 `add_schedule` 在 2026-06-10 添加了 `timeSlots=[{time:"15:00-16:00", activity:"开会"}]`
- **THEN** Agent 紧接着调用 `verify_changes` 传入断言：`{date:"2026-06-10", slotKey:"15:00-16:00", expect:{activity:"开会"}}`
- **THEN** 工具从 `schedules["2026-06-10"].timeSlots` 实际查询，返回 `{passed: true, assertions: [{key:"activity", expected:"开会", actual:"开会", pass:true}], source:"memory"}`

#### Scenario: 修改失败时报告不一致
- **WHEN** Agent 调用 `modify_schedule` 删除 2026-06-10 的 `15:00-16:00` 段
- **AND** 后端因 proposal 审批未真正落盘，导致 `timeSlots` 仍包含该段
- **THEN** Agent 调用 `verify_changes` 断言 `expect:{slotExists:false}` 返回 `{passed: false, reason:"slot 15:00-16:00 仍然存在", source:"memory"}`
- **THEN** Agent 对用户的回复不宣称"已删除"，而是说明"我尝试删除但自检未通过，建议手动确认"

#### Scenario: 批量断言支持
- **WHEN** Agent 一次性修改了 N 个日期（周期性添加）
- **THEN** Agent 传入 `assertions=[{date, slotKey, expect}, ...]` 数组
- **THEN** 工具逐条对比并返回每条的 PASS/FAIL + 汇总 `passed_count/total_count`

#### Scenario: 工具不存在/数据源不可读
- **WHEN** Agent 调用 `verify_changes` 传入一个不存在的日期或错误的参数
- **THEN** 返回 `{passed: false, error:"数据源中无该日期: 2026-06-10", source:"memory"}`，不抛异常

### Requirement: System Prompt 自检纪律
系统 SHALL 在 System Prompt 中显式注入自检规则，让 Agent 形成"写后必检"的默认行为。

#### Scenario: 写操作完成后自动追加 verify_changes
- **WHEN** Agent 完成任意写操作类工具（add/modify/manage_*）且工具返回 success
- **THEN** Agent 在同一轮 tool loop 中追加一次 `verify_changes` 调用
- **AND** 至少传入 1 条核心字段断言（如"该时间段确实存在"或"该字段值已更新"）

#### Scenario: 跳过自检的明确场景
- **WHEN** 工具调用属于纯只读（`view_schedule` / `analyze` / `web_search_evaluate` / `estimate_task_time`）
- **THEN** Agent 跳过 `verify_changes`，且不展示自检徽章
- **WHEN** 工具调用因 `error` 字段失败
- **THEN** Agent 不追加 `verify_changes`，徽章状态为 `⏭️ 跳过校验`

#### Scenario: 自检失败时的回复策略
- **WHEN** `verify_changes` 返回 `passed: false`
- **THEN** Agent 不得对用户宣称"已完成"
- **AND** 诚实说明"我尝试了 X，自检发现 Y 仍为 Z，可能是未真正落盘"
- **AND** 提议用户：① 手动确认；② 重新发起；③ 调用 `view_schedule` 再次核对

### Requirement: 自检徽章 UI
系统 SHALL 在 Agent 流式回复气泡底部展示自检结果徽章，让用户一眼看到本次回复是否经过验证。

#### Scenario: 三态徽章渲染
- **WHEN** Agent 消息体完成流式渲染
- **THEN** 气泡底部追加一个徽章：
  - `✅ 已校验（N 项全通过）`（绿色，verify_changes passed）
  - `⚠️ 自检未通过：{原因摘要}`（黄色，可点击展开明细）
  - `⏭️ 跳过校验`（灰色，纯只读操作或工具失败）

#### Scenario: 点击徽章展开断言明细
- **WHEN** 用户点击 `✅` 或 `⚠️` 徽章
- **THEN** 展开显示所有断言的 `key / expected / actual / pass` 列表
- **AND** 失败项以红色高亮

#### Scenario: 流式输出中徽章占位
- **WHEN** Agent 还在流式输出
- **THEN** 徽章区域渲染为浅色"校验中…"占位
- **AND** 流式 done 事件到达后被替换为最终三态之一

### Requirement: 失败自动重试 + 兜底
系统 SHALL 在 `verify_changes` 失败且工具可重试时尝试一次自动重试，仍失败则诚实上报。

#### Scenario: 可重试工具的自动重试
- **WHEN** `add_schedule` / `modify_schedule` 等可重试工具的 `verify_changes` 返回 FAIL
- **AND** 失败原因是临时性的（如"该时间段已被占用"）而非逻辑性错误
- **THEN** Agent 最多自动重试 1 次（修改参数后再次调用原工具 + 再次 `verify_changes`）
- **AND** 重试成功时徽章仍为 `✅`，但 tooltip 标注"已重试 1 次后通过"

#### Scenario: 不可重试时切换 health_check
- **WHEN** 重试仍失败或工具不可重试（proposal 审批型）
- **THEN** Agent 自动调用 `analyze(action="health_check")` 报告整体数据状态
- **AND** 在最终回复中向用户说明"自检 + 健康度检查均提示异常，建议手动核对"

### Requirement: ReAct 转录携带自检轨迹
系统 SHALL 在 `/api/generate-react-log` 输出中追加 `Self-Check` 段落，使转录文本可追溯 Agent 的验证行为。

#### Scenario: 标准 ReAct 文本扩展
- **WHEN** Agent 完成含自检的对话回合
- **THEN** ReAct 转录在每条 `Action` 行后追加：
  ```
  Self-Check: ✅ 3/3 项通过
    - [date:2026-06-10, slotKey:15:00-16:00, activity:开会] → match
  ```
- **AND** 失败时以 `⚠️ X/Y 项未通过` 呈现

#### Scenario: 无自检场景
- **WHEN** 工具调用为纯只读
- **THEN** ReAct 文本不出现 `Self-Check` 段落，转录格式与 v1 保持完全一致

### Requirement: CLI 端到端自检测试
系统 SHALL 提供 CLI 测试脚本，覆盖三类典型写后自检场景。

#### Scenario: 测试 1 — 添加日程后字段断言
- **GIVEN** 启动应用并连接 Python 后端
- **WHEN** Agent 对话"帮我把明天下午 3 点到 4 点安排成开会"
- **THEN** 测试断言：响应中包含 `verify_changes` 的 `passed:true`
- **AND** 断言：后续调用 `view_schedule(date=明天)` 能看到该时间段
- **AND** 断言：消息气泡底部有 `✅` 徽章

#### Scenario: 测试 2 — 删除失败时不宣称成功
- **GIVEN** 预先存在一个 `proposal.delete` 但审批被拒
- **WHEN** Agent 对话"删除刚才那个时间段"
- **THEN** 测试断言：Agent 回复中**不**包含"已删除"等确认措辞
- **AND** 断言：徽章为 `⚠️` 状态
- **AND** 断言：Agent 调用的下一个工具是 `analyze(action="health_check")` 或 `view_schedule`

#### Scenario: 测试 3 — 批量断言报告
- **GIVEN** Agent 通过周期性添加在 7 天各加 1 个时间段
- **WHEN** Agent 调用 `verify_changes` 传入 7 条断言
- **THEN** 测试断言：响应 `passed_count == 7 && total_count == 7`
- **AND** 断言：每条断言的 `source == "memory"`

## MODIFIED Requirements

### Requirement: 写操作成功语义
所有写操作工具的 `success=true` 响应 SHALL 在前端 Agent 视角下被视为"待自检"而非"已完成"，必须配合 `verify_changes` 才形成完整闭环。

#### Scenario: 直接执行型工具（如 add_schedule）
- **WHEN** 工具返回 `success=true` 但 `verify_changes` 失败
- **THEN** Agent 对用户的最终回复中**不**写"已添加/已安排/已完成"等确定性措辞
- **AND** 写"我尝试添加但自检未通过…"等诚实措辞

#### Scenario: 提案确认型工具（如 modify_schedule）
- **WHEN** 工具返回 `proposal.created=true`
- **THEN** 自检被推迟到用户点击确认 + 后端审批执行器返回结果之后
- **AND** 审批执行器响应中附带 `dataChanged:true/false` 信号，前端 Agent 据此决定是否追加 `verify_changes`

## REMOVED Requirements

### Requirement: 无自检的"工具自报成功"信任链
**Reason**: 历史问题中 Agent 经常因工具静默返回 `success=true` 而误判任务完成，导致用户信任损耗。
**Migration**: 改用"工具自报 + Agent 自检 + 前端徽章"三层校验；任何"未通过自检"都必须显式呈现给用户。
