const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function addScheduleItem(args) {
    // schedule add 2025-06-01 09:00 "高等数学" --detail "复习第三章" --icon "📚"
    const dateStr = args[0];
    const time = args[1];
    const activity = args[2];

    if (!dateStr || !time || !activity) {
        h.error('用法: node cli.js schedule add <日期> <时间> <活动> [--detail 详情] [--icon 图标]');
        h.info('示例: node cli.js schedule add 2025-06-01 09:00 "高等数学" --detail "复习第三章" --icon "📚"');
        return;
    }

    if (!h.parseDate(dateStr)) {
        h.error(`无效日期格式: ${dateStr} (需要 YYYY-MM-DD)`);
        return;
    }

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
        h.error(`无效时间格式: ${time} (需要 HH:MM)`);
        return;
    }

    // 解析可选参数
    let detail = '';
    let icon = '●';
    for (let i = 3; i < args.length; i++) {
        if (args[i] === '--detail' && args[i + 1]) { detail = args[++i]; }
        else if (args[i] === '--icon' && args[i + 1]) { icon = args[++i]; }
    }

    // 写入本地数据
    const data = h.loadData();
    if (!data) return;

    if (!data.schedules) data.schedules = {};
    if (!data.schedules[dateStr]) data.schedules[dateStr] = { timeSlots: [], tasks: [] };
    if (!data.schedules[dateStr].timeSlots) data.schedules[dateStr].timeSlots = [];

    const item = { time, activity, detail, icon };
    data.schedules[dateStr].timeSlots.push(item);
    data.schedules[dateStr].timeSlots.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (!h.saveData(data)) return;

    h.success(`日程已添加: ${dateStr} ${time} ${activity}`);
    if (detail) h.info(`  详情: ${detail}`);

    // 通知 UI
    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 添加日程 ${time} ${activity}` });
}

function removeScheduleItem(args) {
    // schedule remove 2025-06-01 09:00
    // schedule remove 2025-06-01 --index 2
    const dateStr = args[0];

    if (!dateStr) {
        h.error('用法: node cli.js schedule remove <日期> <时间 | --index 序号>');
        return;
    }

    if (!h.parseDate(dateStr)) {
        h.error(`无效日期格式: ${dateStr}`);
        return;
    }

    const data = h.loadData();
    if (!data || !data.schedules || !data.schedules[dateStr] || !data.schedules[dateStr].timeSlots) {
        h.error(`${dateStr} 没有日程数据`);
        return;
    }

    const slots = data.schedules[dateStr].timeSlots;
    let index = -1;

    if (args[1] === '--index' && args[2]) {
        index = parseInt(args[2]) - 1;
    } else if (args[1]) {
        const time = args[1];
        index = slots.findIndex(s => s.time === time);
    }

    if (index < 0 || index >= slots.length) {
        h.error(`未找到要删除的日程项 (共 ${slots.length} 项)`);
        h.info('使用 schedule list ' + dateStr + ' 查看序号');
        return;
    }

    const removed = slots.splice(index, 1)[0];
    if (slots.length === 0 && (!data.schedules[dateStr].tasks || data.schedules[dateStr].tasks.length === 0)) {
        delete data.schedules[dateStr];
    }

    h.saveData(data);
    h.success(`已删除: ${dateStr} ${removed.time} ${removed.activity}`);

    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: 删除日程 ${removed.time} ${removed.activity}` });
}

function listSchedule(args) {
    // schedule list [日期 | --month YYYY-MM]
    const target = args[0];

    const data = h.loadData();
    if (!data || !data.schedules) {
        h.info('暂无日程数据');
        return;
    }

    let dates = [];

    if (target === '--month' && args[1]) {
        const ym = h.parseYearMonth(args[1]);
        if (!ym) {
            h.error('无效月份格式: ' + args[1] + ' (需要 YYYY-MM)');
            return;
        }
        const prefix = `${ym.year}-${String(ym.month + 1).padStart(2, '0')}`;
        dates = Object.keys(data.schedules).filter(d => d.startsWith(prefix)).sort();
    } else if (target) {
        if (!h.parseDate(target)) {
            h.error('无效日期: ' + target);
            return;
        }
        dates = [target];
    } else {
        // 默认: 本周
        const today = new Date();
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(h.formatDate(d));
        }
        dates = dates.filter(d => data.schedules[d]).sort();
        if (dates.length === 0) {
            // 回退: 列出所有有安排的日期
            dates = Object.keys(data.schedules).sort();
        }
    }

    if (dates.length === 0) {
        h.info('没有找到日程数据');
        return;
    }

    console.log('');
    console.log(h.bold('日程安排'));

    let totalCount = 0;
    dates.forEach(dateStr => {
        const schedule = data.schedules[dateStr];
        if (!schedule) return;

        const dateObj = h.parseDate(dateStr);
        const weekday = dateObj ? h.getWeekDayName(dateObj) : '?';
        const slots = schedule.timeSlots || [];

        if (slots.length === 0) return;

        totalCount += slots.length;
        console.log('');
        console.log(h.cyan(`  ${dateStr} (周${weekday})`) + h.dim(` — ${slots.length} 项`));
        console.log(h.dim('  ' + h.separator('─', 45)));

        slots.forEach((slot, i) => {
            const icon = slot.icon || '●';
            const time = slot.time ? h.bold(slot.time.padEnd(6)) : '      ';
            const act = slot.activity || '';
            const det = slot.detail ? h.dim(` — ${slot.detail}`) : '';
            console.log(`  ${h.green(String(i + 1).padStart(2))}  ${icon} ${time} ${act}${det}`);
        });
    });

    if (totalCount === 0) {
        h.info('所选日期范围内无日程');
    } else {
        console.log('');
        console.log(h.dim(`  共 ${totalCount} 项日程`));
    }

    notifyUI('toast.info', { message: `CLI: 查看 ${dates.length} 天的日程` });
}

function clearSchedule(args) {
    const dateStr = args[0];
    if (!dateStr) {
        h.error('用法: node cli.js schedule clear <日期>');
        return;
    }
    if (!h.parseDate(dateStr)) {
        h.error('无效日期: ' + dateStr);
        return;
    }

    const data = h.loadData();
    if (!data || !data.schedules || !data.schedules[dateStr]) {
        h.info(`${dateStr} 没有日程数据`);
        return;
    }

    const count = (data.schedules[dateStr].timeSlots || []).length;
    data.schedules[dateStr].timeSlots = [];
    if (!data.schedules[dateStr].tasks || data.schedules[dateStr].tasks.length === 0) {
        delete data.schedules[dateStr];
    }

    h.saveData(data);
    h.success(`${dateStr} 已清空 (${count} 项日程已删除)`);

    notifyUI('data.refreshAll');
    notifyUI('toast.success', { message: `CLI: ${dateStr} 日程已清空` });
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printScheduleHelp();
        return;
    }

    switch (subCmd) {
        case 'add':
            addScheduleItem(args.slice(1));
            break;
        case 'remove':
        case 'rm':
        case 'del':
            removeScheduleItem(args.slice(1));
            break;
        case 'list':
        case 'ls':
        case 'show':
            listSchedule(args.slice(1));
            break;
        case 'clear':
            clearSchedule(args.slice(1));
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printScheduleHelp();
    }
}

function printScheduleHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 日程管理'));
    console.log('');
    console.log('从命令行直接管理日程安排，同时同步到桌面应用界面。');
    console.log('');
    console.log('用法:');
    console.log('  node cli.js schedule <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  add <日期> <时间> <活动>  ') + '添加日程项 (支持 --detail 和 --icon)');
    console.log(h.cyan('  remove <日期> <时间|序号>  ') + '删除日程项');
    console.log(h.cyan('  list [日期|月份]           ') + '查看日程 (默认本周)');
    console.log(h.cyan('  clear <日期>               ') + '清空某天所有日程');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js schedule add 2025-06-01 09:00 "高等数学"');
    console.log('  node cli.js schedule add 2025-06-01 14:00 "英语听力" --detail "Unit 3" --icon "🎧"');
    console.log('  node cli.js schedule remove 2025-06-01 09:00');
    console.log('  node cli.js schedule remove 2025-06-01 --index 1');
    console.log('  node cli.js schedule list');
    console.log('  node cli.js schedule list 2025-06-01');
    console.log('  node cli.js schedule list --month 2025-06');
    console.log('  node cli.js schedule clear 2025-06-01');
}

module.exports = { run, addScheduleItem, removeScheduleItem, listSchedule, printScheduleHelp };
