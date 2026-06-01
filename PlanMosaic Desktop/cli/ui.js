const http = require('http');
const h = require('./helpers.js');

const CONTROL_URL = 'http://127.0.0.1:5199';

function apiCall(method, path, body) {
    return new Promise((resolve) => {
        const url = new URL(path, CONTROL_URL);
        const bodyStr = body ? JSON.stringify(body) : undefined;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' }
        };
        if (bodyStr) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response: ' + data.substring(0, 200) });
                }
            });
        });
        req.on('error', (err) => {
            resolve({ success: false, error: '无法连接到 PlanMosaic 桌面应用: ' + err.message,
                hint: '请确保桌面应用正在运行 (node main.js 或 npm start)' });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: '请求超时，桌面应用可能未运行' });
        });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function checkConnection() {
    return apiCall('GET', '/health');
}

async function ensureConnection() {
    const result = await checkConnection();
    if (!result.ready) {
        h.error('无法连接到 PlanMosaic 桌面应用');
        h.info('请先启动桌面应用: npm start 或 双击 PlanMosaic.exe');
        return false;
    }
    return true;
}

function printStatus(data) {
    console.log('');
    console.log(h.bold('PlanMosaic 桌面应用状态'));
    console.log(h.dim(h.separator('─', 55)));

    console.log('');
    console.log(h.bold('窗口:'));
    console.log(h.cyan(`  标题:     ${data.window.title}`));
    console.log(h.cyan(`  尺寸:     ${data.window.width} x ${data.window.height}`));
    console.log(h.cyan(`  最大化:   ${data.window.isMaximized ? h.green('是') : h.dim('否')}`));
    console.log(h.cyan(`  最小化:   ${data.window.isMinimized ? h.yellow('是') : h.dim('否')}`));
    console.log(h.cyan(`  聚焦:     ${data.window.isFocused ? h.green('是') : h.dim('否')}`));

    console.log('');
    console.log(h.bold('后端:'));
    console.log(h.cyan(`  Python:   ${data.backend.running ? h.green('运行中') : h.red('未运行')}`));
    console.log(h.dim(`  地址:     ${data.backend.url}`));

    console.log('');
    console.log(h.bold('配置:'));
    console.log(h.cyan(`  提供商:   ${data.config.provider}`));
    console.log(h.cyan(`  模型:     ${data.config.deepseekModel}`));
    console.log(h.cyan(`  密钥:     DS:${data.config.hasDeepseekKey ? h.green('已配置') : h.dim('无')} QW:${data.config.hasQwenKey ? h.green('已配置') : h.dim('无')}`));

    if (data.ui) {
        console.log('');
        console.log(h.bold('界面:'));
        console.log(h.cyan(`  主题:     ${data.ui.theme === 'dark' ? h.dim('深色') : h.yellow('浅色')}`));
        console.log(h.cyan(`  活跃页:   ${data.ui.activeTab || '未知'}`));
        console.log(h.cyan(`  对话数:   ${data.ui.conversationCount}`));
        console.log(h.cyan(`  侧边栏:   ${data.ui.sidebarVisible ? h.green('可见') : h.dim('隐藏')}`));
    }
}

async function statusCommand() {
    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('GET', '/ui/status');
    if (result.success) {
        printStatus(result.data);
    } else {
        h.error('获取状态失败: ' + (result.error || '未知错误'));
    }
}

async function chatCommand(message) {
    if (!message) {
        h.error('请提供要发送的消息');
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/chat', { message });
    if (result.success) {
        h.success(`消息已发送: "${message.substring(0, 60)}${message.length > 60 ? '...' : ''}"`);
    } else {
        h.error('发送失败: ' + (result.error || '未知错误'));
    }
}

async function execCommand(script) {
    if (!script) {
        h.error('请提供要执行的 JavaScript 代码');
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/exec', { script });
    if (result.success) {
        h.success('代码执行成功');
        if (result.result !== undefined) {
            console.log(h.dim(h.separator('─', 50)));
            console.log(typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result));
        }
    } else {
        h.error('执行失败: ' + (result.error || '未知错误'));
    }
}

async function themeCommand(theme) {
    if (!theme || !['dark', 'light'].includes(theme)) {
        h.error('请指定主题: dark 或 light');
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/theme', { theme });
    if (result.success) {
        h.success(`主题已切换为: ${theme === 'dark' ? '深色' : '浅色'}`);
    } else {
        h.error('切换失败: ' + (result.error || '未知错误'));
    }
}

async function windowCommand(action, width, height) {
    const validActions = ['minimize', 'maximize', 'restore', 'focus', 'resize', 'center'];
    if (!action || !validActions.includes(action)) {
        h.error(`无效的窗口操作: ${action}`);
        h.info(`可选: ${validActions.join(', ')}`);
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    const body = { action };
    if (action === 'resize') {
        body.width = width ? parseInt(width) : 1400;
        body.height = height ? parseInt(height) : 900;
    }

    const result = await apiCall('POST', '/ui/window', body);
    if (result.success) {
        h.success(`窗口操作完成: ${result.action || action}`);
    } else {
        h.error('操作失败: ' + (result.error || '未知错误'));
    }
}

async function reloadCommand() {
    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/reload');
    if (result.success) {
        h.success('窗口已重新加载');
    } else {
        h.error('操作失败: ' + (result.error || '未知错误'));
    }
}

async function devtoolsCommand() {
    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/devtools');
    if (result.success) {
        h.success(`开发者工具: ${result.action === 'devtools-opened' ? '已打开' : '已关闭'}`);
    } else {
        h.error('操作失败: ' + (result.error || '未知错误'));
    }
}

async function queryCommand(target, selector) {
    const connected = await ensureConnection();
    if (!connected) return;

    const validTargets = ['messages', 'theme', 'title', 'dom'];
    if (!target || !validTargets.includes(target)) {
        h.error(`无效的查询目标: ${target}`);
        h.info(`可选: ${validTargets.join(', ')}`);
        return;
    }

    let path = `/ui/query?target=${encodeURIComponent(target)}`;
    if (target === 'dom' && selector) {
        path += `&selector=${encodeURIComponent(selector)}`;
    }

    const result = await apiCall('GET', path);
    if (result.success) {
        if (result.target === 'messages' && Array.isArray(result.data)) {
            console.log('');
            console.log(h.bold(`对话消息 (共 ${result.data.length} 条)`));
            result.data.slice(-5).forEach((msg, i) => {
                const role = msg.role || 'unknown';
                const content = (msg.content || '').substring(0, 100);
                const roleColor = role === 'user' ? h.green : role === 'assistant' ? h.cyan : h.dim;
                console.log(roleColor(`  [${role}]`) + ` ${content}`);
            });
        } else if (result.target === 'dom') {
            if (!result.data) {
                h.warn('未找到匹配的 DOM 元素');
            } else {
                console.log('');
                console.log(h.bold('DOM 元素信息:'));
                console.log(JSON.stringify(result.data, null, 2));
            }
        } else {
            console.log('');
            console.log(h.bold(`查询结果 (${result.target}):`));
            console.log(typeof result.data === 'object' ? JSON.stringify(result.data, null, 2) : String(result.data));
        }
    } else {
        h.error('查询失败: ' + (result.error || '未知错误'));
    }
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printUiHelp();
        return;
    }

    switch (subCmd) {
        case 'status':
        case 'info':
            statusCommand();
            break;
        case 'chat':
        case 'send':
            chatCommand(args.slice(1).join(' '));
            break;
        case 'exec':
        case 'js':
            execCommand(args.slice(1).join(' '));
            break;
        case 'theme':
            themeCommand(args[1]);
            break;
        case 'window':
        case 'win':
            windowCommand(args[1], args[2], args[3]);
            break;
        case 'reload':
        case 'refresh':
            reloadCommand();
            break;
        case 'devtools':
        case 'dev':
            devtoolsCommand();
            break;
        case 'query':
        case 'q':
            queryCommand(args[1], args[2]);
            break;
        case 'navigate':
        case 'nav':
        case 'n':
            navigateCommand(args.slice(1));
            break;
        case 'open':
        case 'o':
            openCommand(args.slice(1));
            break;
        case 'toast':
            toastCommand(args.slice(1));
            break;
        case 'action':
        case 'act':
            actionCommand(args.slice(1));
            break;
        case 'bigtask':
        case 'bt':
            bigtaskCommand(args.slice(1));
            break;
        case 'sync':
            syncCommand(args.slice(1));
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printUiHelp();
    }
}

async function navigateCommand(subArgs) {
    const target = subArgs[0];
    const navigations = {
        'calendar': 'navigate.calendar', 'cal': 'navigate.calendar',
        'today': 'navigate.today',
        'week': 'navigate.week',
        'prev': 'navigate.prev',
        'next': 'navigate.next',
        'date': null  // handled specially
    };

    if (!target || (!navigations.hasOwnProperty(target) && target !== 'date')) {
        h.error(`Unknown navigation target: ${target}`);
        h.info('Available: calendar, today, week, prev, next, date <YYYY-MM-DD>');
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    if (target === 'date') {
        const dateStr = subArgs[1];
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            h.error('Please provide a valid date: navigate date YYYY-MM-DD');
            return;
        }
        const result = await apiCall('POST', '/ui/action', { action: 'navigate.date', params: { dateStr } });
        if (result.success) h.success(`Navigated to: ${dateStr}`);
        else h.error('Navigation failed: ' + (result.error || 'unknown'));
    } else {
        const result = await apiCall('POST', '/ui/action', { action: navigations[target], params: {} });
        if (result.success) h.success(`Navigated to: ${target}`);
        else h.error('Navigation failed: ' + (result.error || 'unknown'));
    }
}

async function openCommand(subArgs) {
    const target = subArgs[0];
    const opens = {
        'settings': 'settings.open',
        'agent': 'agent.open',
        'chat': 'agent.open',
        'mini': 'agent.mini',
        'schedule-editor': 'edit.scheduleEditor',
        'editor': 'edit.scheduleEditor',
        'tasks': 'panel.tasks',
        'sidebar': 'panel.sidebar',
    };

    if (!target || !opens[target]) {
        h.error(`Unknown open target: ${target}`);
        h.info(`Available: ${Object.keys(opens).join(', ')}`);
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/action', { action: opens[target], params: {} });
    if (result.success) h.success(`Opened: ${target}`);
    else h.error('Open failed: ' + (result.error || 'unknown'));
}

async function toastCommand(subArgs) {
    const type = subArgs[0] || 'info';
    const message = subArgs.slice(1).join(' ') || 'Hello from CLI';

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/action', {
        action: `toast.${type}`,
        params: { message }
    });
    if (result.success) h.success(`Toast shown: [${type}] ${message}`);
    else h.error('Toast failed: ' + (result.error || 'unknown'));
}

async function actionCommand(subArgs) {
    const action = subArgs[0];
    if (!action) {
        h.error('Please specify an action name');
        h.info('Usage: node cli.js ui action <action> [key=value ...]');
        return;
    }

    // Parse key=value params
    const params = {};
    subArgs.slice(1).forEach(arg => {
        const eq = arg.indexOf('=');
        if (eq > 0) {
            params[arg.substring(0, eq)] = arg.substring(eq + 1);
        }
    });

    const connected = await ensureConnection();
    if (!connected) return;

    const result = await apiCall('POST', '/ui/action', { action, params });
    if (result.success) {
        h.success(`Action executed: ${action}`);
        if (result.result !== undefined) {
            console.log(h.dim('Result: ' + JSON.stringify(result.result)));
        }
    } else {
        h.error('Action failed: ' + (result.error || 'unknown'));
    }
}

async function bigtaskCommand(subArgs) {
    const action = subArgs[0];

    if (!action || action === '-h' || action === '--help' || action === 'help') {
        console.log('');
        console.log(h.bold('UI BigTask 控制'));
        console.log('');
        console.log('用法: node cli.js ui bigtask <操作> [参数]');
        console.log('');
        console.log('操作:');
        console.log(h.cyan('  add <标题>              ') + '添加大任务');
        console.log(h.cyan('  toggle <序号>           ') + '切换大任务完成状态');
        console.log(h.cyan('  remove <序号>           ') + '删除大任务');
        console.log(h.cyan('  list                    ') + '查看所有大任务');
        return;
    }

    const connected = await ensureConnection();
    if (!connected) return;

    switch (action) {
        case 'add': {
            const title = subArgs.slice(1).join(' ');
            if (!title) {
                h.error('请提供大任务标题');
                return;
            }
            const result = await apiCall('POST', '/ui/action', { action: 'bigtask.add', params: { title } });
            if (result.success) h.success(`大任务已添加: ${title}`);
            else h.error('添加失败: ' + (result.error || 'unknown'));
            break;
        }
        case 'toggle': {
            const idx = subArgs[1];
            if (!idx) { h.error('请提供序号'); return; }
            const result = await apiCall('POST', '/ui/action', { action: 'bigtask.toggle', params: { index: parseInt(idx) - 1 } });
            if (result.success) h.success(`大任务 [${idx}] 状态已切换`);
            else h.error('操作失败: ' + (result.error || 'unknown'));
            break;
        }
        case 'remove':
        case 'rm': {
            const idx = subArgs[1];
            if (!idx) { h.error('请提供序号'); return; }
            const result = await apiCall('POST', '/ui/action', { action: 'bigtask.remove', params: { index: parseInt(idx) - 1 } });
            if (result.success) h.success(`大任务 [${idx}] 已删除`);
            else h.error('删除失败: ' + (result.error || 'unknown'));
            break;
        }
        case 'list':
        case 'ls': {
            const result = await apiCall('POST', '/ui/action', { action: 'bigtask.list', params: {} });
            if (result.success && result.result) {
                const tasks = result.result;
                if (Array.isArray(tasks)) {
                    console.log('');
                    console.log(h.bold(`大任务 (共 ${tasks.length} 项)`));
                    tasks.forEach((t, i) => {
                        const check = t.completed ? h.green('✓') : h.dim('○');
                        console.log(`  ${check} ${h.green(String(i + 1).padStart(2))}  ${t.title || t.text || JSON.stringify(t)}`);
                    });
                } else {
                    console.log(JSON.stringify(tasks, null, 2));
                }
            } else {
                h.error('获取失败: ' + (result.error || 'unknown'));
            }
            break;
        }
        default:
            h.error(`未知 bigtask 操作: ${action}`);
            h.info('可用: add, toggle, remove, list');
    }
}

async function syncCommand(subArgs) {
    const connected = await ensureConnection();
    if (!connected) return;

    h.info('正在同步 UI 数据...');
    const result = await apiCall('POST', '/ui/action', { action: 'data.refreshAll', params: {} });
    if (result.success) {
        h.success('UI 数据已同步');
    } else {
        h.error('同步失败: ' + (result.error || 'unknown'));
    }
}

function printUiHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 桌面端界面控制'));
    console.log('');
    console.log('通过命令行远程控制正在运行的 PlanMosaic 桌面应用界面。');
    console.log(h.dim('需要先启动桌面应用: npm start 或 双击 PlanMosaic.exe'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js ui <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  status, info             ') + '查看应用完整状态 (窗口/后端/界面)');
    console.log(h.cyan('  chat, send <消息>        ') + '向应用发送聊天消息');
    console.log(h.cyan('  exec, js <代码>          ') + '在应用界面中执行 JavaScript');
    console.log(h.cyan('  theme <dark|light>       ') + '切换深浅色主题');
    console.log(h.cyan('  window <操作> [参数]     ') + '窗口操作 (minimize/maximize/restore/focus/resize/center)');
    console.log(h.cyan('  reload, refresh          ') + '重新加载应用界面');
    console.log(h.cyan('  devtools, dev            ') + '打开/关闭开发者工具');
    console.log(h.cyan('  query <目标> [选择器]    ') + '查询界面状态 (messages/theme/title/dom)');
    console.log(h.cyan('  navigate, nav <目标>     ') + '导航界面 (calendar/today/week/prev/next/date)');
    console.log(h.cyan('  open, o <目标>           ') + '打开面板 (settings/agent/chat/tasks/sidebar/editor)');
    console.log(h.cyan('  toast <类型> <消息>      ') + '显示通知 (info/success/warning/error)');
    console.log(h.cyan('  action, act <名称> [k=v] ') + '执行原始 UI 动作');
    console.log(h.cyan('  bigtask, bt <操作> [参数]') + '大任务管理 (add/toggle/remove/list)');
    console.log(h.cyan('  sync                     ') + '强制同步 UI 数据');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js ui status');
    console.log('  node cli.js ui theme dark');
    console.log('  node cli.js ui chat "帮我规划明天"');
    console.log('  node cli.js ui window minimize');
    console.log('  node cli.js ui window resize 1200 800');
    console.log('  node cli.js ui exec "document.title"');
    console.log('  node cli.js ui query messages');
    console.log('  node cli.js ui query dom .sidebar');
    console.log('  node cli.js ui bigtask add "期末复习"');
    console.log('  node cli.js ui bigtask list');
    console.log('  node cli.js ui sync');
}

module.exports = { run, statusCommand, chatCommand, execCommand, themeCommand, windowCommand, printUiHelp, navigateCommand, openCommand, toastCommand, actionCommand, bigtaskCommand, syncCommand };