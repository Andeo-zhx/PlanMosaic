# Phase 6: 主题/暗色模式静态分析

> **目标**：对照 `visual-test-script.md` §2.5，分析主题切换机制、CSS 变量覆盖、水浪过渡动画。

---

## 1. 主题切换机制

### 1.1 主题存储方式

| 项目 | 实现 | 位置 |
|------|------|------|
| HTML 属性 | `documentElement.setAttribute('data-theme', theme)` | `index.html:10006` |
| localStorage key | `mosaique-theme` | `index.html:10009`, `index.html:9984`, `index.html:7899`, `index.html:44` |
| 初始值 | `localStorage.getItem('mosaique-theme') || 'light'` | `index.html:9984` |
| 备选（窗口背景色） | 读 `data.settings.theme` | `main.js:1212-1216` |

**结论**：✅ **PASS** — 主题切换走 `documentElement.setAttribute('data-theme', ...)`，**不是 `body.classList`**，符合现代 CSS 变量主题规范

### 1.2 `changeTheme()` 完整实现

**位置**：`index.html:9996-10021`

```javascript
function changeTheme(theme) {
    // 触发水浪过渡效果
    const transition = document.getElementById('themeTransition');
    transition.classList.remove('no-transition');

    // 移除再添加类来触发动画
    transition.style.display = 'block';
    transition.offsetHeight; // 触发回流

    // 设置新主题
    document.documentElement.setAttribute('data-theme', theme);

    // 保存到 localStorage
    localStorage.setItem('mosaique-theme', theme);

    // 更新 Mosa 头像
    updateMosaAvatar(theme);

    // 同步到统一数据层
    saveAllDataDebounced();

    // 动画结束后隐藏
    setTimeout(() => {
        transition.style.display = 'none';
    }, 800);
}
```

**关键发现**：
- ✅ `transition.offsetHeight` 强制 reflow 确保动画触发
- ✅ `setTimeout(800ms)` 动画结束后隐藏
- ✅ 调用 `updateMosaAvatar(theme)` 切换头像（深色/浅色 2 张）
- ✅ `saveAllDataDebounced` 持久化

**结论**：✅ **PASS** — 实现完整

### 1.3 `initTheme()` 启动加载

**位置**：`index.html:9983-9994`

```javascript
function initTheme() {
    const savedTheme = localStorage.getItem('mosaique-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const radios = document.querySelectorAll('input[name="theme"]');
    radios.forEach(radio => {
        radio.checked = radio.value === savedTheme;
    });

    // 更新 Mosa 头像
    updateMosaAvatar(savedTheme);
}
```

**结论**：✅ **PASS** — 启动即恢复，radio 状态同步

---

## 2. 水浪过渡动画

### 2.1 CSS 实现

**位置**：`index.html:547-585`

```css
.theme-transition {
    position: fixed;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 99999;
}

.theme-transition::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: var(--bg-primary);
    transform: translate(-50%, -50%);
    animation: themeWave 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

@keyframes themeWave {
    0% { width: 0; height: 0; opacity: 0; }
    50% { opacity: 1; }
    100% { width: 300vmax; height: 300vmax; opacity: 0; }
}
```

**HTML 容器**：`index.html:6899`
```html
<div class="theme-transition" id="themeTransition"></div>
```

**结论**：✅ **PASS** — 0.8s 圆形扩散水浪动画实现完整

### 2.2 全局过渡 CSS

**位置**：`index.html:587-599`

```css
body, .container, header, .sidebar, .right-panel, .calendar-grid,
.calendar-day, .time-slot, .schedule-item, .task-item, .big-task-item,
.modal, .modal-content, .settings-panel, .agent-panel, .chat-container,
.auth-backdrop, .auth-container, .btn, .icon-btn, input, textarea, select,
.toast, .nav-item, .tab-item, .panel-section, .card, .status-bar,
.main-content, .content-area, .schedule-editor, .agent-mini,
.big-tasks-panel, .python-status-banner, .header-left, .header-right,
.schedule-date-header, .timeline-sidebar, .week-view, .day-column {
    transition-property: background-color, color, border-color, box-shadow;
    transition-duration: 0.5s;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}
```

**结论**：✅ **PASS** — 30+ 元素 0.5s 平滑过渡，注释"仅主要UI元素避免性能开销"显示有优化意识

### 2.3 排除规则

**位置**：`index.html:601-607`

```css
.no-transition,
.no-transition *,
.theme-transition::before,
.loading-line {
    transition: none !important;
}
```

**结论**：✅ **PASS** — 动画元素自身不重复过渡，避免叠加闪烁

---

## 3. CSS 变量 Token 架构

### 3.1 三层 Token 体系

| 层级 | 命名 | 位置 | 数量（约）|
|------|------|------|---------|
| Primitive | `--primitive-*` | `index.html` 内多处 | 20+ |
| Semantic | `--bg-primary`, `--text-primary` 等 | line 220-330, 410-510 | 50+ |
| Component | `--nav-btn-color`, `--task-add-color` 等 | line 320-355, 485-510 | 10+ |

### 3.2 浅色主题定义（默认）

**位置**：`index.html:220-401`

**Primitive Tokens**（推断）示例：
- `--primitive-paper: #F9F8F6` (米色)
- `--primitive-white: #FFFFFF`
- `--primitive-accent: #6C63FF` (紫色)

**Semantic Tokens** 示例：
- `--bg-primary: var(--bg-paper)` (line 391)
- `--bg-secondary: var(--bg-surface)` (line 392)
- `--text-primary: var(--primitive-primary)` (line 232)
- `--accent-primary: var(--primitive-accent)` (line 237)

**结论**：✅ **PASS** — 完整三层 Token 体系

### 3.3 深色主题覆盖

**位置**：`index.html:403-510`

```css
[data-theme="dark"] {
    --primitive-paper: #1A1816;     /* 深棕 */
    --primitive-white: #252320;     /* 次深 */
    --primitive-surface-hover: #2E2C28;
    --primitive-active: #38352F;
    --primitive-hero: #F0EFEA;      /* 反转为亮色 */
    --primitive-primary: #F0EFEA;   /* 反转为亮色 */
    --primitive-secondary: #9C9A95;  /* 灰 */
    --primitive-disabled: #6B6965;
    --primitive-accent: #7D7590;    /* 紫调淡 */
    --primitive-accent-light: #9690A5;
    --primitive-border: #333029;
    --primitive-border-dark: #44403A;
    /* ... 复制所有 semantic 重映射 */
}
```

**结论**：✅ **PASS** — 完整覆盖

---

## 4. 组件级深色覆盖

### 4.1 已发现的 21 条 `[data-theme="dark"]` 规则

| 行号 | 目标 | 用途 |
|------|------|------|
| 404 | `[data-theme="dark"]` 整块 | 主题变量覆盖 |
| 1112 | `.cursor-glow` | 光标特效 |
| 1290 | `.app-btn` | 应用按钮 |
| 1295 | `.app-btn:hover` | 应用按钮 hover |
| 1406 | `.btn` | 主按钮 |
| 1410 | `.btn:hover` | 主按钮 hover |
| 1414 | `.btn:active` | 主按钮 active |
| 1443 | `.btn-outline` | 描边按钮 |
| 1446 | `.btn-outline:hover` | 描边按钮 hover |
| 1623 | `.day-timebar-bg` | 日时间条背景 |
| 1627 | `.day-timebar-fill` | 日时间条填充 |
| 2610 | `.schedule-action-btn.primary` | 日程操作按钮 |
| 2614 | `.schedule-action-btn.primary:hover` | hover 态 |
| 3629 | `.thinking-process:hover` | 思路链 hover |
| 3675 | `.thinking-process:hover .thinking-icon` | 图标 hover |
| 3747 | `.thinking-process` | 思路链 |
| 3752 | `.thinking-process:hover` | hover |
| 3756 | `.thinking-content` | 思路内容 |
| 3760 | `.thinking-content` (重复) | 思路内容 |
| 5246 | `.agent-main-area::before` | 主面板背景 |
| 5608 | `.right-panel-bar` | 右侧栏 |
| 5613 | `.right-panel-btn.active` | 按钮 active |
| 5617 | `.right-panel-btn.active::before` | active 装饰 |

**结论**：✅ **PASS** — 关键交互元素都有深色覆盖

### 4.2 未发现深色规则的潜在遗漏

**风险**：`[data-theme="light"]` 仅 1 条（line 2700，date picker 图标）
**说明**：项目默认是浅色，深色走 `[data-theme="dark"]` 覆盖。**没有深色规则的元素会自动继承浅色样式**（包括通过 CSS 变量）。这意味着：
- ✅ 大多数元素用 `var(--bg-primary)` 等变量，已自动适配
- ❌ **直接写死颜色**（如 `background: #FFF`）的元素不会适配

**检查风险元素**：
- `index.html:2700` `[data-theme="light"] .big-task-form-input[type="date"]::-webkit-calendar-picker-indicator` — 是 date picker 的图标，**仅浅色需要适配**

**结论**：✅ **PASS** — 整体架构良好

### 4.3 媒体查询（响应式）

**3 条 `@media (max-width: 768px)`**（行 4656, 5184, 6665）— 移动端适配

**结论**：⚠️ **未发现平板/桌面中间断点**（如 1024px），仅 768px 断点。Windows 缩放窗口 1000px 以下时可能布局异常

---

## 5. 主题切换异常路径

### 5.1 启动时主题应用

**位置**：`main.js:1207-1218`
```javascript
let bgColor = '#F9F8F6'; // 默认浅色
try {
    const dataPath = pmPaths.getDataFilePath();
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (data.settings && data.settings.theme === 'dark') {
            bgColor = '#1A1816';
        }
    }
} catch(e) {}
```

**关键**：用 `data.settings.theme` 而非 `localStorage`，**因为 localStorage 在新窗口中可能为 null**。但 initTheme() 走 `mosaique-theme` localStorage key — **与主进程不一致**！

**结论**：⚠️ **潜在不一致** — 主进程读 `data.settings.theme` 决定窗口背景色，renderer 读 `mosaique-theme` 决定 DOM 主题。两者可能不同步（例如用户只改 localStorage 而未触发 saveAllDataDebounced）

### 5.2 主题持久化路径

**路径 1**：`changeTheme()` → `saveAllDataDebounced()` → `DataManager.saveLocal` → 写 `mosaique-user-data` localStorage key
**路径 2**：`changeTheme()` → `localStorage.setItem('mosaique-theme', theme)` 立即写

**问题**：两个 key (`mosaique-theme` 和 `mosaique-user-data`) 保存同一信息，**双写**

**结论**：⚠️ **双写风险** — 重启后两个值都读，理论上一致，但浪费 + 增加不一致风险

### 5.3 暗色态可见性检查

**主进程窗口背景色**：
- 浅色：`#F9F8F6`
- 深色：`#1A1816`

**与 CSS 主题切换配合**：
- 启动时（DOM 加载前）显示 backgroundColor
- DOM 加载后由 initTheme() 接管

**结论**：✅ **PASS** — 避免"白闪"已考虑

---

## 6. 主题修复优先级

| 优先级 | 问题 | 严重度 | 建议 |
|-------|------|--------|------|
| P2 | `[data-theme="dark"] .reactLogModal` 等可能未覆盖 | 2 | 加 audit 工具检查所有直接颜色 |
| P2 | 启动时主进程 `data.settings.theme` 与 renderer `mosaique-theme` 不同源 | 2 | 统一为 `mosaique-user-data` |
| P3 | 缺少 1024px 平板断点 | 3 | 加 `@media (max-width: 1024px)` |
| P3 | `prefers-reduced-motion` 未尊重 | 3 | 加 `@media (prefers-reduced-motion: reduce)` 禁动画 |

---

## 7. 截图证据

| 场景 | 预期 | 状态 |
|------|------|------|
| 浅色基线 | phase4-theme-1-light-baseline.png | 待 GUI |
| 切到深色 | phase4-theme-2-dark-after.png | 待 GUI |
| 深色下弹窗 | phase4-theme-4-modal-on-dark.png | 待 GUI |
| 水浪动画中 | phase4-theme-5-water-wave.png | **需录屏**，待 GUI |

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态
**总体结论**：**PASS** — 主题系统实现完善（变量驱动 + 三层 Token + 水浪动画 + 启动无闪烁），仅细节可优化
