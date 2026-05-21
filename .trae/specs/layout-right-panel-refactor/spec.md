# 布局重构：右侧面板系统 + Mosa Logo 对话背景

## Why

当前布局将任务栏放在主区域顶部（全宽折叠条），深度规划和词汇学习放在 header 右侧按钮中，日程面板在右侧可折叠侧边栏。这种布局存在三个问题：
1. 任务栏占据顶部宝贵空间，与主对话区域冲突
2. 多个功能入口分散在不同位置（header、顶部、右侧），缺乏统一性
3. 右侧区域只有一个"日程"入口，其他功能无法以同样方式快速访问

## What Changes

### 1. 右侧垂直按钮栏 + 面板系统
- **移除** 全宽顶部任务栏（`big-tasks-bar`），迁移到右侧面板
- **新建** 右侧垂直按钮栏（`right-panel-bar`），包含 4 个按钮：
  - 📋 **任务栏** — 点击后向左展开显示大任务列表
  - 📅 **日程** — 点击后向左展开显示日历+日程（替换现有 sidebar-collapsible）
  - 🧠 **规划** — 点击后向左展开显示深度规划界面
  - ➕ **附功能** — 点击后展开显示子按钮组（目前：词汇学习）
- 按钮栏固定在右侧，竖向排列
- 每个面板宽度约 340px，点击后向左滑入，Mosa 对话区域同步缩小
- **同一时间只能展开一个面板**，点击其他按钮时当前面板折叠

### 2. 附功能子菜单
- "附功能"按钮点击后展开一个紧凑的子面板（非完整宽度）
- 子面板内包含功能按钮网格，目前仅放置"词汇学习"一个按钮
- 设计为可扩展结构，后续可轻松添加更多辅助功能

### 3. Mosa 对话背景 Logo
- Mosa 聊天区域（`agentMainArea`）背景添加 Mosa Logo 水印
- Logo 使用 CSS `background-image` + `opacity` + `filter: blur()` + 径向渐变羽化
- 居中显示，极度淡化（opacity < 0.08），不干扰文本阅读
- 深色模式下自动切换为深色版 Logo（`image2.png`）

### 4. 深度规划集成
- Header 中的"深度规划"按钮移除，功能入口迁移到右侧面板
- 深度规划模态框（`deepPlanningModal`）的打开函数保持不变，仅改变触发入口

## Impact

- **Affected specs**: `desktop-agent-centric-redesign`（该 spec 定义了当前 agentMainArea 布局，本次在其基础上扩展右侧面板）
- **Affected code**:
  - `index.html` — 新增右侧面板 HTML 结构、修改 main-layout 布局、调整 chat 区域尺寸、新增 CSS
  - `ai-agent.js` — 补充面板切换回调（如需要）

## ADDED Requirements

### Requirement: Right Panel Button Bar
系统 SHALL 在屏幕右侧提供固定的垂直按钮栏，包含"任务栏"、"日程"、"规划"、"附功能"四个按钮，每个按钮带有图标和竖排文字标签。

#### Scenario: 点击按钮展开面板
- **WHEN** 用户点击右侧栏中任一按钮
- **THEN** 对应面板从右侧向左滑入，Mosa 对话区域宽度同步缩小

#### Scenario: 切换面板
- **WHEN** 已有一个面板展开时用户点击另一个按钮
- **THEN** 当前面板折叠，目标面板展开（同一时间仅一个面板打开）

#### Scenario: 再次点击同一按钮
- **WHEN** 用户点击已展开面板对应按钮
- **THEN** 面板折叠，对话区域恢复全宽

### Requirement: Task Panel（任务栏面板）
系统 SHALL 在右侧面板系统中提供任务栏面板，显示大任务卡片列表和添加按钮。

#### Scenario: 查看大任务
- **WHEN** 用户点击"任务栏"按钮
- **THEN** 面板展开并显示所有大任务卡片（失败时显示错误信息）

### Requirement: Auxiliary Functions Button（附功能按钮）
系统 SHALL 提供"附功能"按钮，点击后展开紧凑子面板，内设词汇学习等功能按钮。

#### Scenario: 打开词汇学习
- **WHEN** 用户点击"附功能"按钮展开子面板，再点击"词汇学习"
- **THEN** 触发 `openWordMosaic()` 打开 WordMosaic 子应用

### Requirement: Mosa Chat Background Logo
系统 SHALL 在 Mosa 对话区域背景中显示淡化、模糊、径向羽化后的 Mosa Logo 水印。

#### Scenario: 浅色模式
- **WHEN** 应用处于浅色模式
- **THEN** 对话背景显示浅色版 Logo（`image1.png`），极度淡化（opacity ≤ 0.06），模糊半径 ≥ 40px

#### Scenario: 深色模式
- **WHEN** 应用处于深色模式
- **THEN** 对话背景切换为深色版 Logo（`image2.png`），适当调高不透明度（opacity ≤ 0.08）

## REMOVED Requirements

### Requirement: Top Big Tasks Bar
**Reason**: 顶部全宽任务栏占用重要空间，迁移到右侧面板以统一入口
**Migration**: 任务栏 HTML 内容迁移到右侧 `task-panel` 中，CSS 样式重写为面板内适配

### Requirement: Header Deep Planning Button
**Reason**: 深度规划入口从 header 迁移到右侧按钮栏，统一功能入口
**Migration**: 移除 header 中的 `deep-planning-btn`，`openDeepPlanningModal()` 函数调用保持不变