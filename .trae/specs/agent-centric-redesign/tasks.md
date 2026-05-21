# Tasks

## Phase 1: Android 端导航架构重构

- [x] Task 1: 重构 MainActivity 导航架构 - 移除底部标签栏，Mosa 对话页改为启动主页
  - [x] 移除 `BottomNavBar` 引用和 `Scaffold` 的 `bottomBar`
  - [x] 将 `NavHost` 的 `startDestination` 从 `"schedule"` 改为 `"mosa"`
  - [x] 移除 `BottomNavBar.kt` 文件（归档备用）
  - [x] 配置二级视图路由（schedule、profile）支持毛玻璃顶部返回导航栏
  - [x] 验证：启动应用直接进入 Mosa 对话页，无底部标签栏

- [x] Task 2: 升级 MosaScreen 为主界面 - 欢迎页 + 主动检索 + 温馨语气
  - [x] 新增欢迎区域组件：根据时段展示温馨欢迎语（如"早上好呀～☀️""下午好～今天辛苦了 🌤️"）
  - [x] **新增 Agent 主动数据检索**：`MosaViewModel` 新增 `performStartupScan()` 方法，启动时检索今日日程、昨日未完成任务、个人偏好
  - [x] 检索过程展示"Mosa 正在了解你的日程..."加载状态
  - [x] 基于检索结果以温馨语气生成 Agent 第一条主动消息
  - [x] 新增今日日程概览卡片，采用毛玻璃样式
  - [x] 新增毛玻璃快捷操作 Chip 入口
  - [x] 新增空状态引导：无日程时 Agent 用温馨语气主动建议规划
  - [x] 验证：启动后 Agent 自动检索并展示温馨个性化消息

- [x] Task 3: 实现全局毛玻璃悬浮 Agent FAB 按钮
  - [x] 创建 `AgentFAB.kt` 组件：圆形毛玻璃悬浮按钮，Mosa 头像 + 呼吸动画
  - [x] 在 ScheduleScreen 和 ProfileScreen 中集成 AgentFAB
  - [x] 点击 FAB 弹出毛玻璃 Agent 对话 Bottom Sheet
  - [x] Bottom Sheet 关闭时保留对话状态
  - [x] 验证：点击 FAB 弹出毛玻璃对话面板，可正常对话

## Phase 2: Agent 温馨人格 + 思路链

- [x] Task 4: 优化 System Prompt - 注入温馨人格和思路链规范
  - [x] 重写 `AgentRepository.kt` 中的 `buildSystemPrompt()` 方法
  - [x] 温馨人格设定：Mosa 是用户的贴心日程伙伴，像朋友一样交流，语气温暖亲切
  - [x] 回复规范：使用 emoji 点缀、不使用命令式语气、错误时温柔引导
  - [x] 思路链输出规范：复杂推理时在回复中以 `【思考】...【/思考】` 标记思路过程
  - [x] 能力边界说明：明确 Agent 能做什么（日程管理、深度规划、词汇学习等）
  - [x] 验证：对话回复语气温暖亲切，复杂推理时包含思路链标记

- [x] Task 5: 实现思路链（Thinking Chain）可展开/折叠 UI 组件
  - [x] 创建 `ThinkingChain.kt` 组件：默认折叠的"💭 思路过程"区域
  - [x] 解析 Agent 回复中的 `【思考】...【/思考】` 标记，提取思路链内容与正文分离
  - [x] 展开/折叠动画：平滑高度过渡，带箭头旋转指示
  - [x] 思路链内容以等宽字体、浅色背景展示，区分于正文
  - [x] 无思路链标记时自动隐藏入口
  - [x] 集成到 ChatBubble 组件中（Agent 消息气泡上方）
  - [x] 验证：复杂对话中显示并可以折叠/展开思路链；简单寒暄不显示

## Phase 3: 毛玻璃化 UI 改造

- [x] Task 6: Android 端毛玻璃设计 token 和基础组件
  - [x] `Color.kt` 新增毛玻璃语义色 token：`glassBg`, `glassBorder`, `glassBlur`
  - [x] `Theme.kt` 新增浅色/深色模式毛玻璃色值
  - [x] 创建 `GlassSurface.kt` 可复用毛玻璃容器组件
  - [x] 毛玻璃效果参数：半透明背景（rgba 0.6-0.8）+ blur + 细边框
  - [x] 深色/浅色模式自适应透明度
  - [x] 验证：毛玻璃组件在两种主题下视觉效果正确

- [x] Task 7: 毛玻璃化改造 - MosaScreen 对话界面
  - [x] 顶部导航栏改为毛玻璃效果（悬浮于对话列表上方）
  - [x] 聊天气泡应用毛玻璃效果：Agent 消息毛玻璃卡片、用户消息半透明强调色
  - [x] 日程卡片、确认卡片改为毛玻璃面板
  - [x] 快捷操作 Chip 改为毛玻璃胶囊按钮
  - [x] 输入区域改为毛玻璃底栏，悬浮于内容区上方
  - [x] 背景添加微妙渐变/纹理，增强毛玻璃通透感
  - [x] 验证：Mosa 对话页整体呈现轻盈通透的毛玻璃风格

- [x] Task 8: 毛玻璃化改造 - 二级页面和全局元素
  - [x] ScheduleScreen 顶部导航栏改为毛玻璃
  - [x] ProfileScreen 顶部导航栏和设置卡片改为毛玻璃
  - [x] Bottom Sheet（Agent 对话面板）整体毛玻璃化
  - [x] AgentFAB 按钮毛玻璃化
  - [x] 验证：所有二级页面导航栏和 FAB 呈现统一毛玻璃风格

## Phase 4: 对话式操作增强

- [x] Task 9: 增强 Agent 对话式操作 - 日程查看和添加任务
  - [x] MosaViewModel 新增意图识别方法
  - [x] 新增毛玻璃日程卡片消息组件 `ScheduleCardMessage`
  - [x] 新增毛玻璃任务确认卡片 `TaskConfirmCard`
  - [x] 用户确认后写入日程数据库
  - [x] Agent 以温馨语气确认操作结果
  - [x] 验证：输入"今天有什么安排"返回毛玻璃日程卡片

- [x] Task 10: 增强 Agent 对话式操作 - 设置管理 + 冲突检测
  - [x] MosaViewModel 新增设置类意图识别
  - [x] Agent 执行主题切换后以温馨语气回复确认
  - [x] 新增日程冲突检测：添加任务前检查时段冲突
  - [x] 冲突时 Agent 以关切口吻提示并建议备选时间
  - [x] 验证：切换主题和冲突检测正常

## Phase 5: 底层模型升级

- [x] Task 11: 切换 Agent 底层模型为 deepseek-v4-flash
  - [x] 修改 `AiApiClient.kt`：`DEEPSEEK_MODEL` 改为 `"deepseek-v4-flash"`
  - [x] 确认 reasoning 模型变体同步更新
  - [x] 回归测试：CHAT 和 DEEP_PLANNING 模式正常响应
  - [x] 验证：响应速度提升，回复质量无退化

## Phase 6: Uni-app 端 Agent 化改造

- [x] Task 12: Uni-app 端毛玻璃样式系统 + Mosa 对话界面
  - [x] `uni.scss` 新增毛玻璃 SCSS 变量和 mixin
  - [x] 实现毛玻璃聊天气泡组件
  - [x] 实现消息输入区域（毛玻璃底栏）
  - [x] 实现消息列表：自动滚动 + 历史加载
  - [x] 实现温馨欢迎页 + 主动检索 + 快捷操作入口
  - [x] 实现思路链（ThinkingChain）可折叠组件
  - [x] 实现打字指示器动画
  - [x] 验证：Uni-app Mosa 页可完整对话，带思路链和毛玻璃效果

- [x] Task 13: Uni-app 导航架构重构
  - [x] `pages.json`：Mosa 页为首页，二级页添加毛玻璃返回导航栏
  - [x] 移除 `custom-tabbar` 引用
  - [x] 二级页面添加毛玻璃 AgentFAB
  - [x] 验证：启动进 Mosa，无底部 Tab，二级页可返回

## Phase 7: 统一视觉风格

- [x] Task 14: 统一 Android 和 Uni-app Agent 对话视觉风格
  - [x] 统一毛玻璃聊天气泡样式
  - [x] 统一 Mosa 头像资源
  - [x] 统一思路链折叠组件样式
  - [x] 统一快捷操作 Chip 样式
  - [x] 统一 AgentFAB 样式
  - [x] 验证：两端核心交互元素视觉一致

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 可独立进行（System Prompt 纯文本修改）
- Task 5 依赖 Task 4（需先有思路链标记才能解析展示）
- Task 6 可独立进行（设计 token 定义）
- Task 7 依赖 Task 2 + Task 5 + Task 6（需主界面、思路链组件、毛玻璃 token 就绪）
- Task 8 依赖 Task 6（需毛玻璃 token 就绪）
- Task 9 依赖 Task 2
- Task 10 依赖 Task 9
- Task 11 可独立进行
- Task 12 和 Task 13 可与 Phase 1-5 并行（Uni-app 独立开发）
- Task 14 依赖 Task 7 + Task 12