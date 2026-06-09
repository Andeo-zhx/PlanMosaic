const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_REMOVE_CHANNELS = [
    'agent-stream-chunk',
    'agent-stream-done',
    'agent-stream-status',
    'agent-stream-error',
    'agent-stream-self-check',
    'api-key-configured',
    'python-status',
    'python-backend-error',
    'disk-full-error'
];

const listenerRegistry = new Map();

function trackListener(channel, callback, wrapped) {
    if (!listenerRegistry.has(channel)) {
        listenerRegistry.set(channel, new Map());
    }
    const channelMap = listenerRegistry.get(channel);
    if (!channelMap.has(callback)) {
        channelMap.set(callback, new Set());
    }
    channelMap.get(callback).add(wrapped);
}

function removeTrackedListener(channel, callback, wrapped) {
    if (!ALLOWED_REMOVE_CHANNELS.includes(channel)) {
        console.warn(`[Preload] removeListener blocked for channel: ${channel}`);
        return;
    }
    const channelMap = listenerRegistry.get(channel);
    const wrappedSet = channelMap && channelMap.get(callback);
    if (!wrappedSet || wrappedSet.size === 0) {
        return;
    }
    const targets = wrapped ? [wrapped] : Array.from(wrappedSet);
    targets.forEach((fn) => {
        ipcRenderer.removeListener(channel, fn);
        wrappedSet.delete(fn);
    });
    if (wrappedSet.size === 0) {
        channelMap.delete(callback);
    }
    if (channelMap.size === 0) {
        listenerRegistry.delete(channel);
    }
}

function addListener(channel, callback, wrapperFactory) {
    if (typeof callback !== 'function') {
        return function noop() {};
    }
    const wrapped = wrapperFactory(callback);
    trackListener(channel, callback, wrapped);
    ipcRenderer.on(channel, wrapped);
    return function unsubscribe() {
        removeTrackedListener(channel, callback, wrapped);
    };
}

// 向渲染进程暴露安全的IPC接口
contextBridge.exposeInMainWorld('electronAPI', {
    // 获取日程数据
    getScheduleData: () => ipcRenderer.invoke('get-schedule-data'),

    // 获取启动扫描数据
    getStartupScan: () => ipcRenderer.invoke('get-startup-scan'),

    // 获取AI对话历史
    getAgentHistory: () => ipcRenderer.invoke('get-agent-history'),

    // 保存AI对话历史（自动压缩归档）
    saveAgentHistory: (data) => ipcRenderer.invoke('save-agent-history', data),

    // AI对话（非流式）
    agentChat: (data) => ipcRenderer.invoke('agent-chat', data),

    // AI对话（流式输出）
    agentChatStream: (data) => ipcRenderer.invoke('agent-chat-stream', data),

    deepPlanningChat: (data) => ipcRenderer.invoke('deep-planning-chat', data),
    deepPlanningProfile: (data) => ipcRenderer.invoke('deep-planning-profile', data),
    generateReactLog: (data, full) => ipcRenderer.invoke('generate-react-log', data, full),

    // 流式输出事件监听
    onAgentStreamChunk: (callback) => addListener('agent-stream-chunk', callback, (cb) => (_event, chunk) => cb(chunk)),
    onAgentStreamDone: (callback) => addListener('agent-stream-done', callback, (cb) => () => cb()),
    onAgentStreamStatus: (callback) => addListener('agent-stream-status', callback, (cb) => (_event, status) => cb(status)),
    onAgentStreamError: (callback) => addListener('agent-stream-error', callback, (cb) => (_event, err) => cb(err)),
    onAgentStreamSelfCheck: (callback) => addListener('agent-stream-self-check', callback, (cb) => (_event, payload) => cb(payload)),
    removeListener: (channel, callback) => {
        removeTrackedListener(channel, callback);
    },
    removeAllAgentListeners: () => {
        ipcRenderer.removeAllListeners('agent-stream-chunk');
        ipcRenderer.removeAllListeners('agent-stream-done');
        ipcRenderer.removeAllListeners('agent-stream-status');
        ipcRenderer.removeAllListeners('agent-stream-error');
        ipcRenderer.removeAllListeners('agent-stream-self-check');
        listenerRegistry.delete('agent-stream-chunk');
        listenerRegistry.delete('agent-stream-done');
        listenerRegistry.delete('agent-stream-status');
        listenerRegistry.delete('agent-stream-error');
        listenerRegistry.delete('agent-stream-self-check');
    },

    cancelAgentStream: () => ipcRenderer.invoke('cancel-agent-stream'),

    // 批准日程修改
    agentApprove: (proposal) => ipcRenderer.invoke('agent-approve', proposal),

    // 归档对话
    archiveConversations: () => ipcRenderer.invoke('archive-conversations'),

    // 清空对话
    clearConversations: () => ipcRenderer.invoke('clear-conversations'),

    // 保存日程数据
    saveScheduleData: (data) => ipcRenderer.invoke('save-schedule-data', data),

    getScheduleDataLocal: () => ipcRenderer.invoke('get-schedule-data-local'),
    saveScheduleDataLocal: (data) => ipcRenderer.invoke('save-schedule-data-local', data),
    getAgentHistoryLocal: () => ipcRenderer.invoke('get-agent-history-local'),

    // API Key 管理 API
    getApiKeys: async () => {
        const keys = await ipcRenderer.invoke('get-api-keys');
        return Object.fromEntries(
            Object.entries(keys).map(([provider, val]) => [provider, {
                ...(val || {}),
                configured: !!(val && val.hasKey)
            }])
        );
    },
    setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
    onApiKeyConfigured: (callback) => addListener('api-key-configured', callback, (cb) => (_e, d) => cb(d)),
    openApiKeyUrl: (provider) => ipcRenderer.invoke('open-api-key-url', provider),
    validateApiKey: (provider) => ipcRenderer.invoke('validate-api-key', provider),

    // 用户账号切换（按账号隔离数据目录）
    setActiveUser: (username) => ipcRenderer.invoke('set-active-user', username),

    // 保存 ReAct 日志文件（弹出原生保存对话框）
    saveReActFile: (data) => ipcRenderer.invoke('save-react-file', data),

    onPythonStatus: (callback) => addListener('python-status', callback, (cb) => (_event, data) => cb(data)),

    onPythonBackendError: (callback) => addListener('python-backend-error', callback, (cb) => (_event, data) => cb(data)),

    onDiskFullError: (callback) => addListener('disk-full-error', callback, (cb) => (_event, data) => cb(data))
});

console.log('[Preload] Electron API exposed');
