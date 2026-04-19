const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的IPC接口
contextBridge.exposeInMainWorld('electronAPI', {
    // 获取日程数据
    getScheduleData: () => ipcRenderer.invoke('get-schedule-data'),

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
        ipcRenderer.on('agent-stream-chunk', (event, chunk) => callback(event, chunk));
    },
    onAgentStreamDone: (callback) => {
        ipcRenderer.on('agent-stream-done', () => callback());
    },
    onAgentStreamStatus: (callback) => {
        ipcRenderer.on('agent-stream-status', (event, status) => callback(event, status));
    },
    removeListener: (channel, callback) => {
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
    getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
    setApiKey: (provider, key) => ipcRenderer.invoke('set-api-key', provider, key),
    openApiKeyUrl: (provider) => ipcRenderer.invoke('open-api-key-url', provider),
    validateApiKey: (provider) => ipcRenderer.invoke('validate-api-key', provider),

    // 用户账号切换（按账号隔离数据目录）
    setActiveUser: (username) => ipcRenderer.invoke('set-active-user', username),

    // 获取 WordMosaic 路径（打包后与开发环境不同）
    getWordMosaicPath: () => ipcRenderer.invoke('get-wordmosaic-path')
});

console.log('[Preload] Electron API exposed');
