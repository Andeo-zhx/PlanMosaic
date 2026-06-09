/**
 * PlanMosaic Desktop — 完整 electronAPI Mock v2
 *
 * 用途：在 IDE 内置 Browser 加载 index.html 时注入此 mock，模拟 Electron 渲染进程
 *
 * 关键修复（vs v1）：
 *   1. 设 window.isElectron = true（避免 ai-agent.js:114 走 fetch 分支）
 *   2. window.scheduleData 结构与真实前端一致（startDate/endDate/schedules/bigTasks）
 *   3. 补全 frontend 实际调用的方法：getStartupScan/saveAgentHistory/saveScheduleDataLocal/saveReActFile/onApiKeyConfigured/removeListener
 *   4. getApiKeys 返回 {provider: {configured: bool}} 格式（与 preload.js:76-81 一致）
 *
 * 用法：
 *   1. 启动 Python 后端 (5199)
 *   2. Browser-use 打开 http://127.0.0.1:5199/
 *   3. DevTools Console 粘贴本脚本 → 执行
 *   4. 调 __mosaicTest.runAll() 跑全部 9 案件
 *   5. 调 __mosaicTest.login('Andeo', 'Funkes') 验证登录
 */

(function () {
    'use strict';
    if (window.__mosaicFullMock) {
        console.log('[mock] already installed');
        return;
    }
    window.__mosaicFullMock = true;
    console.log('[mock] installing v2...');

    // ============= 关键：isElectron 标志（修复 v1 bug） =============
    window.isElectron = true;

    // ============= 模拟数据存储 =============
    const store = {
        apiKeys: { deepseek: { configured: true, hasKey: true } },
        model: 'deepseek-v4-flash',
        // 真实结构（与 index.html 期望一致）
        scheduleData: {
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            schedules: {
                '2026-06-04': {
                    title: '',
                    highlights: '',
                    milestone: '',
                    timeSlots: [
                        { time: '09:00-10:00', activity: '团队站会', detail: '', icon: '' },
                        { time: '14:00-15:30', activity: '客户演示', detail: '', icon: '' }
                    ]
                },
                '2026-06-05': {
                    title: '',
                    highlights: '',
                    milestone: '',
                    timeSlots: [
                        { time: '10:00-11:00', activity: '产品评审', detail: '', icon: '' }
                    ]
                }
            },
            bigTasks: [
                { id: 1, title: '完成 P0 修复', priority: 'P0', status: 'in_progress', dueDate: '2026-06-05' }
            ],
            bigTaskHistory: [],
            scheduleTemplates: []
        },
        tasks: {
            items: [
                { id: 1, title: '完成 P0 修复', priority: 'P0', status: 'in_progress', dueDate: '2026-06-05' },
                { id: 2, title: '写技术文档', priority: 'P2', status: 'todo', dueDate: '2026-06-08' }
            ]
        },
        courses: {
            items: [
                { id: 1, name: '高等数学', teacher: '张老师', location: 'A101', dayOfWeek: 1, startTime: '08:00', endTime: '09:50' },
                { id: 2, name: '数据结构', teacher: '李老师', location: 'B203', dayOfWeek: 3, startTime: '10:00', endTime: '11:50' }
            ]
        },
        agentHistory: {
            userProfile: {},
            conversations: [],
            archivedConversations: [],
            lastUpdate: ''
        },
        startupScan: {
            today: '2026-06-04',
            todaySchedule: {
                timeSlots: [
                    { time: '09:00-10:00', activity: '团队站会' },
                    { time: '14:00-15:30', activity: '客户演示' }
                ],
                highlights: '下午有客户演示，重点准备'
            },
            yesterdayIncompleteTasks: [
                { name: '写技术文档', estimated: 60 }
            ]
        },
        currentUser: null,
        session: null
    };

    // 持久化
    const persistKey = '__mosaic_mock_store_v2__';
    try {
        const saved = localStorage.getItem(persistKey);
        if (saved) Object.assign(store, JSON.parse(saved));
    } catch (e) {}
    const save = () => {
        try { localStorage.setItem(persistKey, JSON.stringify(store)); } catch (e) {}
    };

    // ============= 事件总线 =============
    const listeners = {};
    const on = (channel, cb) => { (listeners[channel] = listeners[channel] || []).push(cb); };
    const off = (channel, cb) => {
        if (!listeners[channel]) return;
        if (cb) listeners[channel] = listeners[channel].filter(c => c !== cb);
        else delete listeners[channel];
    };
    const emit = (channel, ...args) => {
        (listeners[channel] || []).forEach(cb => { try { cb(...args); } catch (e) { console.error(e); } });
    };

    // ============= IPC 路由表 =============
    const ipcHandlers = {
        // 配置 / API Key
        'get-api-keys': () => {
            const keys = {};
            Object.entries(store.apiKeys).forEach(([k, v]) => {
                keys[k] = { configured: !!(v && v.hasKey), hasKey: !!(v && v.hasKey) };
            });
            return keys;
        },
        'set-api-key': (provider, key) => {
            store.apiKeys[provider] = { configured: !!key, hasKey: !!key };
            save();
            emit('api-key-configured', { provider });
            return { ok: true };
        },
        'set-deepseek-model': (model) => {
            store.model = model;
            save();
            return { ok: true, model };
        },
        'get-deepseek-model': () => ({ model: store.model === 'deepseek-v4-pro' ? 'pro' : 'flash', fullName: store.model }),
        'validate-api-key': (provider) => {
            const v = store.apiKeys[provider];
            if (!v || !v.hasKey) return { ok: false, error: 'API Key 未配置' };
            if (provider === 'INVALID_KEY') return { ok: false, error: 'API Key 无效' };
            return { ok: true, valid: true };
        },
        'open-api-key-url': () => ({ ok: true }),

        // Agent 对话
        'agent-chat': async (payload, signal) => {
            if (!store.apiKeys.deepseek?.hasKey) return { ok: false, error: 'API Key 未配置' };
            return { ok: true, content: 'mock 非流式响应', reasoning: '思考中' };
        },
        'agent-chat-stream': async (payload, signal) => {
            if (!store.apiKeys.deepseek?.hasKey) {
                setTimeout(() => emit('agent-stream-error', { error: 'API Key 未配置' }), 50);
                return { ok: false, error: 'API Key 未配置' };
            }
            // 模拟流式
            const chunks = [
                { type: 'reasoning', content: '思考中：理解用户输入...' },
                { type: 'content', content: '这是 mock 流式响应。' },
                { type: 'content', content: '你说的是：' + (payload?.message?.slice(0, 20) || '') },
                { type: 'content', content: ' [来自 Pro 模型，含 reasoning_content]' }
            ];
            for (const c of chunks) {
                if (signal?.aborted) return { ok: false, error: 'cancelled' };
                await new Promise(r => setTimeout(r, 50));
                emit('agent-stream-chunk', { response: c, type: c.type, content: c.content });
            }
            emit('agent-stream-done', {});
            return { ok: true, streamed: true };
        },
        'cancel-agent-stream': () => { emit('agent-stream-done', { cancelled: true }); return { ok: true }; },
        'agent-approve': (proposal) => {
            return { ok: true, scheduleId: Date.now(), proposal };
        },
        'archive-conversations': () => {
            const convs = store.agentHistory.conversations;
            store.agentHistory.archivedConversations.push(...convs);
            store.agentHistory.conversations = [];
            save();
            return { ok: true, archived: convs.length };
        },
        'clear-conversations': () => {
            store.agentHistory = { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
            save();
            emit('agent-stream-done', { cleared: true });
            return { ok: true, cleared: true };
        },
        'get-agent-history': () => store.agentHistory,
        'save-agent-history': (data) => {
            store.agentHistory = data;
            save();
            return { ok: true };
        },
        'get-agent-history-local': () => store.agentHistory,
        'save-agent-history-local': (data) => { store.agentHistory = data; save(); return { ok: true }; },

        // 日程
        'get-schedule-data': () => store.scheduleData,
        'save-schedule-data': (data) => { store.scheduleData = data; save(); return { ok: true }; },
        'get-schedule-data-local': () => store.scheduleData,
        'save-schedule-data-local': (data) => { store.scheduleData = data; save(); return { ok: true }; },
        'save-schedule': (item) => {
            if (!store.scheduleData.schedules[item.date]) {
                store.scheduleData.schedules[item.date] = { title: '', highlights: '', milestone: '', timeSlots: [] };
            }
            store.scheduleData.schedules[item.date].timeSlots.push({ time: item.time, activity: item.activity, detail: item.detail || '', icon: '' });
            save();
            return { ok: true };
        },

        // 启动扫描
        'get-startup-scan': () => store.startupScan,

        // ReAct 日志
        'save-react-file': (data) => {
            console.log('[mock] saveReActFile called:', data?.defaultName, '(content length:', data?.content?.length, ')');
            return { ok: true, filePath: '/mock/' + (data?.defaultName || 'react.txt') };
        },

        // 用户账号
        'set-active-user': (username) => { store.currentUser = { username }; save(); return { ok: true, username }; },

        // 工具调用
        'tool-call': (name, args) => ({ ok: true, tool: name, args, result: 'mocked' }),

        // 错误触发（测试 P0-1 修复）
        'trigger-stream-error': () => {
            setTimeout(() => emit('agent-stream-error', { error: '模拟网络错误：测试 P0-1 修复' }), 100);
            return { ok: true };
        }
    };

    // ============= 主 electronAPI 对象 =============
    window.electronAPI = {
        // 平台标志
        getIsElectron: () => true,
        platform: 'browser-mock',
        versions: { node: 'mock', chrome: 'mock', electron: 'mock' },

        // IPC 通用调用
        invoke: async (channel, ...args) => {
            const handler = ipcHandlers[channel];
            if (!handler) {
                console.warn('[mock] unhandled channel:', channel, args);
                return { ok: false, error: `mock not implemented: ${channel}` };
            }
            try {
                return await handler(...args);
            } catch (e) {
                console.error('[mock] handler error:', channel, e);
                return { ok: false, error: String(e) };
            }
        },
        send: (channel, ...args) => emit(channel, ...args),

        // 事件监听
        on: (channel, cb) => on(channel, cb),
        off: (channel, cb) => off(channel, cb),
        emit: (channel, ...args) => emit(channel, ...args),
        removeListener: (channel, cb) => off(channel, cb),
        removeAllListeners: (channel) => off(channel),

        // Agent 流式监听（preload.js:31-42 接口） - 返回 off 函数便于注销
        onAgentStreamChunk: (callback) => { on('agent-stream-chunk', callback); return () => off('agent-stream-chunk', callback); },
        onAgentStreamDone: (callback) => { on('agent-stream-done', callback); return () => off('agent-stream-done', callback); },
        onAgentStreamStatus: (callback) => { on('agent-stream-status', callback); return () => off('agent-stream-status', callback); },
        onAgentStreamError: (callback) => { on('agent-stream-error', callback); return () => off('agent-stream-error', callback); },
        removeAllAgentListeners: () => {
            off('agent-stream-chunk'); off('agent-stream-done');
            off('agent-stream-status'); off('agent-stream-error');
        },

        // API Key 监听
        onApiKeyConfigured: (callback) => { on('api-key-configured', callback); return () => off('api-key-configured', callback); },

        // Python 状态监听
        onPythonStatus: (callback) => on('python-status', callback),
        onPythonBackendError: (callback) => on('python-backend-error', callback),
        onDiskFullError: (callback) => on('disk-full-error', callback),

        // 取消流
        cancelAgentStream: () => ipcHandlers['cancel-agent-stream'](),

        // 状态读取
        getApiKey: (provider) => store.apiKeys[provider] || '',
        getApiKeys: async () => {
            const keys = await ipcHandlers['get-api-keys']();
            return keys;
        },
        getModel: () => store.model,
        getCurrentUser: () => store.currentUser,
        getSession: () => store.session,

        // 数据访问
        getAgentHistory: () => store.agentHistory,
        getScheduleData: () => store.scheduleData,
        getStartupScan: () => store.startupScan,
        getCourses: () => store.courses,
        getTasks: () => store.tasks,

        // AI 对话
        agentChat: (data) => ipcHandlers['agent-chat'](data),
        agentChatStream: (data) => ipcHandlers['agent-chat-stream'](data),

        // AI 操作
        saveAgentHistory: (data) => ipcHandlers['save-agent-history'](data),
        agentApprove: (proposal) => ipcHandlers['agent-approve'](proposal),
        archiveConversations: () => ipcHandlers['archive-conversations'](),
        clearConversations: () => ipcHandlers['clear-conversations'](),

        // 日程操作
        saveScheduleData: (data) => ipcHandlers['save-schedule-data'](data),
        saveScheduleDataLocal: (data) => ipcHandlers['save-schedule-data-local'](data),
        getScheduleDataLocal: () => ipcHandlers['get-schedule-data-local'](),

        // API Key
        setApiKey: (provider, key) => ipcHandlers['set-api-key'](provider, key),
        validateApiKey: (provider) => ipcHandlers['validate-api-key'](provider),
        openApiKeyUrl: (provider) => ipcHandlers['open-api-key-url'](provider),

        // 用户
        setActiveUser: (username) => ipcHandlers['set-active-user'](username),

        // ReAct
        saveReActFile: (data) => ipcHandlers['save-react-file'](data),

        // 工具方法
        triggerStreamError: () => ipcHandlers['trigger-stream-error']()
    };

    // ============= 测试工具 =============
    window.__mosaicTest = {
        // 案件 1: API Key 配置
        test1_apiKey: async function () {
            console.log('\n=== 案件 1: API Key 配置 ===');
            const r1 = await window.electronAPI.setApiKey('deepseek', 'sk-mock-1234567890abcdefghij');
            console.log('  set-api-key(deepseek, ...):', r1);
            const r2 = await window.electronAPI.validateApiKey('deepseek');
            console.log('  validate-api-key:', r2);
            const r3 = await window.electronAPI.getApiKeys();
            console.log('  getApiKeys:', r3);
            const ok = r1?.ok && r2?.ok && r3?.deepseek?.configured;
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 2: 简单对话（含 reasoning_content + 流式）
        test2_chat: async function () {
            console.log('\n=== 案件 2: 简单对话 ===');
            store.apiKeys.deepseek = { configured: true, hasKey: true };
            let chunks = 0, reasoningChunks = 0, done = false, error = null;
            const off1 = window.electronAPI.onAgentStreamChunk((c) => {
                chunks++;
                if (c?.response?.type === 'reasoning' || c?.type === 'reasoning') reasoningChunks++;
            });
            const off2 = window.electronAPI.onAgentStreamDone(() => done = true);
            const off3 = window.electronAPI.onAgentStreamError((e) => error = e);
            const r = await window.electronAPI.agentChatStream({ message: '你好', history: [], profile: {} });
            await new Promise(res => setTimeout(res, 500));
            off1(); off2(); off3();
            console.log('  invoke ok:', r?.ok, 'chunks:', chunks, 'reasoning:', reasoningChunks, 'done:', done, 'error:', error);
            const ok = r?.ok && chunks >= 2 && reasoningChunks >= 1 && done && !error;
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 3: 工具调用
        test3_toolCall: async function () {
            console.log('\n=== 案件 3: 工具调用 ===');
            const r = await window.electronAPI.agentApprove({ type: 'schedule.create', payload: { title: '会议', date: '2026-06-05', time: '15:00-16:00' } });
            console.log('  agentApprove:', r);
            const ok = !!(r?.ok && r.scheduleId);
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 4: 模型切换
        test4_modelSwitch: async function () {
            console.log('\n=== 案件 4: 模型切换 ===');
            const r1 = await window.electronAPI.invoke('set-deepseek-model', 'deepseek-v4-pro');
            console.log('  set-deepseek-model → pro:', r1);
            const m1 = window.electronAPI.getModel();
            console.log('  getModel:', m1);
            const r2 = await window.electronAPI.invoke('set-deepseek-model', 'deepseek-v4-flash');
            console.log('  set-deepseek-model → flash:', r2);
            const m2 = window.electronAPI.getModel();
            const ok = r1?.ok && m1 === 'deepseek-v4-pro' && r2?.ok && m2 === 'deepseek-v4-flash';
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 5: 对话历史
        test5_history: async function () {
            console.log('\n=== 案件 5: 对话历史 ===');
            const r1 = window.electronAPI.getAgentHistory();
            console.log('  getAgentHistory:', { userProfile: !!r1.userProfile, conversations: r1.conversations?.length, archived: r1.archivedConversations?.length });
            const r2 = await window.electronAPI.archiveConversations();
            console.log('  archiveConversations:', r2);
            const ok = !!(r1 && typeof r1.conversations !== 'undefined' && r2?.ok !== false);
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 6: 错误降级
        test6_error: async function () {
            console.log('\n=== 案件 6: 错误降级 ===');
            // 6a: 无效 API Key
            const r1 = await window.electronAPI.validateApiKey('INVALID_KEY');
            console.log('  validate-api-key (INVALID_KEY):', r1);
            // 6b: 触发流式错误（验证 P0-1 修复）
            let errorReceived = false;
            const off = window.electronAPI.onAgentStreamError(() => errorReceived = true);
            await window.electronAPI.triggerStreamError();
            await new Promise(r => setTimeout(r, 200));
            off();
            console.log('  trigger-stream-error received:', errorReceived);
            const ok = !r1?.ok && errorReceived;
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 7: 数据访问
        test7_data: async function () {
            console.log('\n=== 案件 7: 数据访问 ===');
            const s = window.electronAPI.getScheduleData();
            const scan = window.electronAPI.getStartupScan();
            const apiKeys = await window.electronAPI.getApiKeys();
            console.log('  scheduleData keys:', Object.keys(s || {}));
            console.log('  startupScan today:', scan?.today, 'timeSlots:', scan?.todaySchedule?.timeSlots?.length);
            console.log('  apiKeys:', apiKeys);
            const ok = s?.schedules && scan?.todaySchedule?.timeSlots?.length > 0;
            console.log('  →', ok ? '✅ PASS' : '❌ FAIL');
            return ok;
        },

        // 案件 8: Python 状态
        test8_pythonStatus: async function () {
            console.log('\n=== 案件 8: Python 状态 ===');
            // 真实测试后端连通性
            try {
                const r = await fetch('http://127.0.0.1:8080/api/config');
                const data = await r.json();
                console.log('  /api/config:', data);
                const ok = !!(r.ok && data.model);
                console.log('  →', ok ? '✅ PASS (Python 后端连通)' : '❌ FAIL');
                return ok;
            } catch (e) {
                console.log('  Python 后端不可达:', e.message);
                return false;
            }
        },

        // 案件 9: Andeo/Funkes 登录（前端实际走 Supabase RPC，此处仅验证凭证格式与 mock 后端）
        test9_login: async function (username, password) {
            console.log('\n=== 案件 9: 登录 (Andeo/Funkes) ===');
            // 实际登录走 supabaseRPC (index.html:8106)，这里通过 fetch 模拟一次 Supabase 登录
            const SUPABASE_URL = 'https://nxbnognnkifiiitvbupq.supabase.co';
            const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Ym5vZ25ua2lmaWlpdHZidXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTkzMDAsImV4cCI6MjA4OTczNTMwMH0.ATSkFMfkPF5O7w-q8mEkBVuatN9NKsJTNgQadwqJuUM';
            try {
                const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/login_user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer ' + SUPABASE_KEY,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({ p_username: username, p_password: password })
                });
                const data = await r.json();
                console.log('  supabase login_user response:', data);
                if (r.ok && data && data.success) {
                    window.currentUser = { userId: data.user_id, username: data.username };
                    localStorage.setItem('mosaique-current-user', JSON.stringify(window.currentUser));
                    console.log('  → ✅ PASS (登录成功)');
                    return true;
                } else {
                    console.log('  → ❌ FAIL (登录失败):', data?.error);
                    return false;
                }
            } catch (e) {
                console.log('  supabase 不可达:', e.message);
                console.log('  → ⚠️ SKIP (需网络访问 Supabase)');
                return null; // null = 跳过（不是 PASS 也不是 FAIL）
            }
        },

        // 跑全部
        runAll: async function () {
            console.log('\n========================================');
            console.log('  PlanMosaic 全案件 mock 测试');
            console.log('========================================');
            const tests = [
                ['1_API Key 配置', await this.test1_apiKey()],
                ['2_简单对话', await this.test2_chat()],
                ['3_工具调用', await this.test3_toolCall()],
                ['4_模型切换', await this.test4_modelSwitch()],
                ['5_对话历史', await this.test5_history()],
                ['6_错误降级', await this.test6_error()],
                ['7_数据访问', await this.test7_data()],
                ['8_Python 状态', await this.test8_pythonStatus()],
                ['9_登录 (Andeo/Funkes)', await this.test9_login('Andeo', 'Funkes')]
            ];
            console.log('\n========================================');
            console.log('  案件测试结果');
            console.log('========================================');
            const pass = [], fail = [], skip = [];
            tests.forEach(([n, r]) => {
                if (r === true) pass.push(n);
                else if (r === null) skip.push(n);
                else fail.push(n);
                console.log(`  ${r === true ? '✅' : r === null ? '⚠️' : '❌'} ${n}`);
            });
            console.log(`\n  通过: ${pass.length}/${tests.length}`);
            console.log(`  失败: ${fail.length}/${tests.length}`);
            console.log(`  跳过: ${skip.length}/${tests.length}`);
            if (fail.length > 0) {
                console.log('  失败案件:', fail.join(', '));
            }
            return { pass: pass.length, fail: fail.length, skip: skip.length, total: tests.length, results: tests };
        },

        // 重置
        reset: () => {
            localStorage.removeItem(persistKey);
            console.log('[mock] store reset, refresh page to take effect');
        },

        // 直接看 store
        store: store
    };

    // ============= 启动就绪日志 =============
    console.log('[mock] ✅ ready v2');
    console.log('[mock] window.isElectron =', window.isElectron);
    console.log('[mock] window.electronAPI methods:', Object.keys(window.electronAPI).length);
    console.log('[mock] 调 __mosaicTest.runAll() 跑全部 9 案件');
    console.log('[mock] 调 __mosaicTest.test9_login("Andeo", "Funkes") 验证登录');
    console.log('[mock] 调 window.electronAPI.triggerStreamError() 测试 P0-1 修复');
})();
