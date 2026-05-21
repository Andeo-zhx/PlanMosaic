# Electron Desktop Agent-Centric Redesign Spec

## Why
Electron 桌面端当前以日历+日程为主视图，Agent（Mosa）仅作为可拖拽的悬浮面板存在，是"配角"。产品要求全端 Agent 化——桌面端同样需要将 Agent 对话提升为主界面核心，日历/日程等传统功能降级为通过 Agent 触达的二级视图。桌面端已有 Design Token 体系、毛玻璃基础、流式聊天能力，改造成本可控。

## What Changes
- **主视图互换** ⚠️ **BREAKING**: 日历+日程从主视图降为侧边栏/弹窗，Agent 对话面板从悬浮小窗提升为占据主区域的全功能聊天界面
- Agent 对话成为默认主视图，启动时自动检索日程并生成温馨欢迎消息
- 日历/日程/任务改为右侧可折叠侧边栏，通过 Agent 对话中的快捷入口或侧边栏切换按钮打开
- 现有可拖拽悬浮 Agent 面板保留为快速唤起入口（等价于 Android FAB）
- **System Prompt 温馨化**: 注入人格、emoji 点缀、朋友式陪伴语气
- **思路链可视化**: reasoning_content 不再丢弃，在前端以可折叠"💭 思路过程"组件展示
- **模型升级**: `deepseek-chat` → `deepseek-v4-flash`
- 毛玻璃 token 扩展到日程卡片、确认面板等更多模块
- 深色模式完整兼容

## Impact
- Affected specs: agent-centric-redesign（桌面端对等实现）
- Affected code:
  - `index.html`: 主布局重构（日历→Agent 互换）, 新增思路链 CSS/HTML, 毛玻璃 token 扩展
  - `ai-agent.js`: 思路链解析+渲染, 启动检索逻辑, 欢迎消息生成
  - `main.js`: System Prompt 重写, MODEL_NAME 改为 deepseek-v4-flash, 新增启动检索 IPC
  - `ai-tools.js`: 工具描述语气微调（可选）
  - `preload.js`: 可能新增 IPC 通道

## ADDED Requirements

### Requirement: Agent as Main View
系统 SHALL 将 Agent 对话界面作为主视图，替代当前的日历中心布局。

#### Scenario: 应用启动
- **WHEN** 用户启动 PlanMosaic 桌面端
- **THEN** Agent 对话占据主区域（中央大面积），Agent 自动检索日程并以温馨语气展示欢迎消息
- **THEN** 日历/日程/任务折叠为右侧可展开的侧边栏，默认收起

#### Scenario: 切换视图
- **WHEN** 用户点击侧边栏切换按钮或 Agent 引导入口
- **THEN** 右侧侧边栏展开显示日历+日程，Agent 对话区域自适应缩小

### Requirement: Agent Startup Scan
系统 SHALL 在启动时让 Agent 自动检索用户数据并生成个性化欢迎消息。

#### Scenario: 首次启动/新会话
- **WHEN** 应用加载完成
- **THEN** Agent 后台检索今日日程、昨日未完成任务
- **THEN** 根据时段生成温馨欢迎语（"早上好呀～☀️"等），并展示日程摘要

#### Scenario: 无日程数据
- **WHEN** Agent 检索发现用户今日无日程
- **THEN** Agent 主动用温馨语气建议规划

### Requirement: Warm System Prompt
系统 SHALL 使用温馨人格化的 System Prompt 替代当前简洁版本。

#### Scenario: Agent 回复风格
- **WHEN** Agent 生成回复
- **THEN** 语气温暖亲切，使用 emoji 点缀，错误时温柔引导

### Requirement: Thinking Chain UI
系统 SHALL 将 AI 的推理过程以可折叠方式在前端展示。

#### Scenario: 复杂推理可见
- **WHEN** Agent 回复包含 reasoning_content（推理过程）
- **THEN** 在回复气泡上方显示"💭 思路过程"折叠入口，默认折叠
- **THEN** 点击展开显示推理步骤（等宽字体、浅色背景），带动画

#### Scenario: 简单回复不可见
- **WHEN** 某次回复无推理过程
- **THEN** 不显示思路链入口

### Requirement: AI Model Upgrade
系统 SHALL 使用 `deepseek-v4-flash` 作为默认对话模型。

#### Scenario: AI 调用
- **WHEN** Agent 发起对话请求
- **THEN** 使用 deepseek-v4-flash 模型

### Requirement: Glassmorphism Expansion
系统 SHALL 将毛玻璃效果扩展到更多 UI 模块。

#### Scenario: 卡片和面板
- **WHEN** 界面展示日程卡片、确认面板、侧边栏等模块
- **THEN** 采用半透明背景 + backdrop-filter 模糊 + 细边框

#### Scenario: 深色模式
- **WHEN** 用户切换深色模式
- **THEN** 毛玻璃效果自适应调整为深色半透明值

### Requirement: Floating Agent Quick Entry
系统 SHALL 保留悬浮 Agent 入口按钮作为快速唤起方式。

#### Scenario: 侧边栏打开时
- **WHEN** 用户正在查看日历/日程侧边栏
- **THEN** 浮动 Agent 按钮可见，点击可将焦点切回 Agent 对话主视图

## MODIFIED Requirements

### Requirement: Main Layout
系统 SHALL 采用 Agent 对话居中 + 右侧可折叠侧边栏的布局，替代日历居中 + Agent 悬浮面板的旧布局。

- **WHEN** 应用启动且无对话历史
- **THEN** Agent 对话区占据主区域，显示欢迎页 + 快捷操作 + 输入框
- **WHEN** 用户需要查看日历或日程
- **THEN** 通过侧边栏切换按钮展开右侧面板

## REMOVED Requirements

### Requirement: Calendar-Centric Default Layout
**Reason**: 日历作为默认主视图无法体现 Agent 核心定位。
**Migration**: 日历+日程移入右侧可折叠侧边栏；Agent 对话成为默认主视图。悬浮 Agent 面板保留为快速入口。