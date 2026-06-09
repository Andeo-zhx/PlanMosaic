const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function normalizeTask(task) {
    if (!task || typeof task !== 'object') return { name: '', estimated: '', actual: '', note: '', completed: false };
    return {
        name: String(task.name || task.text || '').trim(),
        estimated: task.estimated === undefined || task.estimated === null ? '' : String(task.estimated),
        actual: task.actual === undefined || task.actual === null ? '' : String(task.actual),
        note: String(task.note || ''),
        completed: !!task.completed
    };
}

function normalizeTaskList(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks.map(normalizeTask).filter(task => task.name);
}

function addTask(args) {
    // task add 2025-06-01 "完成数学作业"
    const dateStr = args[0];
    const text = args.slice(1).join(' ');

    if (!dateStr || !text) {
        h.error('用法: node cli.js task add <日期> <任务内容>');
        h.info('示例: node cli.js task add 2025-06-01 "完成数学作业"');
        return;
    }

    if (!h.parseDate(dateStr)) {
        h.error(`无效日期格式: ${dateStr} (需要 YYYY-MM-DD)`);
        return;
    }

    const data = h.loadData();
    if (!data) return;

    if (!data.schedules) data.schedules = {};
    if (!data.schedules[dateStr]) data.schedules[dateStr] = { timeSlots: [], tasks: [] };
    if (!data.schedules[dateStr].tasks) data.schedules[dateStr].tasks = [];

    data.schedules[dateStr].tasks = normalizeTaskList(data.schedules[dateStr].tasks);
    data.schedules[dateStr].tasks.push({ name: text, estimated: '', actual: '', note: '', completed: false });

    if (!h.saveData(data)) return;

    h.success(`任务已添加: ${dateStr} "${text}"`);
    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 添加任务 "${text}"` });
}

function toggleTask(args) {
    // task toggle 2025-06-01 2
    const dateStr = args[0];
    const indexStr = args[1];

    if (!dateStr || !indexStr) {
        h.error('用法: node cli.js task toggle <日期> <序号>');
        return;
    }

    if (!h.parseDate(dateStr)) {
        h.error(`无效日期: ${dateStr}`);
        return;
    }

    const data = h.loadData();
    if (!data || !data.schedules || !data.schedules[dateStr] || !data.schedules[dateStr].tasks) {
        h.error(`${dateStr} 没有任务数据`);
        return;
    }

    const tasks = data.schedules[dateStr].tasks = normalizeTaskList(data.schedules[dateStr].tasks);
    const index = parseInt(indexStr) - 1;

    if (index < 0 || index >= tasks.length) {
        h.error(`无效序号: ${indexStr} (共 ${tasks.length} 项任务)`);
        return;
    }

    tasks[index].completed = !tasks[index].completed;
    const status = tasks[index].completed ? '已完成' : '未完成';

    h.saveData(data);
    h.success(`任务 [${indexStr}] "${tasks[index].name}" → ${status}`);

    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 任务 "${tasks[index].name}" ${status}` });
}

function removeTask(args) {
    // task remove 2025-06-01 2
    const dateStr = args[0];
    const indexStr = args[1];

    if (!dateStr || !indexStr) {
        h.error('用法: node cli.js task remove <日期> <序号>');
        return;
    }

    if (!h.parseDate(dateStr)) {
        h.error(`无效日期: ${dateStr}`);
        return;
    }

    const data = h.loadData();
    if (!data || !data.schedules || !data.schedules[dateStr] || !data.schedules[dateStr].tasks) {
        h.error(`${dateStr} 没有任务数据`);
        return;
    }

    const tasks = data.schedules[dateStr].tasks = normalizeTaskList(data.schedules[dateStr].tasks);
    const index = parseInt(indexStr) - 1;

    if (index < 0 || index >= tasks.length) {
        h.error(`无效序号: ${indexStr} (共 ${tasks.length} 项任务)`);
        return;
    }

    const removed = tasks.splice(index, 1)[0];
    if (tasks.length === 0 && (!data.schedules[dateStr].timeSlots || data.schedules[dateStr].timeSlots.length === 0)) {
        delete data.schedules[dateStr];
    }

    h.saveData(data);
    h.success(`任务已删除: "${removed.name}"`);

    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 删除任务 "${removed.name}"` });
}

function listTasks(args) {
    // task list [日期]
    const dateStr = args[0];

    const data = h.loadData();
    if (!data || !data.schedules) {
        h.info('暂无任务数据');
        return;
    }

    let dates = [];
    if (dateStr) {
        if (!h.parseDate(dateStr)) {
            h.error('无效日期: ' + dateStr);
            return;
        }
        dates = [dateStr];
    } else {
        // 列出所有有任务的日期
        dates = Object.keys(data.schedules)
            .filter(d => data.schedules[d].tasks && data.schedules[d].tasks.length > 0)
            .sort();
    }

    if (dates.length === 0) {
        h.info('没有找到任务数据');
        return;
    }

    console.log('');
    console.log(h.bold('任务列表'));

    let totalTasks = 0;
    let totalDone = 0;

    dates.forEach(d => {
        const tasks = normalizeTaskList(data.schedules[d].tasks || []);
        if (tasks.length === 0) return;

        const done = tasks.filter(t => t.completed).length;
        totalTasks += tasks.length;
        totalDone += done;

        const dateObj = h.parseDate(d);
        const weekday = dateObj ? h.getWeekDayName(dateObj) : '?';
        console.log('');
        console.log(h.cyan(`  ${d} (周${weekday})`) + h.dim(` — ${done}/${tasks.length} 完成`));
        console.log(h.dim('  ' + h.separator('─', 40)));

        tasks.forEach((task, i) => {
            const check = task.completed ? h.green('✓') : h.dim('○');
            const text = task.completed ? h.dim(task.name) : task.name;
            console.log(`  ${check} ${h.green(String(i + 1).padStart(2))}  ${text}`);
        });
    });

    console.log('');
    const pct = totalTasks > 0 ? Math.round(totalDone / totalTasks * 100) : 0;
    console.log(h.dim(`  共 ${totalTasks} 项任务, ${totalDone} 项已完成 (${pct}%)`));

    notifyUI('toast.info', { message: `CLI: 查看 ${dates.length} 天的任务` });
}

function doneTask(args) {
    // task done 2025-06-01 2 — 标记为已完成
    const dateStr = args[0];
    const indexStr = args[1];

    if (!dateStr || !indexStr) {
        h.error('用法: node cli.js task done <日期> <序号>');
        return;
    }

    const data = h.loadData();
    if (!data || !data.schedules || !data.schedules[dateStr] || !data.schedules[dateStr].tasks) {
        h.error(`${dateStr} 没有任务数据`);
        return;
    }

    const tasks = data.schedules[dateStr].tasks = normalizeTaskList(data.schedules[dateStr].tasks);
    const index = parseInt(indexStr) - 1;

    if (index < 0 || index >= tasks.length) {
        h.error(`无效序号: ${indexStr}`);
        return;
    }

    if (tasks[index].completed) {
        h.info(`任务 [${indexStr}] 已经是完成状态`);
        return;
    }

    tasks[index].completed = true;
    h.saveData(data);
    h.success(`任务完成: "${tasks[index].name}"`);

    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 完成任务 "${tasks[index].name}"` });
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printTaskHelp();
        return;
    }

    switch (subCmd) {
        case 'add':
            addTask(args.slice(1));
            break;
        case 'remove':
        case 'rm':
        case 'del':
            removeTask(args.slice(1));
            break;
        case 'toggle':
        case 'check':
            toggleTask(args.slice(1));
            break;
        case 'done':
        case 'complete':
            doneTask(args.slice(1));
            break;
        case 'list':
        case 'ls':
        case 'show':
            listTasks(args.slice(1));
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printTaskHelp();
    }
}

function printTaskHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 任务管理'));
    console.log('');
    console.log('从命令行管理每日任务，同时同步到桌面应用界面。');
    console.log('');
    console.log('用法:');
    console.log('  node cli.js task <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  add <日期> <任务内容>     ') + '添加任务');
    console.log(h.cyan('  remove <日期> <序号>      ') + '删除任务');
    console.log(h.cyan('  toggle <日期> <序号>      ') + '切换完成状态');
    console.log(h.cyan('  done <日期> <序号>        ') + '标记为已完成');
    console.log(h.cyan('  list [日期]               ') + '查看任务 (默认所有)');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js task add 2025-06-01 "完成数学作业"');
    console.log('  node cli.js task done 2025-06-01 1');
    console.log('  node cli.js task toggle 2025-06-01 2');
    console.log('  node cli.js task remove 2025-06-01 1');
    console.log('  node cli.js task list');
    console.log('  node cli.js task list 2025-06-01');
}

module.exports = { run, addTask, toggleTask, removeTask, listTasks, printTaskHelp };
