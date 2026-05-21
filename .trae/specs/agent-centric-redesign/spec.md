# Agent-Centric Redesign Spec

## Why
当前产品虽有成熟的 UI 设计（底部标签栏 + 日程/Mosa/我的三页结构），但 Agent（Mosa）仅作为一个子页面存在，无法体现其作为产品核心价值的定位。产品需要从「功能菜单式 App」转型为「以 Agent 对话为核心的智能助手」，让用户通过自然语言交互完成所有操作，Agent 主动理解用户意图并提供温馨陪伴式服务。

## What Changes
- **导航架构重构** ⚠️ **BREAKING**: 废弃传统底部标签栏，改为 Agent 对话为主界面 + 浮动快捷入口的导航模型
- Mosa 对话页成为应用启动默认页，Agent 温馨欢迎语 + 上下文感知的主动建议
- 日程/课表/个人中心不再作为独立 Tab，改为从 Agent 对话中触达的二级视图
- 全局悬浮 Agent 快捷按钮（FAB），在任何二级页面可快速唤起 Agent 对话面板
- **Agent 主动检索**: 应用启动后 Agent 自动检索用户日程、偏好等数据，生成个性化开场提示
- 对话式操作：查看日程、添加任务、修改设置等操作均可通过对话自然语言完成
- **Agent 温馨语气**: Agent 对话风格温暖、友善、有陪伴感，使用 emoji 点缀，像朋友一样交流
- **思路链可视化**: Agent 思考过程可展开查看、可折叠隐藏，增强透明度和信任感
- **毛玻璃化 UI**: 界面卡片、导航栏、弹窗等模块采用毛玻璃（glassmorphism）效果，轻盈通透
- **System Prompt 优化**: 重写 Agent 系统提示词，注入温馨人格设定和思路链输出规范
- **模型升级**: Agent 底层 AI 模型切换为 `deepseek-v4-flash`，提升响应速度和推理能力
- 统一 Android 端和 Uni-app 端的交互范式与视觉风格

## Impact
- Affected specs: android-ui-revamp（部分修改项需与此 spec 协同）
- Affected code:
  - Android: `MainActivity.kt`（导航架构）, `MosaScreen.kt`（升级为主界面，新增思路链组件和毛玻璃效果）, `MosaViewModel.kt`（新增上下文感知和主动检索）, `BottomNavBar.kt`（废弃/替换）, `ScheduleScreen.kt`（改为二级视图）, `ProfileScreen.kt`（改为二级视图）, `AiApiClient.kt`（模型切换）, `AgentRepository.kt`（System Prompt 优化）, `Color.kt`/`Theme.kt`（新增毛玻璃 token）
  - Uni-app: `pages/mosa/mosa.vue`（从占位页升级为完整对话界面，含思路链和毛玻璃效果）, `pages.json`（路由重配）, `components/custom-tabbar/`（废弃/替换）, `uni.scss`（新增毛玻璃样式变量）

## ADDED Requirements

### Requirement: Agent-Centric Home Screen
系统 SHALL 以 Mosa Agent 对话界面作为应用启动后的主界面。

#### Scenario: 用户首次打开应用
- **WHEN** 用户启动 PlanMosaic
- **THEN** 直接进入 Mosa 对话界面，Agent 根据当前时段展示温馨个性化欢迎语和今日日程概览

#### Scenario: 用户从其他页面返回
- **WHEN** 用户在二级页面点击返回
- **THEN** 回到 Mosa 对话主界面，保留对话历史和滚动位置

### Requirement: Floating Agent Quick Access
系统 SHALL 在所有二级页面提供全局浮动的 Agent 快速唤起按钮（FAB），采用毛玻璃风格。

#### Scenario: 用户在日程页面想咨询 Agent
- **WHEN** 用户在日程页面点击悬浮 Agent 按钮
- **THEN** 弹出 Agent 对话面板（毛玻璃 Bottom Sheet），可进行对话交互而不离开当前页面

#### Scenario: 用户在个人设置页面唤起 Agent
- **WHEN** 用户在个人中心点击悬浮 Agent 按钮
- **THEN** Agent 毛玻璃对话面板弹出，Agent 上下文自动感知当前所在页面

### Requirement: Conversational Feature Access
系统 SHALL 支持通过 Agent 对话自然语言完成所有核心功能的访问和操作。

#### Scenario: 用户通过对话查看今日日程
- **WHEN** 用户在对话中输入"今天有什么安排"
- **THEN** Agent 解析意图，以温馨语气返回今日日程列表（毛玻璃富文本卡片形式展示）

#### Scenario: 用户通过对话添加任务
- **WHEN** 用户在对话中输入"明天下午3点加一个团队会议"
- **THEN** Agent 解析时间、事件、类型，生成毛玻璃确认卡片，用户确认后写入日程数据库

#### Scenario: 用户通过对话管理设置
- **WHEN** 用户在对话中输入"切换到深色模式"
- **THEN** Agent 以温馨语气理解意图，执行主题切换操作，回复确认消息

### Requirement: Agent Proactive Suggestions
系统 SHALL 支持 Agent 基于时间和用户数据主动推送建议。

#### Scenario: 早晨首次打开
- **WHEN** 用户在早晨 6:00-10:00 首次打开应用
- **THEN** Agent 以温馨语气主动展示"早上好呀～☀️ 今天有 X 项待办"，并提供毛玻璃快捷操作入口

#### Scenario: 日程冲突提醒
- **WHEN** Agent 检测到用户新添加的任务与已有日程时间冲突
- **THEN** Agent 以关切口吻主动提示冲突，建议调整方案

### Requirement: Secondary View Navigation
系统 SHALL 提供从 Agent 对话到功能二级视图的入口。

#### Scenario: 用户想查看完整日历视图
- **WHEN** 用户在对话中说"打开日历视图"或点击日程卡片上的"查看完整日程"
- **THEN** 导航至日程全览页面（二级视图），顶部保留毛玻璃返回导航栏

### Requirement: Unified Design Language
系统 SHALL 在 Android 端和 Uni-app 端保持一致的 Agent 对话交互范式和毛玻璃视觉风格。

#### Scenario: 跨平台一致性
- **WHEN** 用户在 Android 和 Uni-app 端分别使用 Mosa 对话
- **THEN** 聊天气泡样式、毛玻璃效果、欢迎动画、快捷操作入口、悬浮 FAB 等核心交互元素保持一致

### Requirement: Warm Agent Tone
系统 SHALL 让 Agent（Mosa）以温馨、友善、陪伴式的语气与用户交流。

#### Scenario: Agent 回复风格
- **WHEN** Agent 回复任何用户消息
- **THEN** 语气温暖亲切，像朋友一样，适当使用 emoji 点缀
- **THEN** 不使用生硬、命令式或过于机械的表达方式

#### Scenario: 错误或异常场景
- **WHEN** 用户请求无法完成或发生错误
- **THEN** Agent 以温和的方式说明情况，并提供替代建议，不冷冰冰地报错

### Requirement: Thinking Chain Visibility
系统 SHALL 提供 Agent 思路链（thinking chain）的可展开/可折叠展示。

#### Scenario: 思路链默认折叠
- **WHEN** Agent 生成回复时
- **THEN** Agent 回复消息上方显示可折叠的"💭 思路过程"区域，默认折叠

#### Scenario: 用户展开思路链
- **WHEN** 用户点击"💭 思路过程"
- **THEN** 展开显示 Agent 的推理步骤（如检索了什么数据、得到什么结论、为什么这样建议）

#### Scenario: 无内容时隐藏
- **WHEN** Agent 的某次回复没有思路链内容（如简单寒暄）
- **THEN** 不显示"💭 思路过程"入口，保持界面简洁

### Requirement: Glassmorphism UI
系统 SHALL 在关键界面模块应用毛玻璃（glassmorphism）设计风格。

#### Scenario: 卡片和面板
- **WHEN** 界面展示消息卡片、日程卡片、确认面板等模块
- **THEN** 模块采用半透明背景 + backdrop-filter 模糊 + 细腻边框的毛玻璃效果

#### Scenario: 导航栏和弹窗
- **WHEN** 界面展示顶部导航栏、Bottom Sheet、FAB 按钮等悬浮元素
- **THEN** 元素采用毛玻璃效果，与背景内容形成通透的层次感

#### Scenario: 深色/浅色模式适配
- **WHEN** 用户切换深色或浅色模式
- **THEN** 毛玻璃效果自适应调整透明度和模糊强度，保持视觉和谐

### Requirement: Agent Proactive Data Retrieval
系统 SHALL 在应用启动时让 Agent 自动检索用户相关数据，并主动向用户推送个性化提示。

#### Scenario: 启动时检索用户数据
- **WHEN** 用户打开应用进入 Mosa 对话主页
- **THEN** Agent 后台自动检索用户今日日程、近期任务、个人偏好设置等数据
- **THEN** Agent 基于检索结果以温馨语气生成第一条主动消息

#### Scenario: 检索过程可视化
- **WHEN** Agent 正在后台检索数据
- **THEN** 界面显示"Mosa 正在了解你的日程..."的加载状态，检索完成后自动展示结果

### Requirement: AI Model Configuration
系统 SHALL 使用 `deepseek-v4-flash` 作为 Agent 的默认对话模型。

#### Scenario: 模型调用
- **WHEN** Agent 发送对话请求至 AI API
- **THEN** 使用 `deepseek-v4-flash` 模型进行推理和响应生成

### Requirement: Optimized System Prompt
系统 SHALL 使用优化后的 System Prompt，注入温馨人格、思路链规范和毛玻璃设计意识。

#### Scenario: System Prompt 内容
- **WHEN** Agent 初始化对话
- **THEN** System Prompt 包含：温馨人格设定（朋友式陪伴）、回复规范（使用 emoji、亲切语气）、思路链输出要求（可选的 thinking 标记）、当前产品能力边界

## MODIFIED Requirements

### Requirement: Navigation Architecture
系统 SHALL 采用以 Agent 对话为主界面的导航架构，替代原有的底部标签栏多 Tab 平级导航。导航栏采用毛玻璃风格。

- **WHEN** 用户启动应用
- **THEN** Mosa 对话页作为默认主页
- **WHEN** 用户需要访问日程全览、课表或个人设置
- **THEN** 通过对话中的快捷入口或 Agent 引导进入对应的二级全屏视图
- **WHEN** 用户在二级视图中
- **THEN** 页面顶部显示毛玻璃返回导航栏，右下角显示毛玻璃 Agent 悬浮按钮

## REMOVED Requirements

### Requirement: Bottom Tab Bar Navigation
**Reason**: 底部标签栏将各功能置于平级地位，无法体现 Agent 的核心定位。
**Migration**: 日程/课表/个人中心改为从 Agent 对话触达的二级视图；原有的 Tab 切换逻辑完全移除。