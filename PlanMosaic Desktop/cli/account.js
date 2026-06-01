const fs = require('fs');
const path = require('path');
const h = require('./helpers.js');
const { notifyUI } = require('./bridge.js');

function showAccountInfo(username) {    
    const paths = require('../paths.js');

    console.log('');
    console.log(h.bold('账号信息'));
    console.log(h.dim(h.separator('─', 50)));

    const dataDir = paths.getAppDataDir(username);
    console.log(h.cyan(`  数据目录: ${dataDir}`));

    const partitions = getAccountPartitions();
    if (partitions.length > 0) {
        console.log('');
        console.log(h.bold('已有账号分区:'));
        partitions.forEach(p => {
            const isDefault = !p.dir;
            const display = isDefault ? '(默认)' : p.hashed;
            console.log(h.dim(`  ${p.hashed} ${display}`));
        });
    } else {
        console.log(h.dim('\n  暂无其他账号分区'));
    }
    notifyUI('toast.info', { message: 'CLI: 查看账号信息' });
}

function getAccountPartitions() {
    const paths = require('../paths.js');
    const rootDir = paths.getAppDataRootDir();
    if (!fs.existsSync(rootDir)) return [];

    const systemDirs = [
        'blob_storage', 'Cache', 'Code Cache', 'DawnGraphiteCache', 'DawnWebGPUCache',
        'Dictionaries', 'GPUCache', 'Local Storage', 'Network', 'Partitions',
        'Session Storage', 'Shared Dictionary', 'backups'
    ];

    return fs.readdirSync(rootDir, { withFileTypes: true })
        .filter(d => {
            if (!d.isDirectory()) return false;
            if (systemDirs.includes(d.name)) return false;
            const dataFile = path.join(rootDir, d.name, 'data.json');
            return fs.existsSync(dataFile);
        })
        .map(d => ({ hashed: d.name, dir: path.join(rootDir, d.name) }));
}

function listUsers() {
    const partitions = getAccountPartitions();

    console.log('');
    console.log(h.bold('账号列表'));

    if (partitions.length === 0) {
        console.log(h.dim('\n暂无账号数据'));
        return;
    }

    console.log(h.dim(h.separator('─', 65)));

    const rows = [];
    partitions.forEach((part, i) => {
        const dataFile = path.join(part.dir, 'data.json');
        const stats = { size: 0, schedules: 0, lastModified: '' };
        if (fs.existsSync(dataFile)) {
            const stat = fs.statSync(dataFile);
            stats.size = stat.size;
            stats.lastModified = stat.mtime.toISOString().replace('T', ' ').substring(0, 19);
            try {
                const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                stats.schedules = Object.keys(data.schedules || {}).length;
            } catch (e) {}
        }
        rows.push([
            String(i + 1),
            part.hashed,
            `${(stats.size / 1024).toFixed(1)} KB`,
            `${stats.schedules}天`,
            stats.lastModified || '未知'
        ]);
    });

    h.table(['#', '分区ID', '大小', '日程', '最后修改'], rows);
    notifyUI('toast.info', { message: `CLI: ${partitions.length} 个账号分区` });
}

function run(args) {
    const subCmd = args[0];

    if (!subCmd || subCmd === '-h' || subCmd === '--help' || subCmd === 'help') {
        printAccountHelp();
        return;
    }

    switch (subCmd) {
        case 'info':
        case 'show':
            showAccountInfo(args[1]);
            break;
        case 'list':
        case 'users':
            listUsers();
            break;
        default:
            h.error(`未知子命令: ${subCmd}`);
            printAccountHelp();
    }
}

function printAccountHelp() {
    console.log('');
    console.log(h.bold('PlanMosaic - 账号管理'));
    console.log('');
    console.log('用法:');
    console.log('  node cli.js account <子命令>');
    console.log('');
    console.log('子命令:');
    console.log(h.cyan('  info, show     ') + '查看当前账号信息');
    console.log(h.cyan('  list, users    ') + '列出所有账号数据分区');
    console.log('');
    console.log('示例:');
    console.log('  node cli.js account info');
    console.log('  node cli.js account list');
}

module.exports = { run, showAccountInfo, listUsers, printAccountHelp };