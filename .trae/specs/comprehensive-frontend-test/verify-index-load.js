/**
 * 模拟完整 Browser-use 加载流程：注入 mock 后执行前端 ai-agent.js 关键路径
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('========================================');
    console.log('  验证 index.html 加载 (模拟 Browser-use)');
    console.log('========================================');

    // 1. 加载 index.html 的部分内容（提取关键 script 块）
    const indexPath = 'd:/Trae CN/Projects/PlanMosaic/PlanMosaic Desktop/index.html';
    const indexCode = fs.readFileSync(indexPath, 'utf-8');
    console.log('  index.html 长度:', indexCode.length, 'bytes');

    // 2. 创建 jsdom
    const dom = new JSDOM(indexCode, {
        url: 'http://127.0.0.1:5199/',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
        resources: 'usable',
        beforeParse(window) {
            // 注入 fetch
            window.fetch = (...args) => fetch(...args);
            window.Response = Response;
            window.Request = Request;
            window.Headers = Headers;
        }
    });
    const { window } = dom;
    window.console = console;

    // 3. 注入 mock
    const mockPath = path.join(__dirname, 'full-electronapi-mock.js');
    const mockCode = fs.readFileSync(mockPath, 'utf-8');
    console.log('\n[1] 注入 mock...');
    try {
        window.eval(mockCode);
    } catch (e) {
        console.error('❌ Mock 注入失败:', e.message);
        process.exit(1);
    }
    console.log('  ✅ mock 注入成功');

    // 4. 等待 ai-agent.js 初始化（监听 Load error）
    console.log('\n[2] 监听 [AI Agent] Load error...');
    let loadError = null;
    const origConsoleError = window.console.error;
    window.console.error = function(...args) {
        const msg = args.join(' ');
        if (msg.includes('[AI Agent] Load error')) {
            loadError = msg;
        }
        origConsoleError.apply(console, args);
    };

    // 5. 触发 DOMContentLoaded
    await new Promise(resolve => {
        if (window.document.readyState === 'loading') {
            window.document.addEventListener('DOMContentLoaded', () => resolve());
        } else {
            resolve();
        }
    });

    // 6. 等待 AI Agent 初始化
    await new Promise(r => setTimeout(r, 2000));

    // 7. 检查结果
    console.log('\n[3] 结果:');
    if (loadError) {
        console.error('  ❌ [AI Agent] Load error 触发:', loadError);
        process.exit(1);
    } else {
        console.log('  ✅ 无 [AI Agent] Load error');
    }

    // 8. 检查 isElectron 状态
    const isElectron = window.isElectron;
    const hasAPI = !!window.electronAPI;
    console.log('  isElectron:', isElectron);
    console.log('  has electronAPI:', hasAPI);

    // 9. 检查关键 DOM 元素
    const checks = [
        { id: 'agentModal', desc: 'AI 弹窗' },
        { id: 'agentChatContainer', desc: 'AI 聊天容器' },
        { id: 'agentInput', desc: 'AI 输入框' },
        { id: 'agentMainChatContainer', desc: '主聊天容器' }
    ];
    console.log('\n[4] 关键 DOM 元素:');
    for (const c of checks) {
        const el = window.document.getElementById(c.id);
        console.log('  ' + (el ? '✅' : '⚠️') + ' ' + c.id + ' (' + c.desc + ')');
    }

    // 10. 检查 ai-agent.js 暴露的全局函数
    const fns = ['openAgentModal', 'closeAgentModal', 'addMessage', 'performStartupScan', 'loadData'];
    console.log('\n[5] ai-agent.js 全局函数:');
    fns.forEach(fn => {
        console.log('  ' + (typeof window[fn] === 'function' ? '✅' : '⚠️') + ' ' + fn);
    });

    console.log('\n========================================');
    console.log('  验证完成');
    console.log('========================================');
}

main().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
