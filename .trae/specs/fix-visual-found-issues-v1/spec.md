# 修复视觉化测试识别问题 v1 Spec

## Why

`desktop-visual-browser-testing` 通过源码静态分析（GUI 在子代理环境无法启动）识别出 **17 条真问题**（5 P0 + 7 P1 + 5 代表性 P2/P3），已全部回流入该 spec 的 `tasks.md` 末尾。本 spec 的目标：

1. **修复**这 17 条问题中**至少 12 条**（5 P0 全部 + 7 P1 全部 + 至少 0~2 条 P2），工作量约 4~5 小时
2. **重新跑一轮视觉化测试**（v2 回归），验证修复有效、未引入新问题
3. 修复策略：**小颗粒、每条独立子任务、可独立验证**，避免一次性大改

P2/P3 中有 3 条（Issue 14 clear-conversations 确认 / Issue 15 M-H ReAct Escape / Issue 16 focus-visible）工作量极小（5~10 分钟），在 P1 阶段顺手修了。Issue 17（1024 断点）和 Issue 13（错误引导链接）作为可选项。

## What Changes

### 修复范围（5 P0 + 7 P1 + 3 P2，**15 条**）

**P0（5 条，全部修）**：
- `preload.js` 新增 `onAgentStreamError` channel
- `ai-agent.js` `sendAgentMessage` 添加 stream-error 监听、清 typing + 显示错误气泡
- `preload.js:71-72` 移除孤儿 `testExec` / `testQuery`（或注册 handler，**二选一，默认移除**）
- 6 个弹窗接入 `_modalStack` 模式，添加遮罩 click 关闭
- `index.html` `saveApiKey` / `generateReActLog` handler 加防抖 + loading

**P1（7 条，全部修）**：
- `openBigTaskModal` 加 `classList.contains('active')` 防护
- 侧边栏滚动位置保存/恢复
- 发送按钮加 spinner
- `addToHistory` 保存 `reasoning_content`
- Python 后端重启加 backoff（2s/4s/8s）
- catch 块清 typing indicator
- 输入框加 maxLength=8000 截断

**P2（3 条可选，全部修）**：
- `clear-conversations` 加二次确认
- M-H ReAct 弹窗补 Escape
- 全局加 `:focus-visible` 焦点态

### 回归测试（v2）
- 重启 Electron 内置 Browser
- 重新跑 `desktop-visual-browser-testing/visual-test-script.md`
- 对照 v1 报告的 23 个问题，**逐条验证**是否已 PASS
- 输出 `visual-report-v2.md`
- 特别关注：**修复是否引入新问题**（回归）

## Impact

- Affected specs:
  - 修复来源：`desktop-visual-browser-testing`（v1 报告）
  - 关联：`ux-interaction-audit`、`fix-history-reasoning-stripping`、`fix-right-panel-animation-jitter`
  - 输出：`visual-report-v2.md`（回归报告）
- Affected code:
  - `PlanMosaic Desktop/preload.js`（P0-1, P0-2, P0-3 联动）
  - `PlanMosaic Desktop/ai-agent.js`（P0-1, P1-3, P1-4, P1-6, P1-7）
  - `PlanMosaic Desktop/main.js`（P0-2 联动, P1-5 backoff, P2-1 confirm）
  - `PlanMosaic Desktop/index.html`（P0-3, P0-4, P0-5, P1-1, P1-2, P2-2, P2-3）

## ADDED Requirements

### Requirement: 修复 5 个 P0 阻塞问题
系统 SHALL 修复 v1 报告识别的全部 5 个 P0 阻塞。

#### Scenario: `onAgentStreamError` 事件链路打通
- **WHEN** AI 流式响应超时（2min）/ 45s 心跳超时 / 网络断开
- **THEN** 主进程 `main.js:744, 765` 发送 `agent-stream-error` 事件
- **AND** preload 暴露 `onAgentStreamError` 监听
- **AND** renderer `ai-agent.js sendAgentMessage` 监听该事件，清 typing indicator + 显示错误气泡

#### Scenario: `testExec` / `testQuery` 孤儿通道清理
- **GIVEN** `preload.js:71-72` 暴露但 `main.js` 无 handler
- **WHEN** 修复完成
- **THEN** `preload.js:71-72` 两行被移除（或 main.js 注册真实 handler，**选 A 移除**）
- **AND** renderer console 不再报"No handler registered"

#### Scenario: 6 个弹窗点遮罩外关闭
- **WHEN** 打开 M-A 设置 / M-B 大任务 / M-C 实际工时 / M-D 课程输入 / M-E 深度规划 / M-H ReAct 任一弹窗
- **THEN** 点击遮罩（弹窗外的 `.modal-overlay` 区域）→ 弹窗关闭
- **AND** 与 M-F/M-G 行为一致

#### Scenario: saveApiKey 防抖 + loading
- **WHEN** 在设置弹窗 200ms 内连点 3 次"保存"按钮
- **THEN** 最多触发 1 次 `setApiKey` IPC
- **AND** 按钮在请求期间显示"保存中..."且 disabled

#### Scenario: generateReActLog 防抖 + loading
- **WHEN** 在 Agent 弹窗 200ms 内连点 3 次 ReAct 按钮
- **THEN** 最多触发 1 次 generate-react-log 请求
- **AND** 按钮在请求期间显示"生成中..."且 disabled

### Requirement: 修复 7 个 P1 严重问题
系统 SHALL 修复 v1 报告识别的全部 7 个 P1 严重问题。

#### Scenario: openBigTaskModal 重复打开防护
- **WHEN** 200ms 内连点"+ 添加大任务"按钮 3 次
- **THEN** `_modalStack` 只含 1 个 'bigTask'（不污染）

#### Scenario: 侧边栏滚动位置保留
- **WHEN** 展开 → 滚到中部 → 折叠 → 再展开
- **THEN** 滚动位置自动恢复到折叠前的位置

#### Scenario: 发送按钮 spinner 视觉
- **WHEN** 消息已发送、等待首 chunk 期间
- **THEN** 发送按钮显示旋转 spinner + "发送中..." 文案
- **AND** 收到首 chunk 后立即恢复正常态

#### Scenario: Pro 模型 reasoning_content 进 history
- **GIVEN** 已选择 Pro 模型（`deepseek-v4-pro`）
- **WHEN** 发送含推理的消息
- **THEN** `addToHistory` 保存 `reasoning_content` 字段
- **AND** follow-up 请求的 messages 数组含完整 `{content, reasoning_content}`

#### Scenario: Python 后端重启 backoff
- **WHEN** 连续 3 次 Python 后端启动失败
- **THEN** 重启间隔依次为 2s → 4s → 8s（递增 backoff）

#### Scenario: typing indicator 在错误时不残留
- **WHEN** 触发网络错误 / 401 / 超时
- **THEN** catch 块执行时立即清掉 typing indicator
- **AND** 不再有"AI 正在思考..."永久残留

#### Scenario: 超长消息客户端截断
- **WHEN** 输入框字符数 > 8000
- **THEN** toast 提示"已截断到 8000 字符"
- **AND** 实际发送内容 ≤ 8000 字符
- **AND** 不触发后端 400/413

### Requirement: 修复 3 个 P2 中等问题
系统 SHALL 修复 v1 报告识别的 3 个 P2 中等问题（clear-conversations 确认 / M-H ReAct Escape / focus-visible）。

#### Scenario: clear-conversations 二次确认
- **WHEN** 调用"清空对话历史"功能
- **THEN** 弹出 confirm 框"确认清空所有对话历史？此操作不可恢复"
- **AND** 用户取消时不删除
- **AND** 用户确认后才同步删除 `agent_history` + `archive`

#### Scenario: M-H ReAct 弹窗 Escape 关闭
- **WHEN** 打开 ReAct 日志弹窗 → 按 Escape
- **THEN** 弹窗关闭（与其它弹窗一致）

#### Scenario: 全局 focus-visible 键盘焦点态
- **WHEN** 键盘 Tab 切换焦点
- **THEN** 元素显示 2px `var(--accent-primary)` outline + 2px offset
- **AND** 鼠标点击不触发（`:focus-visible` 区分）

### Requirement: 视觉化回归测试 v2（Browser-use 方式）
系统 SHALL 修复后**重新跑一遍**视觉化测试，对比 v1 报告，输出回归报告。

**测试方法调整（2026-06-04 决定）**：
- **不启动 Electron 桌面程序**（`npm start` 在子代理环境无法稳定启动 GUI）
- 改用 **IDE 内置浏览器的 Browser-use 能力**做视觉化测试
- 具体路径：
  1. 用 IDE 的 Browser 加载 `index.html`（作为静态页面，预览 UI/CSS/JS 行为）
  2. 通过 DevTools 模拟 IPC 行为（手动 `window.electronAPI` mock 或注入响应）
  3. 用 Browser-use 的截图/像素采样能力捕获每个修复点
  4. **核心 IPC 链路测试仍由 v1 的 test harness / 静态分析覆盖**

#### Scenario: v1 报告问题逐条核对
- **WHEN** 回归测试开始
- **THEN** 对 v1 报告的 23 个问题（5 P0 + 7 P1 + 8 P2 + 3 P3）逐条核对 PASS/FAIL
- **AND** 至少 12 条已修问题标记 PASS

#### Scenario: 未引入新问题
- **WHEN** 修复后跑 Browser-use 全套检查
- **THEN** 新识别问题数 ≤ 2 条（回归容忍度）
- **AND** 任何新 P0 必须立即记录

#### Scenario: 输出 visual-report-v2.md
- **WHEN** 回归测试完成
- **THEN** `visual-report-v2.md` 含：v1 → v2 对比表、新增/遗留问题、修复成功率
- **AND** 每条修复点附 Browser-use 截图证据

## MODIFIED Requirements
（无，本 spec 修复具体缺陷，不修改 spec-level requirement）

## REMOVED Requirements
（无）
