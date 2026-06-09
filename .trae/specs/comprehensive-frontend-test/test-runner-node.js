/**
 * Node.js 测试运行器：使用 jsdom 模拟浏览器环境，加载 mock 并跑全部 9 案件
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('========================================');
    console.log('  PlanMosaic 综合测试运行器');
    console.log('  时间:', new Date().toISOString());
    console.log('========================================');

    // 1. 创建 jsdom 环境
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'http://127.0.0.1:5199/',
        pretendToBeVisual: true,
        runScripts: 'dangerously'
    });
    const { window } = dom;

    // 模拟 console 输出
    window.console = console;

    // 注入 fetch polyfill（jsdom 默认没有）
    window.fetch = (...args) => fetch(...args);
    window.Response = Response;
    window.Request = Request;
    window.Headers = Headers;

    // 2. 加载 mock
    const mockPath = path.join(__dirname, 'full-electronapi-mock.js');
    const mockCode = fs.readFileSync(mockPath, 'utf-8');
    console.log('\n[1] 加载 mock...');
    try {
        window.eval(mockCode);
    } catch (e) {
        console.error('❌ Mock 加载失败:', e);
        process.exit(1);
    }
    console.log('✅ Mock 加载成功');
    console.log('  - window.isElectron =', window.isElectron);
    console.log('  - window.electronAPI methods:', Object.keys(window.electronAPI).length);
    console.log('  - __mosaicTest cases:', Object.keys(window.__mosaicTest).filter(k => k.startsWith('test')).length);

    // 3. 检查关键 API
    const criticalMethods = [
        'getIsElectron', 'getAgentHistory', 'getScheduleData', 'getStartupScan',
        'getApiKeys', 'setApiKey', 'agentChatStream', 'agentApprove',
        'onAgentStreamChunk', 'onAgentStreamDone', 'onAgentStreamError',
        'removeAllAgentListeners', 'saveReActFile', 'saveAgentHistory',
        'saveScheduleDataLocal', 'onApiKeyConfigured', 'removeListener'
    ];
    console.log('\n[2] 检查关键方法:');
    let missing = 0;
    criticalMethods.forEach(m => {
        const has = typeof window.electronAPI[m] === 'function';
        console.log('  ' + (has ? '✅' : '❌') + ' ' + m);
        if (!has) missing++;
    });
    if (missing > 0) {
        console.error(`\n❌ 缺 ${missing} 个关键方法`);
        process.exit(1);
    }

    // 4. 跑 mock 案件（不需要网络的）
    console.log('\n[3] 跑 mock 案件 (1-7, 8):');
    const offlineTests = [
        'test1_apiKey', 'test2_chat', 'test3_toolCall', 'test4_modelSwitch',
        'test5_history', 'test6_error', 'test7_data', 'test8_pythonStatus'
    ];
    const results = {};
    for (const t of offlineTests) {
        try {
            const r = await window.__mosaicTest[t]();
            results[t] = r ? '✅' : '❌';
        } catch (e) {
            results[t] = '❌ ' + e.message;
        }
    }
    Object.entries(results).forEach(([t, r]) => console.log('  ' + r + ' ' + t));

    // 5. 案件 9: 真实 Supabase 登录
    console.log('\n[4] 案件 9: 真实 Supabase 登录 (Andeo/Funkes):');
    try {
        const r9 = await window.__mosaicTest.test9_login('Andeo', 'Funkes');
        console.log('  结果:', r9 === true ? '✅ 登录成功' : r9 === null ? '⚠️ 跳过 (Supabase 不可达)' : '❌ 登录失败');
        results['test9_login'] = r9;
    } catch (e) {
        console.log('  异常:', e.message);
        results['test9_login'] = false;
    }

    // 6. 验证 ai-agent.js loadData 流程
    console.log('\n[5] 验证 loadData() 流程:');
    try {
        // 模拟 ai-agent.js:99-130 的流程
        const isElectron = window.electronAPI.getIsElectron();
        console.log('  getIsElectron():', isElectron);
        if (isElectron) {
            const hist = await window.electronAPI.getAgentHistory();
            console.log('  getAgentHistory: conversations =', hist.conversations?.length, ', archived =', hist.archivedConversations?.length);
            const scheduleData = await window.electronAPI.getScheduleData();
            console.log('  getScheduleData: dates =', Object.keys(scheduleData.schedules || {}));
            const scan = await window.electronAPI.getStartupScan();
            console.log('  getStartupScan: today =', scan.today, ', slots =', scan.todaySchedule?.timeSlots?.length || 0);
            console.log('  ✅ loadData() 流程通过');
        }
    } catch (e) {
        console.error('  ❌ loadData() 失败:', e.message);
    }

    // 7. 测试 P0-1 修复（onAgentStreamError 链路）
    console.log('\n[6] 验证 P0-1 修复 (onAgentStreamError):');
    let errorReceived = false;
    window.electronAPI.onAgentStreamError((err) => {
        errorReceived = true;
        console.log('  [errorHandler] 收到错误:', err?.error);
    });
    await window.electronAPI.triggerStreamError();
    await new Promise(r => setTimeout(r, 200));
    console.log('  P0-1 修复:', errorReceived ? '✅ onAgentStreamError 已注册并触发' : '❌ 未收到错误');

    // 8. 总结
    console.log('\n========================================');
    console.log('  测试总结');
    console.log('========================================');
    const pass = Object.values(results).filter(r => r === true || r === '✅').length;
    const fail = Object.values(results).filter(r => r === false || (typeof r === 'string' && r.startsWith('❌'))).length;
    const skip = Object.values(results).filter(r => r === null).length;
    console.log('  通过:', pass, '/ 失败:', fail, '/ 跳过:', skip);
    console.log('========================================');

    process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
