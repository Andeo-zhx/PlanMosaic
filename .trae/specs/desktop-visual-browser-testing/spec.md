# Desktop 端内置 Browser 视觉化交互测试 Spec

## Why

当前项目虽然已有 `live-program-test-plan`（CLI/IPC 自动化方案），但其覆盖的是「应用内部状态层」的链路测试（IPC、API Key、流式响应、配置热重载等），完全无法验证**视觉层面**的交互质量——按钮是否真的能点、表单是否真的有反馈、布局是否真的没有溢出、动画是否真的流畅、毛玻璃/暗色模式是否真的在所有视图下生效。开发者在静态代码审计（`ux-interaction-audit`、`comprehensive-code-fix`）中发现过 16 处静默错误吞没、保存按钮无 loading、提案按钮可重复点击、弹窗缺 Escape、聊天气泡 base64 注入主线程等问题，但这些缺陷**只有真实运行起来、用人眼/视觉模型去观察 DOM 才能最终确认**。

需要一套**在 Electron 内置 Browser 中以可视化方式逐场景驱动**的测试流程，借助 IDE（Trae）的视觉/截图能力，在程序实际打开的状态下，对照检查每个交互的：
- 按钮是否可见、可点、点击后是否有反馈
- 弹窗/侧边栏/抽屉的开关、动效、关闭路径
- 前后端链路（IPC → Python → DeepSeek）返回结果在 UI 上的呈现是否符合预期
- 异常/边界场景下 UI 是否优雅降级，是否有可恢复路径

测试产物包括：每个场景的截图、问题清单、修复建议。

## What Changes

- 编写一份**完整可视交互测试剧本**（plan 文档），按"主流程 → 边界 → 异常恢复"分层组织
- 在 Electron 内置 Browser 中以真实用户视角（鼠标/键盘事件、滚动、输入）逐个执行测试场景
- 借助 IDE 视觉能力（截图、像素采样、DOM 推断）核对 UI 状态
- 在每个场景中**同步监控前后端反馈**：
  - 前端：DevTools Console、Network、DOM 变化
  - 后端：Python 后端 stdout/stderr、`/api/*` 响应时间
- 输出一份**可视化测试报告**（`test/visual-report.md`），包含截图、问题定位、严重程度、修复优先级
- 报告中识别的真问题（不是误报）会被**回流入 `tasks.md` 作为修复任务**，后续走标准 Spec → Apply 流程
- **不修改任何源码**（本阶段为纯诊断）；修复在后续 `*-fix-*` 类型的 spec 中进行

## Impact

- Affected specs:
  - 关联但不直接修改：`ux-interaction-audit`、`live-program-test-plan`、`desktop-agent-centric-redesign`、`comprehensive-code-fix`
  - 本 spec 输出的问题清单会**驱动**后续 `fix-visual-found-issues` 等修复类 spec 的产生
- Affected code:
  - 仅新增测试文档与报告，不改动 `index.html` / `ai-agent.js` / `main.js` / `backend/*`
  - 新增文件：
    - `.trae/specs/desktop-visual-browser-testing/visual-test-script.md`（测试剧本）
    - `.trae/specs/desktop-visual-browser-testing/visual-report.md`（执行后的报告）
    - `.trae/specs/desktop-visual-browser-testing/screenshots/`（截图归档）

## ADDED Requirements

### Requirement: 启动 Electron 内置 Browser 并建立可观测通道
测试 SHALL 在 Electron 内置 Browser（主窗口）中开始，并通过 DevTools 协议/控制台注入建立对前端运行时状态的观察能力。

#### Scenario: 应用以可视化测试模式启动
- **GIVEN** `PlanMosaic Desktop/main.js` 提供的正常启动流程
- **WHEN** 测试开始
- **THEN** 应用窗口正常出现，主进程日志无致命错误
- **AND** Python 后端被自动拉起，`http://127.0.0.1:<port>/api/config` 返回 200

#### Scenario: 启用前端可观测通道
- **WHEN** 测试执行
- **THEN** 打开 DevTools Console，能看到 `[Mosa] init`、`[IPC] register` 等关键日志
- **AND** `window.electronAPI` 上注册的 IPC 方法可在 Console 中枚举

### Requirement: 视觉化按钮测试覆盖
测试 SHALL 对所有用户可点击控件（按钮、图标、可点击卡片）执行"可见性 + 可点性 + 反馈"三项检查。

#### Scenario: 主视图按钮清单核对
- **WHEN** 应用主界面加载完成
- **THEN** 测试枚举以下按钮并截屏核对：Agent 主面板的发送按钮、新建日程、添加任务、切换侧边栏、模型切换（Flash/Pro）、设置入口、账户入口、对外链接（DeepSeek Platform）
- **AND** 每个按钮至少有：未悬停、悬停、按下（mousedown）三种状态的截屏

#### Scenario: 按钮点击反馈验证
- **WHEN** 测试点击任一按钮
- **THEN** UI 立即出现预期反馈（loading、toast、状态切换、列表新增条目）
- **AND** 没有静默无反应的情况（无 `catch {}` 吞错）

#### Scenario: 重复点击防护验证
- **WHEN** 测试在 200ms 内对同一按钮连续点击 3 次
- **THEN** 应用应至少满足以下之一：按钮 disabled、按钮隐藏、loading 状态、幂等去重
- **AND** 不应产生重复的日程/任务/会话

### Requirement: 视觉化交互测试覆盖
测试 SHALL 对关键交互路径执行"用户视角"驱动，并核对每一步的前后端反馈。

#### Scenario: Agent 对话主流程
- **WHEN** 用户在输入框输入文本并点击发送
- **THEN** 输入框清空、消息以用户气泡形式出现、底部出现"AI 正在思考..."或同义指示
- **AND** 流式 chunk 持续追加到 AI 气泡中，最终出现 ✅ 标记或同类完成态
- **AND** 思路链（如有）以可折叠"💭 思路过程"展示，且**只渲染 1 次**（不重复）

#### Scenario: 工具调用闭环
- **WHEN** 发送一条需要创建日程的消息（如"明天下午 3 点开会"）
- **THEN** 出现日程确认面板（日期/时间/标题），用户确认后日程进入右侧列表
- **AND** 后端 `/api/tools/schedule.create` 被命中，后端日志无 traceback

#### Scenario: 弹窗交互
- **WHEN** 打开任意一个弹窗（设置、新建日程、添加任务、提案确认等）
- **THEN** 弹窗出现毛玻璃遮罩、点击遮罩可关闭、按 Escape 可关闭
- **AND** 必填字段有星号等视觉标记
- **AND** 保存期间按钮显示 loading 并被 disabled，保存失败显示明确错误

#### Scenario: 侧边栏/抽屉交互
- **WHEN** 打开/关闭右侧日程侧边栏
- **THEN** 主区域平滑自适应（有动画、不闪烁）
- **AND** 关闭后状态被保留（再次打开仍显示上次的滚动位置/选中项）

#### Scenario: 主题/暗色模式
- **WHEN** 在系统/应用设置中切换暗色 ↔ 亮色
- **THEN** 所有视图（日历、Agent、日程、设置、弹窗）同步切换
- **AND** 文字、图标、背景对比度满足可读性

#### Scenario: 错误降级
- **WHEN** 故意触发异常：空消息提交、断开后端（kill python 进程）、构造超长消息（>5000 字）
- **THEN** 前端显示明确错误（toast/banner/消息气泡），不出现"永久 loading"
- **AND** 后端进程在断开后 3~5s 内被自动重启

### Requirement: 前后端反馈一致性核对
测试 SHALL 在每个关键场景中**同时核对前端和后端反馈**是否一致，捕获单向异常（前端 OK 但后端 500、后端 OK 但前端无渲染等）。

#### Scenario: 双向反馈核对
- **WHEN** 任意 IPC 调用
- **THEN** 前端 DOM 变化与后端 `/api/*` 响应在 200ms 内同步
- **AND** 失败时两端都有可观察的失败信号（无静默）

#### Scenario: 网络/IPC 异常捕获
- **WHEN** 测试中故意制造 IPC 失败（关闭后端、修改配置触发 400）
- **THEN** 前端 Console 出现 `[IPC Error] ...` 或同类可读日志
- **AND** 后端日志出现对应 traceback/警告（不是被静默吞掉）

### Requirement: 可视化报告输出
测试 SHALL 在执行完成后输出结构化报告，标注每个场景的 PASS/FAIL/PARTIAL 及证据。

#### Scenario: 报告生成
- **WHEN** 所有测试场景执行完毕
- **THEN** `visual-report.md` 包含：场景名、状态、关键截图路径、问题描述、严重程度（P0/P1/P2）、修复建议
- **AND** 截图归档到 `screenshots/`，文件名含场景名 + 状态序号

#### Scenario: 问题回流
- **WHEN** 报告中识别出**真问题**（已确认可复现，非误报）
- **THEN** 在 `tasks.md` 末尾追加"问题修复"子任务，每项包含：复现步骤、影响范围、建议方案
- **AND** 不修改源代码（修复留给后续 `fix-*` spec）

## MODIFIED Requirements
（无，本阶段为新增诊断能力）

## REMOVED Requirements
（无）
