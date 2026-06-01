const fs = require('fs');
const path = require('path');
const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function createBackup(username) {
    const data = h.loadData(username);
    const config = h.loadConfig(username);
    const log = h.loadAgentLog(username);

    if (!data) {
        h.error('无法读取数据文件，备份失败');
        return;
    }

    const backupDir = require('../paths.js').getBackupDir(username);
    const now = new Date();
    const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    const backupName = `backup_${timestamp}.json`;
    const backupPath = path.join(backupDir, backupName);

    const backupData = {
        type: 'full_backup',
        version: '1.0',
        createdAt: now.toISOString(),
        data: data,
        config: config,
        agentLog: log
    };

    try {
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
        const size = (fs.statSync(backupPath).size / 1024).toFixed(1);
        h.success(`备份已创建: ${backupName} (${size} KB)`);
        notifyUI('toast.success', { message: `CLI: 备份已创建 (${size} KB)` });

        require('../paths.js').cleanOldBackups('backup', username);
    } catch (e) {
        h.error('创建备份失败: ' + e.message);
    }
}

function listBackups(username) {
    const backupDir = require('../paths.js').getBackupDir(username);
    if (!fs.existsSync(backupDir)) {
        console.log(h.dim('\n暂无备份记录'));
        return;
    }

    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
        .map(f => {
            const fpath = path.join(backupDir, f);
            const stat = fs.statSync(fpath);
            return {
                name: f,
                path: fpath,
                size: stat.size,
                time: stat.mtime
            };
        })
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        console.log(h.dim('\n暂无备份记录'));
        return;
    }

    console.log('');
    console.log(h.bold(`备份列表 (共 ${files.length} 个)`));
    console.log(h.dim(h.separator('─', 75)));

    const rows = files.map((f, i) => {
        const sizeKB = (f.size / 1024).toFixed(1);
        const timeStr = f.time.toISOString().replace('T', ' ').substring(0, 19);
        return [String(i + 1), f.name, `${sizeKB} KB`, timeStr];
    });

    h.table(['#', '文件名', '大小', '时间'], rows);
}

function restoreBackup(filename, username) {
    const backupDir = require('../paths.js').getBackupDir(username);
    const backupPath = path.join(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
        h.error(`备份文件不存在: ${filename}`);
        h.info('使用 node cli.js data backups 查看可用备份');
        return;
    }

    try {
        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

        if (backupData.type !== 'full_backup') {
            h.warn('备份格式可能不兼容，将尝试恢复...');
        }

        if (backupData.data) {
            h.saveData(backupData.data, username);
            h.success('数据已恢复');
        }
        if (backupData.config) {
            h.saveConfig(backupData.config, username);
            h.success('配置已恢复');
        }
        if (backupData.agentLog) {
            const logFile = require('../paths.js').getAgentLogPath(username);
            fs.writeFileSync(logFile, JSON.stringify(backupData.agentLog, null, 2), 'utf8');
            h.success('对话记录已恢复');
        }

        h.success('备份恢复完成！');
        notifyUI('data.refreshAll');
        notifyUI('toast.success', { message: 'CLI: 数据已从备份恢复' });
    } catch (e) {
        h.error('恢复备份失败: ' + e.message);
    }
}

function exportData(format, username) {
    const data = h.loadData(username);
    if (!data) return;

    format = format || 'json';

    if (format === 'json') {
        const exportPath = path.join(process.cwd(), 'planmosaic-export.json');
        fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf8');
        h.success(`数据已导出至: ${exportPath}`);
        notifyUI('toast.info', { message: 'CLI: 数据已导出' });
    } else if (format === 'csv') {
        const schedules = data.schedules || {};
        const dates = Object.keys(schedules).sort();

        let csv = '日期,标题,亮点,里程碑,时间段\n';
        for (const dateStr of dates) {
            const s = schedules[dateStr];
            const slots = (s.timeSlots || []).map(sl => `${sl.time}:${sl.activity}`).join('; ');
            csv += `"${dateStr}","${s.title || ''}","${s.highlights || ''}","${s.milestone || ''}","${slots}"\n`;
        }

        const exportPath = path.join(process.cwd(), 'planmosaic-export.csv');
        fs.writeFileSync(exportPath, csv, 'utf8');
        h.success(`数据已导出至: ${exportPath}`);
        notifyUI('toast.info', { message: 'CLI: 数据已导出' });
    } else {
        h.error(`不支持的导出格式: ${format}，支持: json, csv`);
    }
}

function run(args) {
    const subCmd = args[0];
    const username = undefined;

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printDataHelp();
        return;
    }

    switch (subCmd) {
        case 'backup':
            createBackup(username);
            break;
        case 'backups':
        case 'list':
            listBackups(username);
            break;
        case 'restore':
            if (!args[1]) {
                h.error('请指定要恢复的备份文件名');
                listBackups(username);
                return;
            }
            restoreBackup(args[1], username);
            break;
        case 'export':
            exportData(args[1], username);
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printDataHelp();
    }
}

function printDataHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 数据管理'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js data <子命令> [参数]');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  backup              ') + '创建数据备份');
    console.log(h.cyan('  backups, list       ') + '查看备份列表');
    console.log(h.cyan('  restore <文件名>    ') + '从备份恢复数据');
    console.log(h.cyan('  export [格式]       ') + '导出数据 (json/csv)');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js data backup');
    console.log('  node cli.js data backups');
    console.log('  node cli.js data restore backup_20260601_120000.json');
    console.log('  node cli.js data export csv');
}

module.exports = { run, createBackup, listBackups, restoreBackup, exportData, printDataHelp };