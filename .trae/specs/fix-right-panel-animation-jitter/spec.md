# 修复右侧面板动画抽搐 Spec

## Why

当前 Electron 桌面端 (`index.html`) 的右侧面板系统（任务栏/日程/规划/附功能）在展开/折叠时出现明显的动画抽搐（jitter）现象。具体表现为：
1. 点击按钮展开面板时，面板宽度变化不流畅，出现抖动
2. 面板内容在动画过程中发生闪烁或重排
3. 多个面板快速切换时动画状态冲突，导致视觉卡顿

根本原因是 `toggleRightPanel()` 函数在切换面板时，先**无条件移除所有面板的 `expanded` 类**，再重新添加目标面板的 `expanded` 类。这种"先全部关闭再打开"的逻辑导致：
- 当前已展开的面板被强制折叠，触发一次 width→0 的过渡动画
- 目标面板立即展开，触发 width→340px 的过渡动画
- 两次动画几乎同时发生，CSS transition 在同一元素上产生冲突
- `sidebar-collapsible` 使用 `collapsed` 类而非 `expanded` 类，逻辑分支不一致，进一步加剧状态混乱

## What Changes

- **修复** `toggleRightPanel()` 函数的互斥逻辑：先判断当前激活面板，仅当切换不同面板时才折叠已展开面板
- **统一** 所有面板（包括 `sidebar-collapsible`）的状态类使用方式，消除 `expanded`/`collapsed` 混用
- **优化** CSS transition 属性，避免 `width` + `min-width` 同时过渡导致的布局抖动
- **添加** 动画状态锁（transition lock），防止快速连续点击导致动画队列堆积

## Impact

- Affected specs: `layout-right-panel-refactor`（右侧面板系统的基础实现）
- Affected code:
  - `index.html` — `toggleRightPanel()` 函数逻辑修复
  - `index.html` — `.right-panel` 和 `.sidebar-collapsible` CSS transition 优化

## ADDED Requirements

### Requirement: Smooth Panel Toggle Animation
系统 SHALL 提供流畅、无抽搐的右侧面板展开/折叠动画。

#### Scenario: 展开已折叠的面板
- **WHEN** 用户点击某个面板按钮，且当前没有任何面板展开
- **THEN** 目标面板平滑展开，width 从 0 过渡到 340px，耗时 350ms

#### Scenario: 切换到另一个面板
- **WHEN** 用户点击按钮 B，且面板 A 当前已展开
- **THEN** 面板 A 先平滑折叠（350ms），面板 B 在面板 A 折叠完成后展开（350ms）
- **OR** 面板 A 和面板 B 的切换通过 CSS 类直接替换实现，不触发中间状态的重排

#### Scenario: 快速连续点击同一按钮
- **WHEN** 用户在动画过程中多次点击同一按钮
- **THEN** 只有第一次点击生效，后续点击被忽略（动画状态锁保护）

#### Scenario: 折叠当前面板
- **WHEN** 用户点击已展开面板对应的按钮
- **THEN** 面板平滑折叠，不触发其他面板的任何状态变化

## MODIFIED Requirements

### Requirement: Right Panel State Management
系统 SHALL 统一管理右侧面板的展开/折叠状态，消除状态类混用。

#### Scenario: 日程面板状态统一
- **WHEN** `sidebar-collapsible`（日程面板）需要展开或折叠
- **THEN** 使用与其他面板一致的 `expanded`/`collapsed` 类名机制
- **AND** 不再单独处理 `collapsed` 类的特殊逻辑分支

## REMOVED Requirements

无
