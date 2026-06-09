# Tasks

- [x] Task 1: 新增 `verify_changes` 自检工具 Schema 与后端执行器
  - [x] 1.1 在 `planmosaic desktop/ai-tools.js` 工具数组尾部追加 `verify_changes` 工具定义（参数：date / slotKey / expect / assertions 数组 / scope=memory|disk）
  - [x] 1.2 在 `planmosaic desktop/backend/tool_executor.py` 的 dispatcher 字典（位于约 L1680 的 `_execute_manage_schedule` 旁）注册 `'verify_changes': self._execute_verify_changes`
  - [x] 1.3 实现 `_execute_verify_changes` 函数：单断言走 `schedules[date].timeSlots` 内存查询；批量断言走列表逐条校验；返回 `{passed, passed_count, total_count, assertions:[{key, expected, actual, pass}], source}`
  - [x] 1.4 处理边界：日期不存在 / 段不存在 / expect 字段缺失，统一返回 `passed:false + error`，不抛异常
  - [x] 1.5 单元测试：在 `planmosaic desktop/backend/tests/` 新增 `test_verify_changes.py`，覆盖 5 个用例：单条通过 / 单条失败 / 批量通过 / 批量部分失败 / 日期不存在

- [x] Task 2: System Prompt 注入自检纪律 + 流式分支自动追加
  - [x] 2.1 在 `planmosaic desktop/main.js` 的 System Prompt 拼接处追加"自检纪律"段：列出写操作工具清单 + "完成后必须追加 verify_changes" + "自检失败时不得宣称成功"
  - [x] 2.2 在 `callDeepseekAPIMessages` 流式分支的工具执行后置钩子中，根据"刚执行的工具名"判断是否需要自动追加 `verify_changes`（白名单：add_schedule / modify_schedule / manage_tasks / manage_courses / manage_templates / delete_schedule）
  - [x] 2.3 同步分支（`server.js` 端）执行同样的白名单判断，确保两条路径行为一致
  - [x] 2.4 在 SSE 流中新增 `self_check` 自定义事件（payload：badge 状态 + 断言数组），前端据此更新徽章

- [x] Task 3: 失败自动重试 + health_check 兜底
  - [x] 3.1 在 `main.js` Agent 循环内识别"verify_changes 返回 passed:false 且上一工具在可重试白名单"的情形，允许重试 1 次（注入修正后的参数）
  - [x] 3.2 重试仍失败时自动调用 `analyze(action="health_check")`，把健康度评分附加到 SSE 流的自检事件
  - [x] 3.3 System Prompt 增加"重试 + 兜底"指令，要求 Agent 在重试后向用户标注"已重试 1 次后通过"或"重试失败，已调用健康度检查"

- [x] Task 4: 前端自检徽章 UI
  - [x] 4.1 在 `planmosaic desktop/ai-agent.js` 的消息渲染函数中识别 SSE 的 `self_check` 事件，写入 `lastSelfCheck` 状态
  - [x] 4.2 在 `planmosaic desktop/index.html` 中为 `.agent-message.assistant` 气泡底部追加 `<div class="self-check-badge">` 容器 + 三态 CSS（✅ 绿 / ⚠️ 黄 / ⏭️ 灰）
  - [x] 4.3 徽章点击展开断言明细：每条 `<li>` 渲染 key / expected / actual / pass，失败项加 `.assertion-fail` 类
  - [x] 4.4 流式期间徽章区域显示"校验中…"，done 事件后替换

- [x] Task 5: 扩展 ReAct 转录携带自检轨迹
  - [x] 5.1 修改 `planmosaic desktop/server.js` 的 `/api/generate-react-log` 端点：扫描 messages 中的 `verify_changes` 调用与 tool result，生成 `Self-Check: ✅ X/Y 项通过` 段落
  - [x] 5.2 在每条断言的 `Self-Check` 行下缩进展示 `key / expected / actual` 明细（失败项加 ⚠️ 前缀）
  - [x] 5.3 无自检调用的对话保持 v1 输出格式不变（向后兼容）
  - [x] 5.4 在 `index.html` 的 ReAct 弹窗 CSS 中追加 `.react-self-check` 段样式

- [x] Task 6: CLI 端到端自检测试脚本
  - [x] 6.1 在 `planmosaic desktop/test/cases/agent-self-check.js` 新增 3 个测试用例（与 spec 6.1/6.2/6.3 对齐）
  - [x] 6.2 用例 1：发送"明天下午 3 点开会"→ 断言 SSE 流中 `self_check` 事件为 `passed:true` → 断言 `view_schedule` 回读包含该时间段
  - [x] 6.3 用例 2：模拟"删除失败"场景（注入 proposal 被拒）→ 断言 Agent 回复不包含"已删除" → 断言徽章状态为 `warn` → 断言下一个工具调用是 `analyze`
  - [x] 6.4 用例 3：通过周期性添加在 7 天各加 1 段 → 断言 `verify_changes` 响应 `passed_count==7 && total_count==7`
  - [x] 6.5 在 `planmosaic desktop/test/runner.js` 注册这三个用例，确保 `node test/runner.js` 全部执行

- [ ] Task 7: 端到端联调 + 演示案例补充
  - [ ] 7.1 手动验证：连续 3 个真实写操作（添加 / 删除 / 修改）→ 确认 UI 徽章状态正确、点击展开明细正确
  - [ ] 7.2 手动验证：故意制造 1 个失败（断网后写入）→ 确认 Agent 不宣称成功、徽章为 ⚠️、重试机制按预期触发
  - [ ] 7.3 验证 ReAct 转录弹窗中的 `Self-Check` 段正确呈现
  - [ ] 7.4 录制 1 个 demo 录屏（添加日程→自检通过、删除失败→自检未通过）作为课程提交素材

# Task Dependencies
- Task 2.1（System Prompt）依赖 Task 1（verify_changes 工具就绪）
- Task 2.2/2.3（流式自动追加）依赖 Task 1
- Task 3（自动重试）依赖 Task 1 + Task 2
- Task 4（前端徽章）依赖 Task 2.4（SSE self_check 事件）
- Task 5（ReAct 扩展）依赖 Task 1（verify_changes 工具存在才能转录）
- Task 6（CLI 测试）依赖 Task 1 + Task 2 + Task 4
- Task 7（联调）依赖所有前置 Task
- Task 1、5 可与 Task 2.1 部分并行（verify_changes 定义和 ReAct 转录格式互不干扰）
