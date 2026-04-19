/**
 * paths.js — PlanMosaic 统一路径管理模块
 *
 * 将所有数据文件（data.json、config.json、agent-log.json、backups/ 等）
 * 从程序当前目录（__dirname）迁移到操作系统专属应用数据目录：
 *   - Windows: %APPDATA%\PlanMosaic\{username}\
 *   - macOS:   ~/Library/Application Support/PlanMosaic/{username}/
 *   - Linux:   ~/.config/PlanMosaic/{username}/
 *
 * 不同账号的数据完全隔离，各自独立存储。
 * 首次打包运行时会清空旧的全局数据。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_NAME = 'PlanMosaic';

// 数据文件名列表（不包括 preload.js 等程序文件）
const DATA_FILES = [
    'data.json',
    'config.json',
    'settings.json',
    'agent-log.json',
];

/**
 * 根据操作系统返回应用数据根目录的绝对路径（不含用户子目录）。
 */
function getAppDataRootDir() {
    const platform = os.platform();
    let baseDir;

    if (platform === 'win32') {
        baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    } else if (platform === 'darwin') {
        baseDir = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
        baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    }

    return path.join(baseDir, APP_NAME);
}

/** 当前活跃用户名（由渲染进程通过 IPC 设置） */
let activeUsername = null;

/**
 * 设置当前活跃用户名，用于按账号隔离数据。
 * @param {string|null} username - 用户名，null 表示未登录
 */
function setActiveUsername(username) {
    activeUsername = username;
}

/**
 * 获取当前用户的数据目录。
 * 如果已设置用户名：rootDir/username/
 * 如果未登录：rootDir/（向后兼容）
 */
function getAppDataDir() {
    const rootDir = getAppDataRootDir();
    if (activeUsername) {
        return path.join(rootDir, activeUsername);
    }
    return rootDir;
}

/** 应用数据根目录（不含用户子目录） */
const APP_DATA_ROOT_DIR = getAppDataRootDir();

/** @deprecated 使用 APP_DATA_ROOT_DIR 或 getAppDataDir() */
const APP_DATA_DIR = APP_DATA_ROOT_DIR;

/**
 * 确保应用数据目录存在。
 */
function ensureAppDataDir() {
    const dir = getAppDataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[Paths] Created app data directory: ${dir}`);
    }
}

/**
 * 打包版首次运行清理：删除旧的全局数据（无用户子目录的旧数据）。
 * 只在新安装首次启动时执行（通过标记文件判断）。
 */
function cleanLegacyDataForPackagedApp() {
    const rootDir = getAppDataRootDir();
    const markFile = path.join(rootDir, '.packaged-v2');

    // 如果标记文件已存在，说明已经清理过
    if (fs.existsSync(markFile)) return;

    // 确保根目录存在
    if (!fs.existsSync(rootDir)) {
        fs.mkdirSync(rootDir, { recursive: true });
        fs.writeFileSync(markFile, new Date().toISOString());
        console.log('[Paths] Fresh install, no legacy data to clean.');
        return;
    }

    // 检查是否有旧的全局数据文件（直接放在根目录下的）
    const hasLegacyData = DATA_FILES.some(f => fs.existsSync(path.join(rootDir, f)));
    const hasLegacyBackup = fs.existsSync(path.join(rootDir, 'backups'));

    if (hasLegacyData || hasLegacyBackup) {
        console.log('[Paths] Packaged app first run: cleaning legacy global data...');

        for (const filename of [...DATA_FILES, 'backups']) {
            const legacyPath = path.join(rootDir, filename);
            if (fs.existsSync(legacyPath)) {
                try {
                    if (fs.statSync(legacyPath).isDirectory()) {
                        fs.rmSync(legacyPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(legacyPath);
                    }
                    console.log(`[Paths] Removed legacy: ${filename}`);
                } catch (e) {
                    console.error(`[Paths] Failed to remove ${filename}:`, e.message);
                }
            }
        }
    }

    // 写入标记文件
    fs.writeFileSync(markFile, new Date().toISOString());
    console.log('[Paths] Packaged app data reset complete.');
}

/**
 * 将旧位置（程序目录下的 __dirname）的数据文件迁移到新的 AppData 目录。
 * - 仅在首次运行时执行（新目录中尚无 data.json 时）
 * - 复制文件后删除旧文件
 */
function migrateFromLegacyDir(legacyDir) {
    const newDataFile = path.join(getAppDataDir(), 'data.json');

    // 如果新位置已有 data.json，说明已经迁移过，跳过
    if (fs.existsSync(newDataFile)) return;

    // 检查旧位置是否存在任何数据文件
    const hasLegacyData = DATA_FILES.some(f => fs.existsSync(path.join(legacyDir, f)));
    if (!hasLegacyData) return;

    ensureAppDataDir();

    console.log(`[Paths] Migrating data from ${legacyDir} → ${getAppDataDir()}`);

    for (const filename of DATA_FILES) {
        const src = path.join(legacyDir, filename);
        const dest = path.join(getAppDataDir(), filename);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
            try {
                fs.copyFileSync(src, dest);
                console.log(`[Paths] Migrated: ${filename}`);
                fs.unlinkSync(src);
                console.log(`[Paths] Removed legacy file: ${filename}`);
            } catch (e) {
                console.error(`[Paths] Migration failed for ${filename}:`, e.message);
            }
        }
    }

    // 迁移 backups 目录
    const legacyBackupDir = path.join(legacyDir, 'backups');
    const newBackupDir = path.join(getAppDataDir(), 'backups');
    if (fs.existsSync(legacyBackupDir) && !fs.existsSync(newBackupDir)) {
        try {
            fs.cpSync(legacyBackupDir, newBackupDir, { recursive: true });
            console.log(`[Paths] Migrated: backups/`);
            fs.rmSync(legacyBackupDir, { recursive: true, force: true });
            console.log(`[Paths] Removed legacy directory: backups/`);
        } catch (e) {
            console.error(`[Paths] Backup migration failed:`, e.message);
        }
    }

    console.log('[Paths] Migration complete.');
}

/**
 * 获取数据文件的绝对路径（在当前用户的 AppData 目录下）。
 * @param {string} filename - 文件名，如 'data.json'
 * @returns {string} 绝对路径
 */
function getDataPath(filename) {
    ensureAppDataDir();
    return path.join(getAppDataDir(), filename);
}

/** 快捷方法 */
function getDataFilePath()   { return getDataPath('data.json'); }
function getConfigPath()     { return getDataPath('config.json'); }
function getSettingsPath()   { return getDataPath('settings.json'); }
function getAgentLogPath()   { return getDataPath('agent-log.json'); }

function getBackupDir() {
    const backupDir = getDataPath('backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}

module.exports = {
    APP_DATA_DIR: APP_DATA_ROOT_DIR,  // 向后兼容
    APP_DATA_ROOT_DIR,
    getAppDataDir,
    getAppDataRootDir,
    ensureAppDataDir,
    migrateFromLegacyDir,
    cleanLegacyDataForPackagedApp,
    setActiveUsername,
    getDataPath,
    getDataFilePath,
    getConfigPath,
    getSettingsPath,
    getAgentLogPath,
    getBackupDir,
};
