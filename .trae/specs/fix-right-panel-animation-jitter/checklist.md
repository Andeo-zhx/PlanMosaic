# Checklist

## JS 逻辑修复
- [x] `isPanelAnimating` 状态锁已添加，动画期间重复点击被忽略
- [x] 点击当前已展开面板的按钮时，仅折叠该面板，不操作其他面板
- [x] 切换到不同面板时，先折叠当前面板再展开目标面板，避免"全部关闭再打开"冲突
- [x] `sidebar-collapsible` 的处理逻辑与其他面板统一，使用一致的 `expanded` 类名切换机制
- [x] `isCurrentlyActive` 判断条件统一，消除 `expanded`/`collapsed` 混用
- [x] `activePanel` 变量与 DOM 状态始终保持同步

## CSS 样式修复
- [x] `.right-panel` 已从 `transform: translateX(100%)` 回退为 `width: 0` → `width: 340px` 方案
- [x] `transform` 方案已被废弃（不移除布局空间，导致 4 个面板强占 1360px）
- [x] `.right-panel` 的 `min-width` 随 width 同步变化（0 ↔ 340px）
- [x] `.sidebar-collapsible` 统一使用 `expanded` 类（默认 40px → expanded 480px）
- [x] `.sidebar-collapsible:not(.expanded)` 隐藏内部内容
- [x] `.sidebar-collapsible.expanded` 箭头旋转 180deg
- [x] HTML 中 `sidebarCollapsible` 移除多余的 `collapsed` 初始类
- [x] 无残留的 `.collapsed` 引用（除无关的 big-tasks-bar）

## 手动验证
- [ ] 点击"任务栏"按钮展开 → 动画流畅无抽搐
- [ ] 任务栏展开状态下点击"日程"按钮 → 切换动画流畅
- [ ] 日程展开状态下点击"规划"按钮 → 切换动画流畅
- [ ] 快速连续点击同一按钮 → 仅触发一次动画
- [ ] 点击已展开面板的按钮 → 仅折叠当前面板，其他面板不受影响
- [ ] 所有面板在浅色/深色模式下动画表现一致
- [ ] `npm start` 启动无控制台错误