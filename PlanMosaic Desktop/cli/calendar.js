const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function printCalendar(year, month, schedules) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    console.log('');
    console.log('         ' + h.bold(`${year}年 ${month + 1}月`));
    console.log(h.dim('  日  一  二  三  四  五  六'));

    let line = '';
    for (let i = 0; i < startDay; i++) {
        line += '    ';
    }

    let scheduleCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = h.formatDate(date);
        const hasSchedule = schedules && schedules[dateStr];
        const dayStr = String(day).padStart(2, ' ');
        if (hasSchedule) {
            scheduleCount++;
            line += h.cyan(dayStr + '  ');
        } else {
            line += dayStr + '  ';
        }
        if ((startDay + day) % 7 === 0) {
            console.log(line);
            line = '';
        }
    }
    if (line.trim()) {
        console.log(line);
    }
    console.log('');
    console.log(`共 ${h.cyan(scheduleCount + '')} 天有安排`);
    console.log(h.dim('说明: ') + h.cyan('高亮') + h.dim(' 日期表示有安排'));
}

function printDaySchedule(dateStr, schedule) {
    if (!schedule) {
        console.log(h.dim(`\n日期 ${dateStr} 没有安排。`));
        return;
    }

    const date = h.parseDate(dateStr);
    const weekDay = date ? h.getWeekDayName(date) : '';

    console.log('');
    console.log(h.bold(`📅 ${dateStr} (${weekDay}) - ${schedule.title || '安排'}`));
    if (schedule.highlights) {
        console.log(h.yellow('🌟 ' + schedule.highlights));
    }
    if (schedule.milestone) {
        console.log(h.magenta('🏆 里程碑: ' + schedule.milestone));
    }
    if (schedule.timeSlots && schedule.timeSlots.length > 0) {
        console.log('');
        console.log(h.bold('时间安排:'));
        schedule.timeSlots.forEach(slot => {
            console.log(h.cyan(`  ${slot.time}  `) + `${slot.icon || '●'} ${slot.activity}`);
            if (slot.detail) {
                console.log(h.dim(`       ${slot.detail}`));
            }
        });
    }
    if (schedule.notes) {
        console.log('');
        console.log(h.dim('备注: ' + schedule.notes));
    }
}

function listSchedules(schedules, data) {
    const dates = Object.keys(schedules || {})
        .filter(k => k && k.match(/^\d{4}-\d{2}-\d{2}$/))
        .sort();
    if (dates.length === 0) {
        console.log(h.dim('\n暂无任何日程安排。'));
        return;
    }

    console.log('');
    console.log(h.bold(`日程列表 (共 ${dates.length} 天)`));
    console.log(h.dim(h.separator('─', 70)));

    const rows = dates.map(dateStr => {
        const s = schedules[dateStr];
        const date = h.parseDate(dateStr);
        const weekDay = date ? h.getWeekDayName(date) : '';
        const slots = s.timeSlots ? s.timeSlots.length : 0;
        const hasMilestone = s.milestone ? '🏆' : '  ';
        return [hasMilestone, dateStr, weekDay, s.title || '', `${slots}项`];
    });

    h.table(['', '日期', '周', '标题', '事项'], rows);
}

function printWeekSchedule(year, month, day, schedules) {
    const target = new Date(year, month, day);
    const dayOfWeek = target.getDay();
    const monday = new Date(target);
    monday.setDate(target.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    console.log('');
    console.log(h.bold(`📅 周视图  ${h.formatDate(monday)} ~ ${h.formatDate(sunday)}`));
    console.log(h.dim(h.separator('─', 50)));

    let hasAny = false;
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = h.formatDate(date);
        const weekDay = h.getWeekDayName(date);
        const schedule = schedules[dateStr];

        const isToday = h.formatDate(new Date()) === dateStr;
        const prefix = isToday ? h.green('▶') : '  ';

        if (schedule) {
            hasAny = true;
            const slots = schedule.timeSlots ? schedule.timeSlots.length : 0;
            const title = schedule.title || '';
            console.log(`${prefix} ${h.cyan(dateStr)} ${weekDay}  ${h.bold(title)}  ${h.dim(`(${slots}项)`)}`);
            if (schedule.timeSlots) {
                schedule.timeSlots.forEach(slot => {
                    console.log(`      ${h.dim(slot.time)}  ${slot.activity}`);
                });
            }
        } else {
            console.log(`${prefix} ${h.dim(dateStr)} ${weekDay}  无安排`);
        }
    }
    if (!hasAny) {
        console.log(h.dim('  本周暂无安排'));
    }
}

function printTodaySchedule(schedules) {
    const today = new Date();
    const dateStr = h.formatDate(today);
    const weekDay = h.getWeekDayName(today);

    console.log('');
    console.log(h.bold(`📅 今日 ${dateStr} (${weekDay})`));

    const schedule = schedules[dateStr];
    if (!schedule) {
        console.log(h.dim('\n今日暂无安排，享受轻松的一天吧！'));
        return;
    }

    printDaySchedule(dateStr, schedule);
}

function run(args) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = null;
    let mode = 'calendar';
    let listMode = false;
    let weekMode = false;
    let todayMode = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-m' && args[i + 1]) {
            const parsed = h.parseYearMonth(args[i + 1]);
            if (parsed) {
                year = parsed.year;
                month = parsed.month;
                i++;
            } else {
                h.error('-m 参数格式应为 YYYY-MM');
                process.exit(1);
            }
        } else if (arg === '-d' && args[i + 1]) {
            const date = h.parseDate(args[i + 1]);
            if (date) {
                year = date.getFullYear();
                month = date.getMonth();
                day = date.getDate();
                mode = 'day';
                i++;
            } else {
                h.error('-d 参数格式应为 YYYY-MM-DD');
                process.exit(1);
            }
        } else if (arg === '-l' || arg === '--list' || arg === 'list') {
            listMode = true;
        } else if (arg === '-w' || arg === '--week' || arg === 'week') {
            weekMode = true;
        } else if (arg === '-t' || arg === '--today' || arg === 'today') {
            todayMode = true;
        } else if (arg === '-h' || arg === '--help' || arg === 'help') {
            printCalendarHelp();
            return;
        } else if (!arg.startsWith('-')) {
            const parsedYM = h.parseYearMonth(arg);
            if (parsedYM) {
                year = parsedYM.year;
                month = parsedYM.month;
            } else {
                const parsedD = h.parseDate(arg);
                if (parsedD) {
                    year = parsedD.getFullYear();
                    month = parsedD.getMonth();
                    day = parsedD.getDate();
                    mode = 'day';
                }
            }
        }
    }

    const data = h.loadData();
    if (!data) return;
    const schedules = data.schedules || {};

    if (todayMode) {
        printTodaySchedule(schedules);
        notifyUI('navigate.today');
        notifyUI('toast.info', { message: 'CLI: 查看今日安排' });
    } else if (listMode) {
        listSchedules(schedules, data);
        notifyUI('panel.tasks');
    } else if (weekMode) {
        printWeekSchedule(year, month, day || now.getDate(), schedules);
        notifyUI('navigate.week');
        notifyUI('toast.info', { message: 'CLI: 周视图' });
    } else if (mode === 'day' && day !== null) {
        const dateStr = h.formatDate(new Date(year, month, day));
        printDaySchedule(dateStr, schedules[dateStr]);
        notifyUI('navigate.date', { dateStr });
    } else {
        printCalendar(year, month, schedules);
        notifyUI('navigate.calendar');
    }
}

function printCalendarHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 日历与日程查看'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js calendar [选项]');
    console.log('  node cli.js [选项]          默认执行日历命令');
    console.log('');
    console.log('选项:');
    console.log(h.cyan('  -m YYYY-MM     ') + '显示指定月份的日历');
    console.log(h.cyan('  -d YYYY-MM-DD  ') + '显示指定日期的详细安排');
    console.log(h.cyan('  -l, --list     ') + '列出所有有安排的日期');
    console.log(h.cyan('  -w, --week     ') + '显示本周的日程视图');
    console.log(h.cyan('  -t, --today    ') + '显示今日安排');
    console.log(h.cyan('  -h, --help     ') + '显示此帮助信息');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js                    显示当前月日历');
    console.log('  node cli.js -m 2026-06         显示2026年6月日历');
    console.log('  node cli.js -d 2026-06-15      显示6月15日详细安排');
    console.log('  node cli.js -w                 显示本周日程');
    console.log('  node cli.js -t                 显示今日安排');
    console.log('  node cli.js -l                 列出所有日程');
}

module.exports = { run, printCalendar, printDaySchedule, listSchedules, printWeekSchedule, printCalendarHelp };