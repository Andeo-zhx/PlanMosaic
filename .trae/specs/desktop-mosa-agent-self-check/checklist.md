# Checklist

## verify_changes 自检工具
- [x] `planmosaic desktop/ai-tools.js` 工具数组尾部追加 `verify_changes` 工具定义，包含 date / slotKey / expect / assertions / scope 五个参数
- [x] `planmosaic desktop/backend/tool_executor.py` dispatcher 字典中注册 `verify_changes: self._execute_verify_changes`
- [x] `_execute_verify_changes` 实现单断言 + 批量断言两种调用模式
- [x] 边界场景（日期不存在、段不存在、字段缺失）返回 `passed:false + error`，不抛异常
- [x] `planmosaic desktop/backend/tests/test_verify_changes.py` 覆盖 5 个用例：单条通过 / 单条失败 / 批量通过 / 批量部分失败 / 日期不存在

## System Prompt 自检纪律
- [x] `planmosaic desktop/main.js` 的 System Prompt 拼接处包含"自检纪律"段
- [x] 自检纪律段明确列出写操作工具白名单 + "完成后必须追加 verify_changes" + "自检失败时不得宣称成功"
- [x] `callDeepseekAPIMessages` 流式分支在写操作工具执行后自动追加 `verify_changes` 二次调用
- [x] 同步分支（`server.js` 端）行为与流式分支一致
- [x] SSE 流中新增 `self_check` 事件，payload 包含 badge 状态 + 断言数组

## 失败自动重试 + 兜底
- [x] Agent 循环识别"verify_changes 失败 + 工具在可重试白名单"的情形
- [x] 允许重试 1 次（修正参数后再次调用原工具 + 再次 verify_changes）
- [x] 重试成功时徽章仍为 `✅`，但 tooltip 标注"已重试 1 次后通过"
- [x] 重试失败时自动调用 `analyze(action="health_check")`
- [x] System Prompt 含"重试 + 兜底"指令

## 前端自检徽章 UI
- [x] `ai-agent.js` 消息渲染函数能识别 SSE `self_check` 事件并写入 `lastSelfCheck` 状态
- [x] `index.html` 中 `.agent-message.assistant` 气泡底部追加 `<div class="self-check-badge">` 容器
- [x] 徽章三态 CSS：✅ 绿色 / ⚠️ 黄色 / ⏭️ 灰色
- [x] 点击徽章展开断言明细（key / expected / actual / pass），失败项加红框
- [x] 流式期间徽章显示"校验中…"，done 事件后替换为最终状态
- [x] 深色模式下徽章颜色自适应

## ReAct 转录扩展
- [x] `server.js` 的 `/api/generate-react-log` 端点扫描 `verify_changes` 调用
- [x] 输出格式含 `Self-Check: ✅ X/Y 项通过` 段落
- [x] 每条断言的 `Self-Check` 行下缩进展示明细（失败项加 ⚠️ 前缀）
- [x] 无自检调用的对话保持 v1 输出格式完全一致
- [x] `index.html` ReAct 弹窗 CSS 含 `.react-self-check` 段样式

## CLI 端到端自检测试
- [x] `planmosaic desktop/test/cases/agent-self-check.js` 包含 3 个测试用例
- [x] 用例 1：添加日程→SSE `self_check` 事件 `passed:true` + `view_schedule` 包含该时间段
- [x] 用例 2：删除失败场景→Agent 回复不含"已删除" + 徽章为 `warn` + 下一工具为 `analyze`
- [x] 用例 3：周期性添加 7 段→`verify_changes` 响应 `passed_count==7 && total_count==7`
- [x] `test/runner.js` 注册这三个用例，命令行 `node test/runner.js` 能全部执行

## 端到端联调
- [ ] 手动验证 3 个真实写操作（添加 / 删除 / 修改）的徽章状态正确
- [ ] 手动验证点击徽章展开明细正确
- [ ] 故意制造 1 个失败场景（断网写入）→ Agent 不宣称成功 + 徽章为 ⚠️ + 重试机制触发
- [ ] ReAct 转录弹窗的 `Self-Check` 段正确呈现
- [ ] demo 录屏已录制（添加通过 + 删除失败两类）

## 现有功能不变
- [x] 现有 9 个核心工具全部保留（新增第 10 个 `verify_changes`，不删除任何工具）
- [x] 日常助手 + 深度规划双模式对话正常
- [x] Proposal 确认机制正常
- [x] 流式输出（SSE）正常
- [x] ReAct 转录（v1 格式）向后兼容
- [x] Python 时间估算微服务调用链路未受影响
