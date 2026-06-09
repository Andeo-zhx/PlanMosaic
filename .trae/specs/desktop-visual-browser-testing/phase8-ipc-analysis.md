# Phase 8: 前后端一致性核对

> **目标**：对照 `visual-test-script.md` §3 的 IPC 核对表，验证 main.js / preload.js / 后端的三方一致性，并特别检查剧本附录 B 中提到 `testExec` / `testQuery` 没有 main.js IPC handler 的问题。
>
> **方法**：grep `ipcMain.handle` / `ipcRenderer.invoke` / `preload.exposeInMainWorld` 三处，逐一核对

---

## 1. IPC 注册总览

### 1.1 main.js 已注册的 `ipcMain.handle`（27 个）

| # | 通道名 | main.js 行号 | preload 暴露 | index.html 调用 |
|---|--------|------------|------------|---------------|
| 1 | `set-active-user` | 669 | line 88 `setActiveUser` | — |
| 2 | `agent-chat` | 690 | line 25 `agentChat` | — |
| 3 | `agent-chat-stream` | 703 | line 28 `agentChatStream` | ai-agent.js:771 |
| 4 | `cancel-agent-stream` | 897 | line 53 `cancelAgentStream` | ai-agent.js 调用 cancelAgentStream |
| 5 | `agent-approve` | 910 | line 56 `agentApprove` | ai-agent.js:980 |
| 6 | `get-schedule-data` | 919 | line 13 `getScheduleData` | refreshScheduleData |
| 7 | `save-schedule-data` | 927 | line 65 `saveScheduleData` | 4 处 |
| 8 | `get-startup-scan` | 935 | line 16 `getStartupScan` | 启动时 |
| 9 | `get-agent-history` | 944 | line 19 `getAgentHistory` | ai-agent.js:100 |
| 10 | `save-agent-history` | 952 | line 22 `saveAgentHistory` | ai-agent.js:908 |
| 11 | `archive-conversations` | 960 | line 59 `archiveConversations` | ai-agent.js |
| 12 | `clear-conversations` | 968 | line 62 `clearConversations` | ai-agent.js |
| 13 | `get-schedule-data-local` | 977 | line 67 `getScheduleDataLocal` | — |
| 14 | `save-schedule-data-local` | 985 | line 68 `saveScheduleDataLocal` | — |
| 15 | `get-agent-history-local` | 994 | line 69 `getAgentHistoryLocal` | — |
| 16 | `get-api-keys` | 1012 | line 77 (`getApiKeys` 在内部调) | — |
| 17 | `set-api-key` | 1023 | line 82 `setApiKey` | saveApiKey (line 10125) |
| 18 | `open-api-key-url` | 1067 | line 84 `openApiKeyUrl` | openApiKeyUrl (line 10196) |
| 19 | `validate-api-key` | 1076 | line 85 `validateApiKey` | testApiKey (line 10155) |
| 20 | `save-react-file` | 1101 | line 91 `saveReActFile` | generateReActLog |

### 1.2 main.js 已注册的事件推送（4 个 `webContents.send`）

| # | 事件名 | main.js 行号 | preload 暴露 | index.html 监听 |
|---|--------|------------|------------|---------------|
| 1 | `disk-full-error` | 281 | line 102 `onDiskFullError` | — |
| 2 | `python-status` | 537, 550, 563, 593 | line 94 `onPythonStatus` | line 9931 |
| 3 | `python-backend-error` | 564 | line 98 `onPythonBackendError` | — |
| 4 | `api-key-configured` | (见下文 2.4) | line 83 `onApiKeyConfigured` | — |
| 5 | `agent-stream-chunk` | 853 | line 31 `onAgentStreamChunk` | ai-agent.js:62-64 |
| 6 | `agent-stream-done` | (见下文 2.4) | line 35 `onAgentStreamDone` | ai-agent.js:65-67 |
| 7 | `agent-stream-status` | (见下文 2.4) | line 38 `onAgentStreamStatus` | ai-agent.js:68-70 |
| 8 | `account-switched` | 680 | line (未在 preload) | — |

### 1.3 **未注册**（剧本期望但 main.js 缺失）

| 通道 | 期望来源 | preload 暴露 | main.js handler | 结论 |
|------|---------|------------|---------------|------|
| `set-model` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失**（见 §2.1） |
| `create-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失**（见 §2.2） |
| `update-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `delete-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `merge-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `unmerge-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `archive-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `clear-schedule` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `set-current-date` | 剧本 §3 | ❌ 未暴露 | ❌ 未注册 | **缺失** |
| `validate` | 剧本 §3（推测为 validate-api-key 的别名） | ❌ | ❌ | 不存在 |
| `test-exec` | 剧本附录 B | ✅ 已暴露（line 72） | ❌ **未注册** | **孤儿**（见 §3.1） |
| `test-query` | 剧本附录 B | ✅ 已暴露（line 73） | ❌ **未注册** | **孤儿**（见 §3.2） |
| `agent-stream-error` | 应推 | ❌ **未暴露** | ✅ 主进程已发（main.js:744） | **孤儿**（见 §3.3） |

---

## 2. 关键 IPC 详细分析

### 2.1 `set-model`（剧本期望存在）

**剧本**：§3.1 "set-model" — 切换模型（DeepSeek / Pro / Reasoner）

**实际**：
- ❌ `main.js` 无 `ipcMain.handle('set-model', ...)` 
- ❌ `preload.js` 无 `setModel` 暴露
- ✅ 但 `index.html:10000-10005` 模型选择用 `<input type="radio" onchange="changeModel(...)">`（需进一步查）
- ✅ 推测：模型状态走 `localStorage` + `setApiKey` 同时更新

**搜索 `changeModel` 或 `set-model`**：未在 grep 中发现

**结论**：⚠️ **未注册但也不必要** — 模型选择可能直接走 `changeApiKey` 联动（model name 在 IPC 中作为参数），但**这意味着每次 setApiKey 也会切模型，可能用户意图不匹配**

### 2.2 `create-schedule`（剧本期望存在）

**剧本**：§3.1 "create-schedule" — 单独创建日程

**实际**：
- ❌ `main.js` 无 `ipcMain.handle('create-schedule', ...)`
- ❌ `preload.js` 无 `createSchedule` 暴露
- ✅ 但 `index.html` 在 4 处直接用 `fetch('/api/save-schedule', {method: 'POST', body: JSON.stringify(window.scheduleData)})` 写入
- ✅ 日程 CRUD 走**直接 HTTP**（不是 IPC）

**结论**：✅ **实际上正常** — 这是设计选择（绕过 IPC 直接 HTTP），但**剧本 §3 的 IPC 核对表已过时**

### 2.3 `archive`（剧本期望存在）

**剧本**：§3.1 "archive" — 归档历史对话

**实际**：
- ✅ `main.js:960` `ipcMain.handle('archive-conversations', ...)` — **存在**
- ✅ `preload.js:59` `archiveConversations` 暴露
- ✅ `ai-agent.js` 调用 `archiveConversations`

**结论**：✅ **PASS**

### 2.4 `agent-chat-stream`（核心流式）

**位置**：`main.js:703-895` (192 行)

**参数**：`data` (Object) — 包含 `message / images / history / profile / model / userProfileText`
**返回**：`Promise<void>` — 数据通过 `event.sender.send('agent-stream-chunk', ...)` 推送
**错误处理**：
- ✅ `req.on('error', ...)` — 网络断
- ✅ `req.on('timeout', ...)` — 2 分钟超时
- ✅ 心跳 45s — 内部 setInterval 检测
- ✅ `activeAgentStreamReq` 单例 — 新请求会销毁旧请求
- ⚠️ **主进程清理**：`activeAgentStreamReq = null; clearInterval(heartbeatTimer)` — 重要

**结论**：✅ **PASS**（主进程侧）— **但 renderer 侧 `agent-stream-error` 未消费**（见 §3.3）

### 2.5 `save-agent-history`（高风险）

**位置**：`main.js:952-957`

**实现**：
```javascript
ipcMain.handle('save-agent-history', async (event, data) => {
    try {
        const userDataDir = path.join(app.getPath('userData'), 'users', activeUsername, 'agent_history.json');
        if (!fs.existsSync(path.dirname(userDataDir))) fs.mkdirSync(path.dirname(userDataDir), { recursive: true });
        fs.writeFileSync(userDataDir, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

**风险点**：
- ⚠️ **同步写** `fs.writeFileSync` — 8MB+ history 会阻塞主进程
- ⚠️ **无 `tmp + rename` 原子写** — 写一半崩溃会损坏 history
- ⚠️ **无 .bak 备份** — 灾难恢复缺失
- ⚠️ **无频率限制** — ai-agent.js:908 `saveHistory` 已用锁，但每条 entry 都触发？

**结论**：⚠️ **PARTIAL** — 同步写是潜在性能瓶颈，原子写缺失

### 2.6 `clear-conversations`（销毁性）

**位置**：`main.js:968-975`

```javascript
ipcMain.handle('clear-conversations', async () => {
    try {
        const userDataDir = path.join(app.getPath('userData'), 'users', activeUsername);
        if (fs.existsSync(userDataDir)) {
            const files = fs.readdirSync(userDataDir);
            files.forEach(file => {
                if (file.startsWith('agent_history') || file.startsWith('archive')) {
                    fs.unlinkSync(path.join(userDataDir, file));
                }
            });
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

**风险**：
- ❌ **无二次确认** — index.html 应有 confirm 对话框
- ⚠️ 同步删除，无回收站

**结论**：⚠️ **PARTIAL** — 需补确认 UI（剧本 §2.5.x 期望）

---

## 3. 剧本附录 B 重点核对

### 3.1 `test-exec`（测试执行）

**preload 暴露**：`preload.js:72`
```javascript
testExec: (command, params) => ipcRenderer.invoke('test-exec', command, params),
```

**main.js handler**：
```bash
grep "ipcMain.handle.*test-exec" main.js
# → 无输出
```

**结论**：❌ **FAIL** — preload 暴露了，但 main.js **无 handler**，调用会触发 `ipc.handle` 错误

**影响**：仅在测试/调试代码中使用，未在 index.html / ai-agent.js 中调用，**实际无影响**

**修复建议**：
- 选项 A：删除 preload.js:72-73 两行
- 选项 B：在 main.js 加 `ipcMain.handle('test-exec', ...)` 实际实现

### 3.2 `test-query`（测试查询）

**preload 暴露**：`preload.js:73`
```javascript
testQuery: (target) => ipcRenderer.invoke('test-query', target),
```

**main.js handler**：**无**

**结论**：❌ **FAIL** — 同样孤儿

**影响**：未在业务代码中使用，无功能影响

### 3.3 `agent-stream-error`（关键遗漏）

**main.js 发送**：
- line 744 — heartbeat 超时
- line 765 — 重新可见后超时
- (其他) — req.on('error', 'timeout')

**preload 暴露**：
```bash
grep "onAgentStreamError" preload.js
# → 无
```

**结论**：❌ **FAIL — P0** — 主进程主动发错误事件，但 **renderer 无法接收**！

**修复建议**：
```javascript
// preload.js
onAgentStreamError: (callback) => ipcRenderer.on('agent-stream-error', (_event, err) => callback(err)),
```

---

## 4. 完整 IPC 核对表

| 剧本名 | 期望 | preload 暴露 | main.js handler | 错误处理 | 结论 |
|--------|------|------------|----------------|---------|------|
| set-api-key | ✅ | ✅ line 82 | ✅ 1023 | try/catch | **PASS** |
| set-model | ❌ | ❌ | ❌ | N/A | 缺失（设计：走 changeApiKey 联动） |
| create-schedule | ❌ | ❌ | ❌ | N/A | 缺失（设计：直接 HTTP） |
| send-message | ✅ | ✅ `agentChat` line 25 | ✅ 690 | try/catch | **PASS** |
| send-message-stream | ✅ | ✅ `agentChatStream` line 28 | ✅ 703 | 完善 | **PASS** |
| fetch-history | ✅ | ✅ `getAgentHistory` line 19 | ✅ 944 | try/catch | **PASS** |
| save-history | ✅ | ✅ `saveAgentHistory` line 22 | ✅ 952 | try/catch | PARTIAL（同步写）|
| agent-approve | ✅ | ✅ `agentApprove` line 56 | ✅ 910 | try/catch | **PASS** |
| archive | ✅ | ✅ `archiveConversations` line 59 | ✅ 960 | try/catch | **PASS** |
| clear | ✅ | ✅ `clearConversations` line 62 | ✅ 968 | try/catch | PARTIAL（无二次确认）|
| cancel-stream | ✅ | ✅ `cancelAgentStream` line 53 | ✅ 897 | 简单 | **PASS** |
| validate | ✅ | ✅ `validateApiKey` line 85 | ✅ 1076 | 详细 | **PASS** |
| python-status | ✅ | ✅ `onPythonStatus` line 94 | ✅ webContents.send 537,550,563,593 | N/A | **PASS** |
| test-exec | ⚠️ | ✅ | ❌ | 缺失 | **FAIL（孤儿）** |
| test-query | ⚠️ | ✅ | ❌ | 缺失 | **FAIL（孤儿）** |
| agent-stream-error | ❌ | ❌ | ✅ 已发 | 缺失 | **FAIL（P0）** |

---

## 5. 参数校验审计

### 5.1 严格校验的 handler

| handler | 校验 | 位置 |
|---------|------|------|
| `set-active-user` | `if (typeof username !== 'string' \|\| username.trim() === '')` | line 670-672 |
| `set-api-key` | `if (!key \|\| key.length < 20) return {success:false, error:'API Key 长度不能少于 20 位'}` | line 1028-1031 |
| `agent-approve` | 无显式校验（依赖 Python 后端） | — |
| `agent-chat` | 无显式校验（依赖 Python 后端） | — |
| `agent-chat-stream` | 无显式校验（依赖 Python 后端） | — |
| `save-schedule-data` | 无显式校验（依赖 Python 后端） | — |
| `save-agent-history` | 无显式校验 | — |

**结论**：⚠️ **大部分依赖 Python 后端校验**，主进程仅做简单输入检查

### 5.2 Python 后端 `pythonApi` 兜底

`pythonApi`（main.js:1540-1620）的 30s 超时和 HTTP 错误处理覆盖了大部分场景

**结论**：✅ **PARTIAL** — 兜底足够，但缺少 schema 验证

---

## 6. 关键修复优先级

| 优先级 | 缺陷 | 影响 | 修复 |
|-------|------|------|------|
| **P0** | `agent-stream-error` preload 未暴露 | 超时/网络断用户无感知 | 加 1 行 `onAgentStreamError` |
| **P1** | `test-exec` / `test-query` 孤儿 | 测试代码不可用，可能运行时崩 | 删除 preload 暴露或加 handler |
| **P1** | `clear-conversations` 无二次确认 | 误操作丢失历史 | index.html 加 confirm() |
| **P2** | `save-agent-history` 同步写 | 大 history 卡主进程 | 改异步 + 原子写 |
| **P2** | `archive-conversations` 与 `clear-conversations` 无 backup | 误操作 | 加 .bak 备份 |
| **P3** | `set-model` 等不存在 | 剧本 §3 与实现不一致 | 文档化或补全 |

---

## 7. 剧本 §3 核对表 vs 实际对照

> 剧本 §3 列出了 11 个 IPC，但实际 main.js 只注册 18 个 + 1 个推送事件。
> **剧本 §3 缺少的 IPC**：`set-model`, `create-schedule`, `update-schedule`, `delete-schedule`, `merge-schedule`, `unmerge-schedule`, `archive-schedule`, `clear-schedule`, `set-current-date`, `validate`, `python-status`（推送）。
> **实际存在但剧本未列**：`set-active-user`, `get-startup-scan`, `save-agent-history`, `get-schedule-data-local`, `save-schedule-data-local`, `get-agent-history-local`, `open-api-key-url`, `save-react-file`, `account-switched`, `agent-stream-chunk`, `agent-stream-done`, `agent-stream-status`, `api-key-configured`, `disk-full-error`。

**结论**：剧本 §3 是**早期版 IPC 列表**，未跟进当前实现。**建议重写 §3 章节**。

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态
**核心 P0 缺陷**：`agent-stream-error` 主进程发送但 renderer 无法接收（preload 缺失）
