# Tasks

## HTML 结构变更（index.html）

- [x] Task 1: 移除顶部全宽任务栏结构
  - [x] SubTask 1.1: 将 `big-tasks-bar` HTML 块（含 header/content/modal）整体移除或注释
  - [x] SubTask 1.2: 将大任务卡片生成 JS 逻辑的 DOM 挂载目标从 `bigTasksContent` 改为右侧面板中的新容器

- [x] Task 2: 移除 header 中的深度规划按钮
  - [x] SubTask 2.1: 移除 `.deep-planning-btn` HTML 元素
  - [x] SubTask 2.2: 保留词汇学习按钮在 header 中（后续移到附功能）

- [x] Task 3: 新建右侧垂直按钮栏 HTML
  - [x] SubTask 3.1: 在 `main-layout` 内创建 `right-panel-bar` 容器（固定在右侧的竖向按钮列）
  - [x] SubTask 3.2: 添加 4 个按钮：任务栏（📋图标）、日程（📅图标）、规划（🧠图标）、附功能（➕图标）
  - [x] SubTask 3.3: 每个按钮使用 `<button>` + SVG 图标 + 竖排 `<span>` 文字标签
  - [x] SubTask 3.4: 按钮添加 `data-panel` 属性标记对应面板 ID（`task`/`schedule`/`plan`/aux）

- [x] Task 4: 新建右侧可展开面板 HTML
  - [x] SubTask 4.1: 创建"任务栏面板"（`#taskPanel`）：迁移 `big-tasks-content` 的 HTML（大任务卡片容器）+ 添加按钮
  - [x] SubTask 4.2: 改造现有 `sidebarCollapsible` 为"日程面板"（结构基本不变，兼容新的面板系统）
  - [x] SubTask 4.3: 创建"规划面板"（`#planPanel`）：放置深度规划入口按钮（点击触发 `openDeepPlanningModal()`）
  - [x] SubTask 4.4: 创建"附功能面板"（`#auxPanel`）：紧凑子面板，内含词汇学习功能按钮

- [x] Task 5: 调整 main-layout 结构
  - [x] SubTask 5.1: 确保 `agent-main-area` 在左侧，右侧面板系统在右侧
  - [x] SubTask 5.2: `right-panel-bar` + 各面板容器有序排列

## CSS 样式变更（index.html）

- [x] Task 6: 右侧按钮栏样式
  - [x] SubTask 6.1: `.right-panel-bar`：fixed 定位右侧，flex 竖向排列，glass 背景
  - [x] SubTask 6.2: `.right-panel-btn`：40px 宽，含图标+竖排文字，hover/active 状态
  - [x] SubTask 6.3: 按钮 active 状态高亮（左侧边框或背景色变化）

- [x] Task 7: 面板展开/折叠动画样式
  - [x] SubTask 7.1: `.right-panel` 基类：width 340px，transition transform/width 0.35s cubic-bezier
  - [x] SubTask 7.2: 折叠状态：`transform: translateX(100%)` 或 `width: 0; overflow: hidden`
  - [x] SubTask 7.3: 展开状态：`transform: translateX(0)` 或 `width: 340px`
  - [x] SubTask 7.4: agentMainArea 宽度过渡：`transition: margin-right 0.35s`，面板展开时 margin-right 增大

- [x] Task 8: Mosa Logo 对话背景
  - [x] SubTask 8.1: `.agent-main-area` 使用伪元素 `::before` 创建固定定位的 Logo 水印层
  - [x] SubTask 8.2: CSS：`background-image: url('Image/image1.png')` + `background-size: 60%` + `background-position: center` + `background-repeat: no-repeat`
  - [x] SubTask 8.3: 使用 `filter: blur(40px)` + `opacity: 0.06` 实现淡化羽化
  - [x] SubTask 8.4: 使用 `mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%)` 实现径向羽化
  - [x] SubTask 8.5: 深色模式 `[data-theme="dark"]` 下切换为 `Image/image2.png`，opacity 调至 0.08

- [x] Task 9: 附功能子面板样式
  - [x] SubTask 9.1: 紧凑设计，约 200px 宽，内设功能按钮网格
  - [x] SubTask 9.2: 词汇学习按钮使用清晰图标+文字，hover 效果

## JS 逻辑变更（index.html + ai-agent.js）

- [x] Task 10: 面板切换 JS 逻辑
  - [x] SubTask 10.1: 添加 `toggleRightPanel(panelId)` 函数：切换面板展开/折叠
  - [x] SubTask 10.2: 实现互斥逻辑：展开新面板时自动折叠当前面板
  - [x] SubTask 10.3: 同一按钮再次点击折叠面板
  - [x] SubTask 10.4: 面板展开时同步调整 agentMainArea 的 margin-right

- [x] Task 11: 大任务渲染适配
  - [x] SubTask 11.1: 查找所有操作 `bigTasksContent` DOM 的代码，更新为新容器
  - [x] SubTask 11.2: `toggleBigTasks()` 函数改为触发右侧面板的展开
  - [x] SubTask 11.3: 确保大任务 CRUD 操作后刷新面板内容

- [x] Task 12: 词汇学习迁移到附功能
  - [x] SubTask 12.1: 移除 header 中的词汇学习按钮 HTML
  - [x] SubTask 12.2: 在附功能子面板中放置词汇学习按钮，点击调用 `openWordMosaic()`

- [x] Task 13: 深度规划面板
  - [x] SubTask 13.1: 规划面板内放置简洁的入口卡片和"打开深度规划"按钮
  - [x] SubTask 13.2: 点击调用 `openDeepPlanningModal()`

# Task Dependencies

- **Task 1-2** 必须先完成（移除旧结构），否则与 Task 3-4 冲突
- **Task 3-5** 可并行（HTML 结构新建和调整）
- **Task 6-9** 依赖 Task 3-5（CSS 样式基于 HTML 结构）
- **Task 10-13** 依赖 Task 3-5（JS 逻辑基于 HTML 结构）
- **Task 6-9 与 Task 10-13 可并行**（CSS 和 JS 互不依赖）
- **所有 Task 完成后验证 Task 13**（端到端测试）