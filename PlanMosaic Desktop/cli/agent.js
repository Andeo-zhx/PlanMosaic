const http = require('http');
const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

const PYTHON_BACKEND_URL = 'http://127.0.0.1:8080';

function pythonApi(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, PYTHON_BACKEND_URL);
        const bodyStr = body ? JSON.stringify(body) : undefined;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        };
        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    resolve({ error: `HTTP ${res.statusCode}: ${data}` });
                }
            });
        });
        req.on('error', (err) => resolve({ error: err.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ error: '请求超时（10秒无响应）' });
        });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function checkBackendHealth() {
    return new Promise((resolve) => {
        http.get(`${PYTHON_BACKEND_URL}/health`, (resp) => {
            resolve(true);
        }).on('error', () => resolve(false));
    });
}

async function chatWithAgent(message) {
    const healthy = await checkBackendHealth();
    if (!healthy) {
        h.error('Python 后端未运行，请先启动后端服务');
        h.info('运行 node cli.js server start 启动后端');
        return;
    }

    h.info('正在与 AI 助手通信...\n');

    try {
        const result = await pythonApi('POST', '/api/agent-chat', {
            messages: [{ role: 'user', content: message }]
        });

        if (result.error) {
            h.error('AI 请求失败: ' + result.error);
            return;
        }

        console.log(h.bold('AI 助手回复:'));
        console.log(h.dim(h.separator('─', 60)));

        const content = result.response?.content || result.content || JSON.stringify(result);
        console.log(content);
        console.log(h.dim(h.separator('─', 60)));

        if (result.shouldRefresh) {
            h.info('日程数据已更新');
            notifyUI('data.refreshAll');
        }
        notifyUI('agent.open');
    } catch (e) {
        h.error('与 AI 助手通信失败: ' + e.message);
    }
}

function viewHistory(username) {
    const log = h.loadAgentLog(username);
    const conversations = log.conversations || [];
    const archived = log.archivedConversations || [];

    console.log('');
    console.log(h.bold('对话历史'));

    if (log.userProfile && Object.keys(log.userProfile).length > 0) {
        console.log(h.dim(h.separator('─', 50)));
        console.log(h.bold('用户画像:'));
        console.log(JSON.stringify(log.userProfile, null, 2));
    }

    console.log(h.dim(h.separator('─', 50)));
    console.log(h.bold(`活跃对话: ${conversations.length} 条`));
    console.log(h.bold(`归档对话: ${archived.length} 条`));

    if (conversations.length > 0) {
        console.log('');
        console.log(h.dim('最近 5 条对话:'));
        const recent = conversations.slice(-5);
        recent.forEach((conv, i) => {
            const time = conv.timestamp || '';
            const preview = (conv.content || '').substring(0, 60);
            console.log(`  ${h.cyan(String(i + 1) + '.')} ${h.dim(time)} ${preview}`);
        });
    }

    if (conversations.length === 0 && archived.length === 0) {
        console.log(h.dim('\n暂无对话记录'));
    }
    notifyUI('agent.open');
}

function viewProfile(username) {
    const log = h.loadAgentLog(username);
    const profile = log.userProfile || {};

    console.log('');
    console.log(h.bold('用户画像'));

    if (Object.keys(profile).length === 0) {
        console.log(h.dim('\n暂无用户画像数据。'));
        console.log(h.dim('与 AI 助手进行更多对话后将自动生成画像。'));
        return;
    }

    console.log(h.dim(h.separator('─', 50)));
    for (const [key, value] of Object.entries(profile)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        console.log(h.cyan(`  ${key}: `) + displayValue);
    }
}

function clearHistory(username) {
    const fs = require('fs');
    const log = h.loadAgentLog(username);
    log.conversations = [];
    log.lastUpdate = new Date().toISOString();

    const logFile = require('../paths.js').getAgentLogPath(username);
    try {
        fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
        h.success('对话历史已清空');
        notifyUI('toast.success', { message: 'CLI: 对话历史已清空' });
    } catch (e) {
        h.error('清空对话历史失败: ' + e.message);
    }
}

function run(args) {
    let subCmd = args[0];
    let message = args.slice(1).join(' ');

    if (subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printAgentHelp();
        return;
    }

    if (subCmd === 'chat' || subCmd === 'ask') {
        if (!message) {
            h.error('请提供要发送的消息');
            h.info('用法: node cli.js agent chat <消息内容>');
            return;
        }
        chatWithAgent(message);
    } else if (subCmd === 'history') {
        viewHistory(args[1]);
    } else if (subCmd === 'profile') {
        viewProfile(args[1]);
    } else if (subCmd === 'clear') {
        clearHistory(args[1]);
    } else {
        if (subCmd && !subCmd.startsWith('-')) {
            message = args.join(' ');
            chatWithAgent(message);
        } else {
            printAgentHelp();
        }
    }
}

function printAgentHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - AI 助手'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js agent <子命令> [参数]');
    console.log('  node cli.js agent <消息>        直接向AI发送消息');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  chat <消息>   ') + '与AI助手对话');
    console.log(h.cyan('  history       ') + '查看对话历史');
    console.log(h.cyan('  profile       ') + '查看用户画像');
    console.log(h.cyan('  clear         ') + '清空对话历史');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js agent chat 帮我规划明天的学习');
    console.log('  node cli.js agent history');
    console.log('  node cli.js agent 今天应该学什么?');
}

module.exports = { run, chatWithAgent, viewHistory, viewProfile, printAgentHelp };