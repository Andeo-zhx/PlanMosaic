# Phase 7: 错误降级静态分析

> **目标**：分析 `main.js` 中 Python 后端管理、IPC 错误处理；分析 `ai-agent.js` 中输入校验、超时、API Key 错误、空消息、超长消息处理。

---

## 1. Python 后端管理（main.js）

### 1.1 Python 进程启动

**位置**：`main.js:135-200` `startPythonBackend()`

**关键代码**：
```javascript
function startPythonBackend() {
    const command = isDev ? `python` : getBundledPythonPath();
    const scriptPath = path.join(__dirname, 'backend', 'server.py');
    const port = 5199;

    const env = { ...process.env, PM_PORT: port.toString(), PYTHONIOENCODING: 'utf-8' };

    pythonProcess = spawn(command, [...args, scriptPath], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    console.log('[Python] Started, PID=' + pythonProcess.pid);

    let backendReady = false;
    let backendError = null;
    let retryCount = 0;

    const onPythonOutput = (data) => { /* parse "PM_READY:port" */ };
    pythonProcess.stdout.on('data', onPythonOutput);
    pythonProcess.stderr.on('data', (data) => { console.error('[Python] ERR:', data.toString().trim()); });

    // 健康检查
    const healthCheck = async () => {
        try {
            const r = await fetch('http://127.0.0.1:5199/health', { signal: AbortSignal.timeout(2000) });
            if (r.ok) { backendReady = true; return; }
        } catch(e) {}
        if (++retryCount < 15) setTimeout(healthCheck, 1000);
        else { backendError = 'Python 后端启动超时'; notifyRendererOfFailure(); }
    };
    healthCheck();
}
```

**结论**：✅ **PASS** — 15s 健康检查窗口（15 次 × 1s）

### 1.2 Python 退出监听

**位置**：`main.js:200-230`

```javascript
pythonProcess.on('exit', (code, signal) => {
    pythonProcess = null;
    console.log('[Python] Exited, code=' + code);
    if (code === 0) {
        backendStatus = 'stopped';
        return;  // 正常退出，不重启
    }
    if (backendStatus === 'restarting') {
        restartPythonBackend();  // 已经在重启流程
        return;
    }
    if (restartAttempts < 3) {
        restartAttempts++;
        backendStatus = 'restarting';
        setTimeout(() => startPythonBackend(), 2000);
    } else {
        backendStatus = 'failed';
        notifyRendererOfFailure('Python 后端已停止');
    }
});
```

**关键**：
- ✅ `exit` 事件已注册
- ✅ 重启次数上限：3 次
- ✅ 重启间隔：2s
- ⚠️ **退出后 4s 内第 1 次重启**（restartAttempts++ 后立即 setTimeout 2s）
- ✅ 失败上限后 `backendStatus = 'failed'` + 通知 renderer

**结论**：✅ **PASS** — 完整退出监听

### 1.3 重启逻辑

**位置**：`main.js:235-260` `restartPythonBackend()`

```javascript
function restartPythonBackend() {
    if (restartAttempts >= 3) {
        backendStatus = 'failed';
        return;
    }
    restartAttempts++;
    backendStatus = 'restarting';
    notifyRendererOfStatus('restarting');
    setTimeout(() => {
        startPythonBackend();
    }, 2000);
}
```

**重启间隔**：
- 第 1 次：失败后 2s
- 第 2 次：失败后 2s
- 第 3 次：失败后 2s
- 第 4 次：**不再尝试**

**结论**：✅ **PASS** — 但**间隔不递增**（exponential backoff 缺失）— 2s 间隔适合快速恢复，但若 Python 启动脚本本身有问题，会在 6s 内连续失败 3 次

### 1.4 前端感知后端离线

**IPC channels**：
- `python-status`：`main.js:280-310` `notifyRendererOfStatus` — 推 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped'
- `python-backend-error`：`main.js:265-275` `notifyRendererOfFailure` — 弹错误并提供手动重启按钮

**结论**：✅ **PASS** — IPC 已注册

**`preload.js` 暴露**：`preload.js:78-82`
```javascript
onPythonStatus: (callback) => ipcRenderer.on('python-status', (event, status) => callback(status)),
onPythonBackendError: (callback) => ipcRenderer.on('python-backend-error', (event, err) => callback(err)),
```

**结论**：✅ **PASS** — preload 暴露完整

### 1.5 前端展示"重连中..."状态

**位置**：`index.html:9930-9960`

```javascript
window.electronAPI.onPythonStatus((status) => {
    const banner = document.getElementById('pythonStatusBanner');
    if (status === 'ready') {
        banner.classList.remove('active', 'error', 'restarting');
    } else if (status === 'restarting') {
        banner.textContent = 'Python 后端连接中断，2秒后自动重连...';
        banner.classList.add('active', 'restarting');
    } else if (status === 'failed' || status === 'stopped') {
        banner.textContent = 'Python 后端已停止，请点击重启';
        banner.classList.add('active', 'error');
    } else if (status === 'starting') {
        banner.textContent = '正在启动后端...';
        banner.classList.add('active', 'restarting');
    }
});
```

**结论**：✅ **PASS** — 4 种状态文案 + 3 种颜色（error 红色 / restarting 黄色 / ready 隐藏）

### 1.6 前端显示"重试"按钮

**位置**：`index.html:7264-7274` — 在 settings 弹窗中
```html
<button class="api-key-btn" id="manualRestartPythonBtn" onclick="manualRestartPython()">手动重启后端</button>
```

**`manualRestartPython()` 位置**：`index.html:8422-8450`
```javascript
async function manualRestartPython() {
    var btn = document.getElementById('manualRestartPythonBtn');
    btn.disabled = true;
    btn.textContent = '重启中...';
    try {
        const result = await window.electronAPI.restartPython();
        // ... 显示结果
    } catch (e) {
        // ... 错误
    } finally {
        btn.disabled = false;
        btn.textContent = '手动重启后端';
    }
}
```

**结论**：✅ **PASS** — 完整降级

---

## 2. `pythonApi()` 错误处理

**位置**：`main.js:1540-1620`

**关键代码**：
```javascript
async function pythonApi(method, endpoint, body = null, timeout = 30000) {
    const url = `http://127.0.0.1:5199${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { method, signal: controller.signal, headers, body });
        clearTimeout(timeoutId);
        if (!response.ok) {
            // 错误处理：返回 {error: ...}，不抛
            return { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') return { error: '请求超时' };
        return { error: error.message };
    }
}
```

**关键点**：
- ✅ 默认 30s 超时
- ✅ 超时返回 `{error: '请求超时'}`（**不抛**）
- ✅ HTTP 非 200 返回 `{error: 'HTTP NNN: ...'}`
- ✅ 网络错误返回 `{error: err.message}`

**结论**：✅ **PASS** — 统一降级

---

## 3. AI Agent 错误处理（ai-agent.js）

### 3.1 空消息校验

**位置**：`ai-agent.js:646-653`

```javascript
if (!msg || (msg && msg.trim() === '')) {
    if (uploadedImages.length === 0) {
        if (input) {
            input.classList.add('shake-input');
            setTimeout(function() { input.classList.remove('shake-input'); }, 400);
        }
        return;
    }
}
```

**结论**：✅ **PASS** — 触发 shake 动画 400ms
- ✅ 有图片时可继续（msg 允许为空）

### 3.2 超长消息处理

**检查**：`ai-agent.js` 中是否有 `maxLength` 限制？

**结论**：❌ **未发现客户端长度限制** — 用户可输入无限长文本
- 风险：超大文本可能撑爆后端 8000/16000 token 限制
- 但有 token 估算截断：`conversationHistory.slice(-50)` + 自动缩 sliceSize（line 759-769）
- **当前 message 本身**未做截断

**修复建议**：
```javascript
const MAX_MSG_LEN = 8000;
if (msg.length > MAX_MSG_LEN) {
    showToast('消息过长，已截断到 8000 字符', 'warning');
    msg = msg.substring(0, MAX_MSG_LEN);
}
```

### 3.3 API Key 未配置 / 无效的错误提示

**位置**：`ai-agent.js:835-841`

```javascript
} catch (e) {
    var errorMsg = '抱歉，发生了未知错误。';
    if (e.message?.includes('401')) errorMsg = 'API Key 无效或未配置。';
    else if (e.message?.includes('429')) errorMsg = '请求频率超限，请稍后重试。';
    else if (e.message?.includes('402')) errorMsg = 'API 余额不足，请充值。';
    addMessageToContainer(chatContainer, 'assistant', errorMsg);
}
```

**结论**：✅ **PASS** — 3 种错误码友好提示
- ⚠️ 但**未引导用户去设置页** — 仅文本提示

**`saveApiKey` 错误**：`index.html:10131-10150`
```javascript
} catch (error) {
    showApiKeyMessage('deepseek', '保存失败: ' + (error.message || '未知错误'), 'error');
    return;
}
```

**结论**：✅ **PASS** — 显示在消息条

### 3.4 超时处理

**主进程**：`main.js:884`
```javascript
req.on('timeout', () => {
    clearHeartbeat();
    if (pythonResponse && pythonResponse.destroy) pythonResponse.destroy();
    if (activeAgentStreamReq) activeAgentStreamReq.destroy();
    activeAgentStreamReq = null;
    event.sender.send('agent-stream-error', { error: '请求超时（2分钟无响应）' });
});
```

**Renderer 接收**：
- ❌ **未在 ai-agent.js 中发现 `onAgentStreamError` 监听器**
- ❌ **preload.js 未暴露 `onAgentStreamError`**

**结论**：❌ **FAIL** — 超时事件主进程发了，**renderer 收不到**

**修复建议**：
```javascript
// preload.js:31
onAgentStreamError: (callback) => ipcRenderer.on('agent-stream-error', (event, err) => callback(err)),

// ai-agent.js sendAgentMessage 中
window.electronAPI.onAgentStreamError((err) => {
    if (typingIndicator) typingIndicator.classList.remove('active');
    addMessageToContainer(chatContainer, 'assistant', '⏱️ ' + (err.error || '请求超时'));
    window._isSending = false;
    window._hasPendingStream = false;
});
```

### 3.5 心跳超时（45s 无数据）

**位置**：`main.js:739-747`

```javascript
const heartbeatThreshold = 45000;
let lastDataTime = performance.now();
const heartbeatInterval = setInterval(() => {
    if (performance.now() - lastDataTime > heartbeatThreshold) {
        clearInterval(heartbeatInterval);
        req.destroy();
        event.sender.send('agent-stream-error', { error: '后端45秒无响应，已断开连接' });
    }
}, 5000);
```

**结论**：❌ 同样 — renderer 未监听 stream-error

---

## 4. 网络错误处理

### 4.1 offline 检测

**位置**：`ai-agent.js:621-624`

```javascript
if (!navigator.onLine) {
    showToast('该功能需要网络连接', 'warning');
    return;
}
```

**结论**：✅ **PASS** — 简单检查

### 4.2 fetch 网络错误

**位置**：`ai-agent.js:1064-1068` (`handleImageUpload`)

```javascript
catch (e) {
    showToast('图片处理失败: ' + e.message, 'error');
}
```

**结论**：⚠️ 部分

### 4.3 Backend API 错误降级

**位置**：调用 `pythonApi` 的多个 IPC handler

**`create-schedule` 错误**：`main.js:1914-1920`
```javascript
catch (error) {
    console.error('创建日程失败:', error);
    return { success: false, error: error.message };
}
```

**结论**：✅ **PASS**

---

## 5. 错误降级总览

| 错误类型 | 检测点 | 用户提示 | 降级 | 结论 |
|---------|--------|---------|------|------|
| Python 后端启动失败 | main.js:200 退出 | banner 红色 + 手动重启 | ✅ | PASS |
| Python 后端 2s 重启 | main.js:235 | banner 黄色 | ✅ | PASS |
| Python 后端 3 次失败 | main.js:260 | banner 红色 + 手动重启按钮 | ✅ | PASS |
| `pythonApi` 网络断 | main.js:1540 | `{error: 'ECONNREFUSED'}` | ✅ | PASS |
| `pythonApi` 30s 超时 | main.js:1547 | `{error: '请求超时'}` | ✅ | PASS |
| `pythonApi` HTTP 500 | main.js:1555 | `{error: 'HTTP 500'}` | ✅ | PASS |
| Agent 流式 2min 超时 | main.js:884 | `agent-stream-error` | ❌ renderer 不监听 | **FAIL** |
| Agent 流式 45s 无数据 | main.js:739 | `agent-stream-error` | ❌ renderer 不监听 | **FAIL** |
| 空消息 | ai-agent.js:646 | shake 400ms | ✅ | PASS |
| 超长消息 | ai-agent.js:646 | ❌ 无 | ❌ | **FAIL** |
| API Key 401 | ai-agent.js:839 | "API Key 无效或未配置" | ⚠️ 无引导去设置 | PARTIAL |
| API Key 429 | ai-agent.js:840 | "请求频率超限" | ✅ | PASS |
| API Key 402 | ai-agent.js:841 | "API 余额不足" | ✅ | PASS |
| 浏览器离线 | ai-agent.js:621 | toast "该功能需要网络连接" | ✅ | PASS |

---

## 6. 关键缺陷总结

### P0 缺陷
1. **`onAgentStreamError` preload 未暴露** — `preload.js:31-39` 完全无 `onAgentStreamError` 暴露
2. **ai-agent.js 未监听流式错误** — 超时/网络断后 typing indicator 残留

### P1 缺陷
3. **超长消息未做客户端截断** — 8000 字符以上直接发，可能撑爆 token
4. **API Key 401 错误无引导去设置** — 用户看到错误不知道下一步

### P2 缺陷
5. **Python 重启间隔固定 2s** — 无 exponential backoff，若根因是 Python 启动脚本错误，6s 内 3 次失败

---

## 7. 截图证据

| 场景 | 预期 | 状态 |
|------|------|------|
| Python 启动 loading | phase5-error-1-python-starting.png | 待 GUI |
| Python 失败 banner | phase5-error-2-python-error-banner.png | 待 GUI |
| 重连中 banner | phase5-error-3-restarting-banner.png | 待 GUI |
| API Key 401 错误 | phase5-error-4-apikey-401.png | 待 GUI |
| 401 错误引导去设置 | phase5-error-5-apikey-401-with-link.png | **预期 FAIL**（待 GUI 确认）|
| 空消息 shake | phase5-error-6-empty-shake.png | 待 GUI |

---

**报告生成时间**：2026-06-04
**审计方式**：纯静态
**核心问题**：`onAgentStreamError` 在 2 个层面（preload 暴露 + renderer 监听）均缺失，超时/网络断 45s 后无用户提示
