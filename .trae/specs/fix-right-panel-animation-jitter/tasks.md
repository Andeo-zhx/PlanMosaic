# Tasks

## JS 逻辑修复（index.html）

- [x] Task 1: 修复 `toggleRightPanel()` 函数的互斥逻辑
  - [x] SubTask 1.1: 添加 `isPanelAnimating` 状态锁变量，防止动画过程中重复触发
  - [x] SubTask 1.2: 修改逻辑：如果点击的是当前已展开面板的按钮，仅折叠该面板，不操作其他面板
  - [x] SubTask 1.3: 修改逻辑：如果点击的是不同面板的按钮，先折叠当前面板，再展开目标面板（避免"全部关闭再打开"的冲突）
  - [x] SubTask 1.4: 统一 `sidebar-collapsible` 的处理方式，使用与其他面板一致的 `expanded` 类切换逻辑

- [x] Task 2: 优化面板状态检测逻辑
  - [x] SubTask 2.1: 统一 `isCurrentlyActive` 判断条件，消除 `expanded`/`collapsed` 混用导致的判断错误
  - [x] SubTask 2.2: 确保 `activePanel` 变量与真实 DOM 状态始终保持同步

## CSS 样式优化（index.html）

- [x] Task 3: 回退 `.right-panel` 到 width-based 动画方案
  - [x] SubTask 3.1: 将 `.right-panel` 从 `transform: translateX(100%)` 回退为 `width: 0` / `width: 340px` (transform 不移除布局空间，导致所有面板同时占据 1360px)
  - [x] SubTask 3.2: 保持 `transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.35s ease`
  - [x] SubTask 3.3: 添加 `will-change: width` 提示浏览器优化（可选）

- [x] Task 4: 统一 `.sidebar-collapsible` 的动画行为
  - [x] SubTask 4.1: 统一使用 `expanded` 类控制展开状态（默认 40px → expanded 480px）
  - [x] SubTask 4.2: `.sidebar-collapsible:not(.expanded)` 隐藏内部内容
  - [x] SubTask 4.3: `.sidebar-collapsible.expanded` 旋转箭头图标

## 紧急修复

- [x] Task 5: 修复 transform 方案导致的布局灾难
  - [x] SubTask 5.1: 回退 transform 改为 width 方案（根本原因是 JS 逻辑而非 CSS）
  - [x] SubTask 5.2: 移除 HTML 中 sidebarCollapsible 上多余的 collapsed 初始类

# Task Dependencies

- **Task 1-2** 必须先完成（JS 逻辑是根本原因）
- **Task 3-5** 是紧急修复，修复 Task 3 之前的 transform 方案引入的布局破坏