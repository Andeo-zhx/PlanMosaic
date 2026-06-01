const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_REMOVE_CHANNELS = [
    'agent-stream-chunk',
    'agent-stream-done',
    'agent-stream-status',
    'agent-stream-error'
];

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

    // 流式输出事件监听
    onAgentStreamChunk: (callback) => {
        ipcRenderer.on('agent-stream-chunk', (_event, chunk) => callback(chunk));
    },
    onAgentStreamDone: (callback) => {
        ipcRenderer.on('agent-stream-done', () => callback());
    },
    onAgentStreamStatus: (callback) => {
        ipcRenderer.on('agent-stream-status', (_event, status) => callback(status));
    },
    removeListener: (channel, callback) => {
        if (!ALLOWED_REMOVE_CHANNELS.includes(channel)) {
            console.warn(`[Preload] removeListener blocked for channel: ${channel}`);
            return;
        }
        ipcRenderer.removeListener(channel, callback);
    },
    removeAllAgentListeners: () => {
        ipcRenderer.removeAllListeners('agent-stream-chunk');
        ipcRenderer.removeAllListeners('agent-stream-done');
        ipcRenderer.removeAllListeners('agent-stream-status');
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

    // Agent Provider API
    getAgentProvider: () => ipcRenderer.invoke('get-agent-provider'),
    setAgentProvider: (provider) => ipcRenderer.invoke('set-agent-provider', provider),

    // DeepSeek Model API
    getDeepSeekModel: () => ipcRenderer.invoke('get-deepseek-model'),
    setDeepSeekModel: (model) => ipcRenderer.invoke('set-deepseek-model', model),

    // Test API (仅测试模式可用)
    testExec: (command, params) => ipcRenderer.invoke('test-exec', command, params),
    testQuery: (target) => ipcRenderer.invoke('test-query', target),

    // API Key 管理 API
    getApiKeys: async () => {
        const keys = await ipcRenderer.invoke('get-api-keys');
        return Object.fromEntries(
            Object.entries(keys).map(([provider, val]) => [provider, { configured: !!(val && val.hasKey) }])
        );
    },
    setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
    onApiKeyConfigured: (callback) => ipcRenderer.on('api-key-configured', (_e, d) => callback(d)),
    openApiKeyUrl: (provider) => ipcRenderer.invoke('open-api-key-url', provider),
    validateApiKey: (provider) => ipcRenderer.invoke('validate-api-key', provider),

    // 用户账号切换（按账号隔离数据目录）
    setActiveUser: (username) => ipcRenderer.invoke('set-active-user', username),

    // 保存 ReAct 日志文件（弹出原生保存对话框）
    saveReActFile: (data) => ipcRenderer.invoke('save-react-file', data),

    onPythonStatus: (callback) => {
        ipcRenderer.on('python-status', (_event, data) => callback(data));
    },

    onPythonBackendError: (callback) => {
        ipcRenderer.on('python-backend-error', (_event, data) => callback(data));
    },

    onDiskFullError: (callback) => {
        ipcRenderer.on('disk-full-error', (_event, data) => callback(data));
    }
});

console.log('[Preload] Electron API exposed');
