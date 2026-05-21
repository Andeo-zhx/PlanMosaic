const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_REMOVE_CHANNELS = [
    'agent-chat-stream-chunk',
    'agent-chat-stream-status',
    'agent-chat-stream-done'
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

    // 批准日程修改
    agentApprove: (proposal) => ipcRenderer.invoke('agent-approve', proposal),

    // 归档对话
    archiveConversations: () => ipcRenderer.invoke('archive-conversations'),

    // 清空对话
    clearConversations: () => ipcRenderer.invoke('clear-conversations'),

    // 保存日程数据
    saveScheduleData: (data) => ipcRenderer.invoke('save-schedule-data', data),

    // Agent Provider API
    getAgentProvider: () => ipcRenderer.invoke('get-agent-provider'),
    setAgentProvider: (provider) => ipcRenderer.invoke('set-agent-provider', provider),

    // API Key 管理 API
    getApiKeys: async () => {
        const keys = await ipcRenderer.invoke('get-api-keys');
        return Object.fromEntries(
            Object.entries(keys).map(([provider, key]) => [provider, { configured: !!key }])
        );
    },
    setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
    openApiKeyUrl: (provider) => ipcRenderer.invoke('open-api-key-url', provider),
    validateApiKey: (provider) => ipcRenderer.invoke('validate-api-key', provider),

    // 用户账号切换（按账号隔离数据目录）
    setActiveUser: (username) => ipcRenderer.invoke('set-active-user', username),

    // 获取 WordMosaic 路径（打包后与开发环境不同）
    getWordMosaicPath: () => ipcRenderer.invoke('get-wordmosaic-path')
});

console.log('[Preload] Electron API exposed');
