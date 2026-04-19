#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pmPaths = require('./paths.js');

const DATA_FILE = pmPaths.getDataFilePath();

// 首次运行：从程序目录迁移旧数据到 AppData
pmPaths.migrateFromLegacyDir(__dirname);

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('错误: 无法加载 data.json 文件');
        console.error(err.message);
        process.exit(1);
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function printCalendar(year, month, schedules) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    console.log(`\n     ${year}年 ${month + 1}月`);
    console.log('日 一 二 三 四 五 六');

    let line = '';
    for (let i = 0; i < startDay; i++) {
        line += '   ';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const hasSchedule = schedules && schedules[dateStr];
        const dayStr = String(day).padStart(2, ' ');
        const display = hasSchedule ? `\x1b[1;36m${dayStr}\x1b[0m` : dayStr;
        line += display + ' ';
        if ((startDay + day) % 7 === 0) {
            console.log(line);
            line = '';
        }
    }
    if (line.trim()) {
        console.log(line);
    }
    console.log('');
    console.log('说明: \x1b[1;36m高亮\x1b[0m 日期表示有安排');
}

function printDaySchedule(dateStr, schedules) {
    const schedule = schedules[dateStr];
    if (!schedule) {
        console.log(`日期 ${dateStr} 没有安排。`);
        return;
    }

    console.log(`\n📅 ${dateStr} - ${schedule.title}`);
    console.log(`🌟 ${schedule.highlights}`);
    if (schedule.milestone) {
        console.log(`🏆 里程碑: ${schedule.milestone}`);
    }
    console.log('\n时间安排:');
    schedule.timeSlots.forEach(slot => {
        console.log(`  ${slot.time}  ${slot.icon} ${slot.activity}`);
        if (slot.detail) {
            console.log(`     ${slot.detail}`);
        }
    });
}

function parseArgs() {
    const args = process.argv.slice(2);
    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-m' && args[i + 1]) {
            const match = args[i + 1].match(/^(\d{4})-(\d{2})$/);
            if (match) {
                year = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                i++;
            } else {
                console.error('错误: -m 参数格式应为 YYYY-MM');
                process.exit(1);
            }
        } else if (args[i] === '-d' && args[i + 1]) {
            const match = args[i + 1].match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
                year = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                day = parseInt(match[3], 10);
                i++;
            } else {
                console.error('错误: -d 参数格式应为 YYYY-MM-DD');
                process.exit(1);
            }
        } else if (args[i] === '-h' || args[i] === '--help') {
            printHelp();
            process.exit(0);
        }
    }

    return { year, month, day };
}

function printHelp() {
    console.log(`
学业规划系统 - 命令行工具

用法:
  node cli.js [选项]

选项:
  -m YYYY-MM    显示指定月份的日历 (例如: -m 2026-03)
  -d YYYY-MM-DD 显示指定日期的详细安排 (例如: -d 2026-03-01)
  -h, --help    显示此帮助信息

示例:
  node cli.js             显示当前月日历
  node cli.js -m 2026-03  显示2026年3月日历
  node cli.js -d 2026-03-01 显示2026年3月1日的详细安排
`);
}

function main() {
    const { year, month, day } = parseArgs();
    const data = loadData();
    const schedules = data.schedules;

    if (day !== null) {
        const dateStr = formatDate(new Date(year, month, day));
        printDaySchedule(dateStr, schedules);
    } else {
        printCalendar(year, month, schedules);
    }
}

if (require.main === module) {
    main();
}