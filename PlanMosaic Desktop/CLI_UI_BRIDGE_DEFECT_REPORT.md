# PlanMosaic CLI-UI 桥接缺陷报告

**报告日期**: 2026-05-30
**测试人**: 自动化测试
**严重程度**: 🔴 高 — 核心功能大面积失效
**结论**: CLI 操作端名义上"可用"，实际上对桌面应用界面的操作能力几乎为零。

---

## 一、问题总览

本次测试执行了 18 条 CLI 命令，对桌面应用进行了 20 次全屏截屏验证。

**核心事实**:

| 指标 | 数据 |
|------|------|
| 总命令数 | 18 |
| 桌面界面**发生可见变化**的命令 | **5** (window minimize/restore/resize, devtools 开关, reload) |
| 桌面界面**无任何变化**的命令 | **13** |
| 真正操作了应用业务界面的命令 | **0** |

**换句话说**: 用户要求"利用命令行来操作桌面端应用界面"，但测完后发现——**除了能把窗口缩小放大，其他什么都没操作成。**

---

## 二、致命缺陷逐项分析

### 缺陷 1: `ui theme dark/light` — 主题切换完全无效 🔴

**现象**:
- CLI 返回: "✓ 主题已切换为: 深色"
- 桌面界面: **毫无变化，仍然是浅色主题**

**根因分析**:

控制服务器 `/ui/theme` 端点注入的代码是:

```javascript
document.body.classList.add('dark');
document.body.classList.remove('light');
window.__setTheme__ && window.__setTheme__('dark');
```

**这段代码有三处错误**:

1. **操作了错误的 DOM 节点**: 应用主题切换是通过 `document.documentElement.setAttribute('data-theme', theme)` 实现的（见 index.html L44-45, L10256），而不是 `document.body.classList`。

2. **localStorage 未同步**: 应用读取 `localStorage.getItem('mosaique-theme')` 来决定主题（index.html L44）。CLI 注入的代码没有写入 localStorage，刷新页面后主题立即恢复。

3. **`window.__setTheme__` 不存在**: 应用实际的主题函数叫 `changeTheme()`（index.html L10246），且需要触发水浪过渡动画。`__setTheme__` 是臆造的函数名。

**正确做法应该是**:
```javascript
document.documentElement.setAttribute('data-theme', 'dark');
localStorage.setItem('mosaique-theme', 'dark');
```

**影响**: 主题切换功能 100% 失效。

---

### 缺陷 2: `ui chat <消息>` — 消息发送完全无效 🔴

**现象**:
- CLI 返回: "✓ 消息已发送"
- 桌面界面: **对话区域没有任何变化**，用户消息没有显示，AI 也没有回复

**根因分析**:

控制服务器发送的事件名是 `test-send-message`:

```javascript
mainWindow.webContents.send('test-send-message', { message });
```

**但渲染进程根本没有监听这个事件名**。

查看 preload.js (L1-115)，渲染进程暴露的 API 包括:
- `agentChat()` / `agentChatStream()` — 通过 `ipcRenderer.invoke()` 调用
- `onAgentStreamChunk()` / `onAgentStreamDone()` — 监听流式输出
- 以及各种数据操作 API

**没有任何 `ipcRenderer.on('test-send-message', ...)` 的监听器**。

`test-send-message` 这个名字只在 main.js 的测试服务器代码里出现过，是测试框架遗留的命名，**生产环境的渲染进程根本不认这个事件**。

**影响**: 聊天消息发送功能 100% 失效。

---

### 缺陷 3: 日历/配置/数据/服务/账号命令 — 与桌面应用完全脱节 🔴

**现象**:
- `calendar`、`config`、`data`、`server`、`account` 命令全部只输出到终端
- 桌面应用界面在 9 次截屏中**没有任何一次发生变化**

**根因分析**:

这些命令的设计是"纯 CLI"模式，只读取/修改文件，**没有任何与桌面应用渲染进程的交互**。

但用户的要求是"操作桌面端应用界面"。这意味着:
- 执行 `calendar` 命令后，桌面应用应该切换到日程视图
- 执行 `config` 命令后，桌面应用应该弹出设置面板
- 执行 `data backup` 后，桌面应用应该显示备份成功的 toast

**当前实现完全没有这些联动**。

**影响**: 5 个命令模块、13 条命令对桌面界面零影响。

---

### 缺陷 4: `ui exec` — 存在但未经测试，风险未知 🟡

**现象**:
- 未在本次测试中执行
- 但代码逻辑与 `ui theme` 类似，通过 `executeJavaScript()` 直接注入代码

**风险**:
- 如果用户执行 `ui exec "document.title = 'hacked'"`，确实会生效
- 但如果执行 `ui exec "localStorage.clear()"`，会**直接清空用户数据**，没有任何确认机制
- 这是一个**没有安全边界**的功能，存在数据损坏风险

---

### 缺陷 5: `ui query` — 查询结果可能不准确 🟡

**现象**:
- `ui query theme` 返回 "light"
- 但此前执行过 `ui theme dark`，虽然界面没变，但 body class 可能被改了
- reload 后恢复 light，查询才准确

**根因分析**:
- 查询依赖 `document.body.classList.contains('dark')`，但应用实际用 `document.documentElement.getAttribute('data-theme')`
- 查询逻辑与主题实现不一致，可能返回错误结果

---

## 三、架构层面的根本问题

### 问题 A: CLI 与桌面应用是"两张皮"

当前架构:
```
CLI (Node.js)  ←→  文件系统  ←→  Electron 主进程  ←→  渲染进程
```

CLI 直接操作文件，Electron 主进程也操作文件，两者**没有状态同步机制**。

正确的架构应该是:
```
CLI (Node.js)  ←→  HTTP 控制服务器  ←→  Electron 主进程  ←→  渲染进程
         ↑                              ↑
      发送指令                      转发指令到渲染进程
```

但当前只有 `ui` 子命令走了 HTTP 桥接，其他命令完全绕过了桌面应用。

### 问题 B: HTTP 控制服务器端点设计脱离实际

`/ui/theme` 和 `/ui/chat` 端点的实现者**没有看过渲染进程的实际代码**，凭想象写了:
- `document.body.classList.add('dark')` — 实际用 `document.documentElement.setAttribute('data-theme')`
- `window.__setTheme__()` — 实际函数叫 `changeTheme()`
- `webContents.send('test-send-message')` — 实际没有这个监听器

这是典型的"闭门造车"，端点实现与渲染进程实现完全脱节。

### 问题 C: 缺少渲染进程事件注册机制

preload.js 暴露了 `electronAPI` 对象给渲染进程，但:
- 没有暴露接收外部消息的能力
- 没有暴露切换视图/标签页的能力
- 没有暴露触发 toast 通知的能力

这意味着即使主进程想控制渲染进程，也**没有通道可用**。

---

## 四、修复优先级清单

| 优先级 | 缺陷 | 修复工作量 | 修复方案 |
|--------|------|-----------|----------|
| P0 | `ui theme` 无效 | 小 | 修正 JS 注入代码，操作 `document.documentElement` 和 `localStorage` |
| P0 | `ui chat` 无效 | 中 | 在 preload.js 添加 `onTestSendMessage` 监听器，在渲染进程添加消息处理逻辑 |
| P1 | 日历命令无界面联动 | 中 | 添加 `/ui/navigate` 端点，让 CLI 能命令桌面应用切换视图 |
| P1 | config 命令无界面联动 | 小 | 同上，或添加 `/ui/open-settings` 端点 |
| P2 | `ui exec` 安全风险 | 小 | 添加白名单机制，禁止危险操作 |
| P2 | `ui query` 逻辑错误 | 小 | 修正查询逻辑，与主题实现保持一致 |

---

## 五、测试方法反思

本次测试暴露了一个方法论问题:

**之前的报告为什么乐观?**

因为把"CLI 命令执行成功"等同于"功能正常"。但:
- CLI 返回成功 ≠ 桌面界面有变化
- 桌面界面无变化 ≠ 功能正常
- 只有**截屏验证**才能发现真正的问题

**正确的测试标准应该是**:
1. CLI 命令执行无报错
2. 桌面应用界面发生**预期的可见变化**
3. 变化与命令语义一致

按这个标准，18 条命令中只有 5 条真正通过（全是窗口操作），通过率 **27.8%**，而不是之前报告的 88.9%。

---

## 六、结论

PlanMosaic CLI-UI 桥接功能**名义上存在，实际上对桌面应用的业务界面几乎没有任何操作能力**。

- 能做的事情: 缩小/放大窗口、开关开发者工具、重载页面
- 不能做的事情: 切换主题、发送聊天消息、切换应用视图、触发任何业务操作

**这不是一个"可用但有瑕疵"的功能，这是一个"骨架搭起来了但血肉全无"的半成品。**

如果要达到用户要求的"利用命令行来操作桌面端应用界面"，至少需要:
1. 修复 `ui theme` 和 `ui chat` 的底层实现错误
2. 为所有业务命令（calendar/config/data）添加与渲染进程的联动机制
3. 建立渲染进程的事件监听体系，让主进程能真正控制界面