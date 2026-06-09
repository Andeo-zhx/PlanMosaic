#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pmPaths = require('./paths.js');
const h = require('./cli/helpers.js');

const calendar = require('./cli/calendar.js');
const config = require('./cli/config.js');
const agent = require('./cli/agent.js');
const dataCmd = require('./cli/data.js');
const server = require('./cli/server.js');
const account = require('./cli/account.js');
const testCmd = require('./cli/test.js');
const uiCmd = require('./cli/ui.js');
const schedule = require('./cli/schedule.js');
const task = require('./cli/task.js');

pmPaths.migrateFromLegacyDir(__dirname);

const COMMANDS = {
    calendar: { run: calendar.run, help: calendar.printCalendarHelp, aliases: ['cal', 'c'] },
    config: { run: config.run, help: config.printConfigHelp, aliases: ['cfg'] },
    agent: { run: agent.run, help: agent.printAgentHelp, aliases: ['ai', 'chat', 'a'] },
    data: { run: dataCmd.run, help: dataCmd.printDataHelp, aliases: ['backup', 'db'] },
    server: { run: server.run, help: server.printServerHelp, aliases: ['srv', 'svc'] },
    account: { run: account.run, help: account.printAccountHelp, aliases: ['acct', 'acc'] },
    test: { run: testCmd.run, help: testCmd.printTestHelp, aliases: ['t'] },
    ui: { run: uiCmd.run, help: uiCmd.printUiHelp, aliases: ['gui', 'app', 'window'] },
    schedule: { run: schedule.run, help: schedule.printScheduleHelp, aliases: ['sched', 's'] },
    task: { run: task.run, help: task.printTaskHelp, aliases: ['tasks', 'tk'] },
};

function isLegacyFlag(arg) {
    return arg === '-m' || arg === '-d' || arg === '-l' || arg === '--list' || arg === 'list' ||
           arg === '-w' || arg === '--week' || arg === 'week' ||
           arg === '-t' || arg === '--today' || arg === 'today';
}

function resolveCommand(name) {
    if (COMMANDS[name]) return name;
    for (const [cmdName, cmd] of Object.entries(COMMANDS)) {
        if (cmd.aliases && cmd.aliases.includes(name)) return cmdName;
    }
    return null;
}

function printMainHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic ') + h.dim('v1.1.0') + ' — ' + h.dim('学业规划系统命令行工具'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js [命令] [参数]');
    console.log('  node cli.js [选项]              直接查看日历/日程 (兼容模式)');
    console.log('');
    console.log('命令:');
    console.log(h.cyan('  calendar, cal    ') + '查看日历和日程安排');
    console.log(h.cyan('  config, cfg      ') + '管理配置 (API密钥、模型、提供商)');
    console.log(h.cyan('  agent, ai        ') + '与AI学习助手对话');
    console.log(h.cyan('  data, backup     ') + '数据管理 (备份、恢复、导出)');
    console.log(h.cyan('  server, srv      ') + '管理后端服务器');
    console.log(h.cyan('  account, acc     ') + '账号信息管理');
    console.log(h.cyan('  test, t           ') + '运行测试');
    console.log(h.cyan('  ui, app           ') + '控制桌面应用界面 (窗口/主题/消息)');
    console.log(h.cyan('  schedule, s       ') + '日程管理 (添加/删除/查看日程项)');
    console.log(h.cyan('  task, tk          ') + '任务管理 (添加/删除/完成/查看任务)');
    console.log('');
    console.log('兼容模式 (直接日历操作):');
    console.log(h.cyan('  -m YYYY-MM        ') + '显示指定月份日历');
    console.log(h.cyan('  -d YYYY-MM-DD     ') + '显示指定日期的详细安排');
    console.log(h.cyan('  -l, --list        ') + '列出所有有安排的日期');
    console.log(h.cyan('  -w, --week        ') + '显示本周日程视图');
    console.log(h.cyan('  -t, --today       ') + '显示今日安排');
    console.log(h.cyan('  -h, --help        ') + '显示帮助信息');
    console.log('');
    console.log('使用 node cli.js <命令> --help 查看各命令详细帮助');
    console.log('');
    console.log('快速示例:');
    console.log('  node cli.js                         显示当前月日历');
    console.log('  node cli.js -w                      显示本周日程');
    console.log('  node cli.js config show             查看当前配置');
    console.log('  node cli.js agent 帮我规划学习      与AI助手对话');
    console.log('  node cli.js data backup             创建数据备份');
    console.log('  node cli.js schedule add 2025-06-01 09:00 "高数"  添加日程');
    console.log('  node cli.js task add 2025-06-01 "作业"           添加任务');
}

function main() {
    // 支持 --no-ui 标志: 禁用 CLI 到 UI 的通知
    const rawArgs = process.argv.slice(2);
    if (!process.env.PLANMOSAIC_CONTROL_TOKEN) {
        const sharedToken = pmPaths.readControlToken();
        if (sharedToken) {
            process.env.PLANMOSAIC_CONTROL_TOKEN = sharedToken;
        }
    }
    if (rawArgs.includes('--no-ui')) {
        process.env.PLANMOSAIC_NO_UI = '1';
        rawArgs.splice(rawArgs.indexOf('--no-ui'), 1);
    }
    const args = rawArgs;

    if (args.length === 0 || (args.length === 1 && (args[0] === '-h' || args[0] === '--help' || args[0] === 'help'))) {
        printMainHelp();
        return;
    }

    const firstArg = args[0];

    if (isLegacyFlag(firstArg)) {
        calendar.run(args);
        return;
    }

    const resolved = resolveCommand(firstArg);
    if (resolved) {
        const cmd = COMMANDS[resolved];
        cmd.run(args.slice(1));
    } else {
        h.error(`未知命令: ${firstArg}`);
        h.info('使用 node cli.js --help 查看可用命令');
    }
}

if (require.main === module) {
    main();
}

module.exports = { COMMANDS, main };
