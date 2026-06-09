/**
 * electronAPI Mock for Browser-use Visual Testing
 *
 * 用法：在 IDE 内置 Browser 打开 http://127.0.0.1:8765/index.html 后，
 *       打开 DevTools Console，粘贴本文件全部内容执行。
 *       即可让静态加载的 index.html 表现"接近"真实 Electron 渲染。
 *
 * 范围：覆盖 15 条修复涉及的所有 IPC + 事件监听
 * 不覆盖：Python 后端实际逻辑（仅前端视觉验证）
 */

(function() {
    'use strict';
    if (window.__electronAPIMocked) return;
    window.__electronAPIMocked = true;

    // ============= Storage Mock =============
    const config = JSON.parse(localStorage.getItem('__mosaic_config') || '{}');
    const saveConfig = (patch) => {
        Object.assign(config, patch);
        localStorage.setItem('__mosaic_config', JSON.stringify(config));
        console.log('[mock] config saved', config);
    };

    // ============= IPC Invoke Mock =============
    const mockInvoke = async (channel, ...args) => {
        console.log('[mock ipc]', channel, ...args);
        switch (channel) {
            case 'get-config':
                return { ok: true, config };
            case 'set-api-key':
                saveConfig({ apiKey: args[0] });
                return { ok: true };
            case 'set-deepseek-model':
                saveConfig({ model: args[0] });
                return { ok: true };
            case 'agent-chat':
                // 模拟流式响应
                return mockStreamAgentChat(args[0], args[1]);
            case 'agent-approve':
                return { ok: true, scheduleId: Date.now() };
            case 'archive-conversations':
                return { ok: true, archived: args[0]?.length || 0 };
            case 'clear-conversations':
                return { ok: true, cleared: true };
            case 'cancel-agent-stream':
                return { ok: true };
            case 'validate-api-key':
                return { ok: true, valid: args[0]?.length >= 20 };
            case 'save-schedule':
                return { ok: true, id: Date.now() };
            case 'fetch-history':
                return { ok: true, conversations: [] };
            case 'get-schedule':
                return { ok: true, items: [] };
            case 'get-courses':
                return { ok: true, items: [] };
            case 'get-tasks':
                return { ok: true, items: [] };
            case 'python-status':
                return { ok: true, status: 'running' };
            default:
                console.warn('[mock] unhandled channel:', channel);
                return { ok: false, error: 'mock not implemented' };
        }
    };

    // ============= Stream Mock =============
    async function mockStreamAgentChat(payload, signal) {
        // 模拟 5 段流式响应
        const chunks = [
            { type: 'content', content: '你好' },
            { type: 'content', content: '，' },
            { type: 'content', content: '我是' },
            { type: 'content', content: 'Mosa' },
            { type: 'reasoning', content: '思考中...' },
            { type: 'content', content: '。' },
            { type: 'done' }
        ];
        for (const c of chunks) {
            await new Promise(r => setTimeout(r, 80));
            if (signal?.aborted) return;
            window.__mockEmit?.(c.type === 'done' ? 'agent-stream-done' : 'agent-stream-chunk', c);
        }
    }

    // ============= 注入到 window.electronAPI =============
    const eventListeners = {};
    const eventRegistry = {};

    window.electronAPI = {
        // IPC invoke
        invoke: mockInvoke,

        // 一次性事件监听
        onAgentStreamChunk: (cb) => {
            eventRegistry['agent-stream-chunk'] = cb;
        },
        onAgentStreamDone: (cb) => {
            eventRegistry['agent-stream-done'] = cb;
        },
        onAgentStreamStatus: (cb) => {
            eventRegistry['agent-stream-status'] = cb;
        },
        onAgentStreamError: (cb) => {
            // ⭐ 验证 P0-1：必须存在
            eventRegistry['agent-stream-error'] = cb;
            console.log('[mock] onAgentStreamError registered');
        },
        onPythonStatus: (cb) => {
            eventRegistry['python-status'] = cb;
        },

        // 移除监听
        removeAllAgentListeners: () => {
            delete eventRegistry['agent-stream-chunk'];
            delete eventRegistry['agent-stream-done'];
            delete eventRegistry['agent-stream-status'];
            delete eventRegistry['agent-stream-error'];
        },

        // 通用监听（兼容 on / off / emit）
        on: (channel, cb) => {
            (eventListeners[channel] = eventListeners[channel] || []).push(cb);
        },
        off: (channel, cb) => {
            if (eventListeners[channel]) {
                eventListeners[channel] = eventListeners[channel].filter(c => c !== cb);
            }
        },
        emit: (channel, ...args) => {
            (eventListeners[channel] || []).forEach(cb => cb(...args));
        },

        // 静态方法
        getApiKey: () => config.apiKey || '',
        getModel: () => config.model || 'deepseek-v4-flash',
        platform: 'browser-mock'
    };

    // 暴露 emit helper
    window.__mockEmit = (channel, payload) => {
        if (eventRegistry[channel]) {
            eventRegistry[channel]({ response: payload });
        }
    };

    // ⭐ 验证 P0-1：主动 emit 错误事件
    window.__mockTriggerError = () => {
        window.__mockEmit('agent-stream-error', { error: '模拟超时' });
    };

    // ⭐ 验证 P0-2：testExec/testQuery 应不存在
    console.log('[mock] electronAPI ready. Verify:');
    console.log('  - electronAPI.onAgentStreamError:', typeof window.electronAPI.onAgentStreamError);
    console.log('  - electronAPI.testExec:', typeof window.electronAPI.testExec, '(应为 undefined)');
    console.log('  - 调用 __mockTriggerError() 模拟超时');

    // 自动派发一个 ready 事件
    setTimeout(() => {
        if (eventRegistry['python-status']) {
            eventRegistry['python-status']({ status: 'running', port: 8765 });
        }
    }, 100);
})();
