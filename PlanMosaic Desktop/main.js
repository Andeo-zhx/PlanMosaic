if (process.env.NODE_ENV === 'production') {
    const noop = function() {};
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.warn = noop;
    // Keep console.error for critical error reporting
}

const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
const pmPaths = require('./paths.js');
const IS_TEST_MODE = process.env.PLANMOSAIC_TEST_MODE === '1';

const ALLOWED_EXTERNAL_HOSTS = new Set([
    'platform.deepseek.com',
    'api.duckduckgo.com',
    'html.duckduckgo.com'
]);

function safeOpenExternal(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            console.warn('[Security] Blocked non-HTTPS external URL:', url);
            return;
        }
        if (parsed.username || parsed.password) {
            console.warn('[Security] Blocked external URL with credentials:', url);
            return;
        }
        const hostname = pmPaths.normalizeHostname(parsed.hostname);
        if (!ALLOWED_EXTERNAL_HOSTS.has(hostname)) {
            console.warn('[Security] Blocked external URL not in whitelist:', url);
            return;
        }
        shell.openExternal(url);
    } catch (e) {
        console.warn('[Security] Blocked invalid URL:', url);
    }
}

function createDesktopShortcut() {
    if (process.platform !== 'win32') return;
    try {
        const desktop = path.join(app.getPath('desktop'), 'PlanMosaic.lnk');
        if (fs.existsSync(desktop)) return;
        const exePath = process.execPath;
        const appDir = path.dirname(exePath);
        const iconPath = path.join(appDir, 'resources', 'app', 'image4.ico');

        // Use a temporary .ps1 script file to avoid command injection via string interpolation
        const { execFileSync } = require('child_process');
        const os = require('os');
        const scriptContent = [
            '$ws = New-Object -ComObject WScript.Shell',
            '$s = $ws.CreateShortcut($env:PM_DESKTOP_PATH)',
            '$s.TargetPath = $env:PM_EXE_PATH',
            '$s.WorkingDirectory = $env:PM_APP_DIR',
            "$s.Description = 'PlanMosaic'",
            '$s.IconLocation = $env:PM_ICON_PATH',
            '$s.Save()'
        ].join('\n');

        const tmpScript = path.join(os.tmpdir(), 'pm-shortcut-' + Date.now() + '.ps1');
        fs.writeFileSync(tmpScript, scriptContent, 'utf8');

        try {
            execFileSync('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-File', tmpScript
            ], {
                stdio: 'ignore',
                timeout: 10000,
                env: {
                    ...process.env,
                    PM_DESKTOP_PATH: desktop,
                    PM_EXE_PATH: exePath,
                    PM_APP_DIR: appDir,
                    PM_ICON_PATH: iconPath
                }
            });
            console.log('[Shortcut] Desktop shortcut created with icon');
        } finally {
            try { fs.unlinkSync(tmpScript); } catch (_) {}
        }
    } catch (e) {
        console.error('[Shortcut] Failed to create shortcut:', e.message);
    }
}

// 安全 JSON 序列化：处理无效的 Unicode 代理对（lone surrogates）
// 将无效的代理对替换为 Unicode 替换字符 U+FFFD，避免 JSON.stringify 产生无效的转义序列
function safeJsonStringify(obj, indent) {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'string') {
            // 替换 lone surrogates (U+D800-U+DFFF) 为 U+FFFD
            return value.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
        }
        return value;
    }, indent);
}

// 清理字符串中的 lone surrogates，防止 .includes() 等操作抛出 RangeError
function sanitizeStr(s) { return (s || '').replace(/[\uD800-\uDFFF]/g, ''); }

// 加密 API Key 存储
function encryptApiKey(key) {
    if (!key || typeof key !== 'string') return key;
    try {
        if (safeStorage.isEncryptionAvailable()) {
            return 'enc:' + safeStorage.encryptString(key).toString('base64');
        }
    } catch (e) {
        console.warn('[Security] safeStorage encryption failed:', e.message);
    }
    return key;
}

function decryptApiKey(stored) {
    if (!stored || typeof stored !== 'string') return stored;
    try {
        if (stored.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(stored.slice(4), 'base64');
            return safeStorage.decryptString(buffer);
        }
    } catch (e) {
        console.warn('[Security] safeStorage decryption failed:', e.message);
    }
    return stored;
}

// ============ 配置 ============

const appConfig = {
    deepseek: {
        key: '',
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-v4-flash'
    },
    settings: {
        enableTimeout: false,
        timeoutMs: 30000,
        rejectUnauthorized: true
    }
};

function getCurrentApiUrl() {
    return appConfig.deepseek.url;
}

function getCurrentModelName() {
    return appConfig.deepseek.model;
}

function loadSettings() {
    try {
        const configPath = pmPaths.getConfigPath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(data);

            if (config.api?.deepseek?.key) {
                appConfig.deepseek.key = decryptApiKey(config.api.deepseek.key);
            }
            if (config.api?.deepseek?.baseUrl) {
                appConfig.deepseek.url = config.api.deepseek.baseUrl;
            }
            const dsModel = config.api?.deepseek?.model;
            if (typeof dsModel === 'string' && dsModel.trim() !== '') {
                appConfig.deepseek.model = dsModel;
            }

            const apiTimeout = config.timeouts?.apiTimeoutMs;
            if (typeof apiTimeout === 'number' && apiTimeout > 0) {
                appConfig.settings.timeoutMs = apiTimeout;
            }
            console.debug('[Config] Loaded from config.json');
        }

        const settingsPath = pmPaths.getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(data);
            appConfig.settings = {
                enableTimeout: true,
                timeoutMs: 30000,
                rejectUnauthorized: true,
                ...appConfig.settings,
                ...settings
            };
            console.log('[Settings] Loaded:', appConfig.settings);
        }

        if (!appConfig.deepseek.key && process.env.DEEPSEEK_API_KEY) {
            appConfig.deepseek.key = process.env.DEEPSEEK_API_KEY;
            console.debug('[Config] Loaded DeepSeek API key from environment');
        }

        if (!appConfig.deepseek.key || appConfig.deepseek.key === 'YOUR_DEEPSEEK_API_KEY_HERE') {
            console.warn('[Config] WARNING: DeepSeek API key not configured!');
        }
    } catch (e) {
        console.error('[Config] Load error:', e);
    }
}

function migrateRootDataToUserIfNeeded(username) {
    if (typeof username !== 'string' || !username.trim()) return;
    const targetDir = pmPaths.getAppDataDir(username);
    const rootDir = pmPaths.getAppDataRootDir();
    if (!targetDir || !rootDir || targetDir === rootDir) return;

    const filesToMigrate = ['data.json', 'config.json', 'settings.json', 'agent-log.json', 'python-backend-port.json'];
    try {
        fs.mkdirSync(targetDir, { recursive: true });
        for (const filename of filesToMigrate) {
            const src = path.join(rootDir, filename);
            const dest = path.join(targetDir, filename);
            if (fs.existsSync(src) && !fs.existsSync(dest)) {
                fs.copyFileSync(src, dest);
                console.log(`[Paths] Copied root ${filename} to user dir for ${username}`);
            }
        }

        const rootBackupDir = path.join(rootDir, 'backups');
        const userBackupDir = path.join(targetDir, 'backups');
        if (fs.existsSync(rootBackupDir) && !fs.existsSync(userBackupDir)) {
            fs.cpSync(rootBackupDir, userBackupDir, { recursive: true });
            console.log(`[Paths] Copied root backups to user dir for ${username}`);
        }
    } catch (error) {
        console.warn('[Paths] Failed to copy root data into user dir:', error.message);
    }
}

function saveSettings(settings) {
    try {
        appConfig.settings = settings;
        const settingsPath = pmPaths.getSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('[Settings] Saved:', appConfig.settings);
    } catch (e) {
        console.error('[Settings] Save error:', e);
    }
}

// 首次运行：从程序目录迁移旧数据到 AppData
pmPaths.migrateFromLegacyDir(__dirname);

// 打包版首次运行：清空旧的全局数据
pmPaths.cleanLegacyDataForPackagedApp();

loadSettings();

// ============ 数据文件操作（保留用于 fallback 和窗口主题加载）============

function getDataFilePath() {
    return pmPaths.getDataFilePath();
}

function getBackupDir() {
    return pmPaths.getBackupDir();
}

function getAgentLogPath() {
    return pmPaths.getAgentLogPath();
}

function tryRestoreJsonFromBackup(filename) {
    try {
        const backupDir = getBackupDir();
        if (!backupDir || !fs.existsSync(backupDir)) return null;
        const prefix = filename.split('.')[0] + '_';
        const candidates = fs.readdirSync(backupDir)
            .filter(name => name.startsWith(prefix) && name.endsWith('.json'))
            .map(name => ({
                path: path.join(backupDir, name),
                time: fs.statSync(path.join(backupDir, name)).mtimeMs
            }))
            .sort((a, b) => b.time - a.time);

        for (const candidate of candidates) {
            try {
                const restored = JSON.parse(fs.readFileSync(candidate.path, 'utf8'));
                console.warn(`[Data] Restored ${filename} from backup: ${candidate.path}`);
                return restored;
            } catch (_) {}
        }
    } catch (error) {
        console.warn('[Data] Failed to restore backup:', error.message);
    }
    return null;
}

function readScheduleData() {
    try {
        const content = fs.readFileSync(getDataFilePath(), 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error instanceof SyntaxError) {
            const srcPath = getDataFilePath();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = srcPath + '.corrupted.' + timestamp;
            try {
                fs.copyFileSync(srcPath, backupPath);
                console.error('[Data] Schedule data file corrupted, backed up to:', backupPath);
            } catch (backupErr) {
                console.error('[Data] Failed to backup corrupted file:', backupErr);
            }
            const restored = tryRestoreJsonFromBackup('data.json');
            if (restored) {
                try {
                    fs.writeFileSync(srcPath, safeJsonStringify(restored, 2), 'utf8');
                } catch (restoreErr) {
                    console.warn('[Data] Failed to rewrite restored schedule data:', restoreErr.message);
                }
                return restored;
            }
            return { startDate: '', endDate: '', schedules: {}, _corrupted: true };
        }
        return { startDate: '', endDate: '', schedules: {} };
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireFileLock(lockPath, timeoutMs = 3000, staleMs = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const fd = fs.openSync(lockPath, 'wx');
            fs.closeSync(fd);
            return;
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
            try {
                const stat = fs.statSync(lockPath);
                if (Date.now() - stat.mtimeMs > staleMs) {
                    fs.unlinkSync(lockPath);
                    continue;
                }
            } catch (statError) {
                if (statError.code === 'ENOENT') {
                    continue;
                }
                throw statError;
            }
            await sleep(100);
        }
    }
    throw new Error(`Timed out acquiring file lock for ${path.basename(lockPath)}`);
}

// 原子写入文件：临时文件 + fsync + rename，并使用 .lock 文件防并发
async function writeAtomicJson(targetPath, data) {
    const lockPath = targetPath + '.lock';
    const tmpPath = targetPath + '.tmp';
    await acquireFileLock(lockPath);
    try {
        fs.writeFileSync(tmpPath, safeJsonStringify(data, 2), 'utf8');
        const fd = fs.openSync(tmpPath, 'r+');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmpPath, targetPath);
    } finally {
        try { fs.unlinkSync(lockPath); } catch(e) {}
    }
}

async function writeScheduleData(data) {
    createBackup('data.json');
    const targetPath = getDataFilePath();
    try {
        await writeAtomicJson(targetPath, data);
    } catch (e) {
        if (e.code === 'ENOSPC') {
            console.error('Disk full! Cannot save schedule data.');
            const win = BrowserWindow.getAllWindows()[0];
            if (win && !win.isDestroyed()) {
                win.webContents.send('disk-full-error', { operation: 'save-schedule' });
            }
        }
        throw e;
    }
}

// 创建数据备份
function createBackup(filename) {
    try {
        const sourcePath = pmPaths.getDataPath(filename);
        if (!fs.existsSync(sourcePath)) {
            return;
        }

        const backupDir = getBackupDir();
        const now = new Date();
        const timestamp = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0') + '_' +
            String(now.getMilliseconds()).padStart(3, '0') + '000';
        const backupFilename = `${filename.split('.')[0]}_${timestamp}.json`;
        const backupPath = path.join(backupDir, backupFilename);

        fs.copyFileSync(sourcePath, backupPath);
        console.debug(`[Backup] Created: ${backupFilename}`);

        // 清理旧备份（只保留最近10个）
        cleanOldBackups(filename.split('.')[0]);
    } catch (e) {
        console.error('[Backup] Error:', e);
    }
}

// 清理旧备份
function cleanOldBackups(filePrefix) {
    try {
        const backupDir = getBackupDir();
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith(filePrefix) && f.endsWith('.json'))
            .map(f => {
                const fpath = path.join(backupDir, f);
                const stat = fs.statSync(fpath);
                return {
                    name: f,
                    path: fpath,
                    time: stat.mtime.getTime(),
                    size: stat.size
                };
            })
            .sort((a, b) => b.time - a.time);

        const MAX_SIZE = 50 * 1024 * 1024;
        const MAX_COUNT = 10;

        const toKeep = files.slice(0, MAX_COUNT);
        let totalSize = toKeep.reduce((sum, f) => sum + f.size, 0);

        for (const f of files.slice(MAX_COUNT)) {
            try {
                fs.unlinkSync(f.path);
                console.log(`[Backup] Deleted old backup: ${f.name}`);
            } catch (e) {
                console.error(`[Backup] Failed to delete ${f.name}:`, e);
            }
        }

        if (totalSize > MAX_SIZE) {
            for (let i = toKeep.length - 1; i >= 0; i--) {
                if (totalSize <= MAX_SIZE) break;
                totalSize -= toKeep[i].size;
                try {
                    fs.unlinkSync(toKeep[i].path);
                    console.log(`[Backup] Deleted oversized backup: ${toKeep[i].name}`);
                } catch (e) {
                    console.error(`[Backup] Failed to delete ${toKeep[i].name}:`, e);
                }
            }
        }
    } catch (e) {
        console.error('[Backup] Clean error:', e);
    }
}

function readAgentHistory() {
    try {
        const content = fs.readFileSync(getAgentLogPath(), 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error instanceof SyntaxError) {
            const srcPath = getAgentLogPath();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = srcPath + '.corrupted.' + timestamp;
            try {
                fs.copyFileSync(srcPath, backupPath);
                console.error('[Data] Agent history file corrupted, backed up to:', backupPath);
            } catch (backupErr) {
                console.error('[Data] Failed to backup corrupted file:', backupErr);
            }
            return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '', _corrupted: true };
        }
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
}

async function writeAgentHistory(data) {
    await writeAtomicJson(getAgentLogPath(), data);
}

// ============ 对话压缩与归档 ============

// 压缩对话为原本的5%
function compressConversation(conversation) {
    if (!conversation || !conversation.content) return conversation;

    const content = conversation.content;
    let compressed = content;

    // 移除emoji和装饰性符号（保留核心意思）
    compressed = compressed.replace(/[🎉📅📊💡⚠️😊😂😅🙄🐟💪⏰📚🏃😴🔬📝☀️🚶📌🟢🍽️]/g, '');

    // 移除markdown标记
    compressed = compressed.replace(/\*\*/g, '').replace(/\*/g, '');
    compressed = compressed.replace(/#{1,6}\s/g, '');

    // 移除多余的空格和换行
    compressed = compressed.replace(/\n{3,}/g, '\n').replace(/\s{2,}/g, ' ').trim();

    // 提取核心信息（简单的关键词匹配）
    const corePatterns = [
        { pattern: /我的分析[:：][\s\S]*?(?=\n\n|$)/gi, replacement: '[分析]' },
        { pattern: /建议[:：][\s\S]*?(?=\n\n|$)/gi, replacement: '[建议]' },
        { pattern: /注意[:：][\s\S]*?(?=\n\n|$)/gi, replacement: '[注意]' }
    ];

    corePatterns.forEach(p => {
        compressed = compressed.replace(p.pattern, p.replacement);
    });

    // 限制长度为原本的5%左右（最少保留20字符）
    const targetLength = Math.max(20, Math.floor(content.length * 0.05));
    if (compressed.length > targetLength) {
        compressed = compressed.substring(0, targetLength) + '...';
    }

    return {
        ...conversation,
        content: compressed,
        compressed: true
    };
}

// 归档并压缩对话
function archiveAndCompress(history) {
    const conversations = history.conversations || [];

    if (conversations.length === 0) {
        return history;
    }

    // 压缩现有对话
    const compressed = conversations.map(compressConversation);

    // 如果对话超过50条，将旧的移到归档（与画像生成阈值一致）
    const archived = history.archivedConversations || [];
    const activeLimit = 50;

    if (compressed.length > activeLimit) {
        const toArchive = compressed.slice(0, compressed.length - activeLimit);
        const toKeep = compressed.slice(compressed.length - activeLimit);

        return {
            ...history,
            conversations: toKeep,
            archivedConversations: [...archived, ...toArchive]
        };
    }

    return {
        ...history,
        conversations: compressed
    };
}

// ============ 网络测试（检查 Python 后端连接）============

async function testNetworkConnection() {
    console.log('=================================================');
    console.log('[Network Test] Testing Python backend connection...');
    console.log('[Network Test] Backend URL:', PYTHON_BACKEND_URL);

    try {
        const result = await pythonApi('GET', '/health');
        console.log('[Network Test] Python backend is healthy!');
        return true;
    } catch (error) {
        console.error('[Network Test] Python backend not reachable:', error.message);
        console.log('[Network Test] The application will still start, but AI features may not work.');
        return false;
    }
}

// ============ Python 后端进程管理 ============

let pythonProcess = null;
let pythonRestartCount = 0;
let pythonTotalRestarts = 0; // per-app-session total, never resets
let pythonIsRestarting = false;
const PYTHON_MAX_RESTARTS = 3;
let PYTHON_BACKEND_HOST = '127.0.0.1';
let PYTHON_BACKEND_PORT = 8080;
let PYTHON_BACKEND_URL = `http://${PYTHON_BACKEND_HOST}:${PYTHON_BACKEND_PORT}`;

/**
 * 清理占用目标端口的孤立 Python 进程。
 * 当用户曾直接 kill 掉 Electron / 崩溃退出时，可能会有上一轮的 Python
 * 后端依然占据 8080，导致新启动的 backend.server 无法 bind。
 * 在启动新的 Python 后端前，主动 kill 端口 8080~PORT+20 范围内
 * 的孤立 Python 进程（仅在端口确实被占用时）。
 */
function cleanupOrphanPythonProcesses() {
    if (process.platform !== 'win32') return;
    const { execSync } = require('child_process');
    try {
        const out = execSync('netstat -ano -p TCP', { encoding: 'utf8', timeout: 5000 });
        const lines = out.split(/\r?\n/);
        const targetPorts = new Set();
        for (const line of lines) {
            const m = line.match(/^\s*TCP\s+127\.0\.0\.1:(\d+)\s+[\d.:]+\s+LISTENING\s+(\d+)/i);
            if (!m) continue;
            const port = parseInt(m[1], 10);
            if (port >= PYTHON_BACKEND_PORT && port <= PYTHON_BACKEND_PORT + 20) {
                targetPorts.add(parseInt(m[2], 10));
            }
        }
        if (targetPorts.size === 0) return 0;

        const psOut = execSync('tasklist /FI "IMAGENAME eq python.exe" /FO CSV /NH', { encoding: 'utf8', timeout: 5000 });
        const pids = new Set();
        for (const line of psOut.split(/\r?\n/)) {
            const parts = line.split('","');
            if (parts.length < 2) continue;
            const name = parts[0].replace(/^"/, '');
            const pidStr = parts[1].replace(/"$/, '');
            if (name.toLowerCase() !== 'python.exe') continue;
            const pid = parseInt(pidStr, 10);
            if (!Number.isNaN(pid)) pids.add(pid);
        }

        let killed = 0;
        for (const pid of targetPorts) {
            if (!pids.has(pid)) continue;
            try {
                process.kill(pid, 'SIGKILL');
                console.log(`[Python Backend] Killed orphan python pid=${pid}`);
                killed++;
            } catch (e) {
                console.warn(`[Python Backend] Failed to kill orphan pid=${pid}: ${e.message}`);
            }
        }
        return killed;
    } catch (e) {
        console.warn('[Python Backend] Orphan cleanup skipped:', e.message);
        return 0;
    }
}

/**
 * 读取 Python 后端启动时写入的端口文件，获取实际绑定的端口。
 * 如果后端因 8080 被占用而自动 fallback 到 8081+ ，主进程必须读取这个
 * 文件并更新 PYTHON_BACKEND_URL，否则会一直连不上。
 */
function readBackendPortInfo() {
    try {
        const portPath = pmPaths.getPortInfoPath();
        if (!portPath || !fs.existsSync(portPath)) return null;
        const data = JSON.parse(fs.readFileSync(portPath, 'utf8'));
        if (typeof data.port === 'number' && data.port > 0 && data.port <= 65535) {
            return data;
        }
    } catch (e) {
        console.warn('[Python Backend] Failed to read port info file:', e.message);
    }
    return null;
}

function startPythonBackend() {
    pythonIsRestarting = true;
    const nextRestartAttempt = pythonRestartCount + 1;

    // 启动前先清理可能残留的孤立 Python 进程（避免端口被占）
    const killed = cleanupOrphanPythonProcesses();
    if (killed > 0) {
        console.log(`[Python Backend] Cleaned up ${killed} orphan python process(es) before start`);
    }

    return new Promise((resolve, reject) => {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

        const child = spawn(pythonCmd, ['-m', 'backend.server'], {
            cwd: app.isPackaged ? path.join(__dirname, '..') : __dirname,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                DEEPSEEK_API_KEY: appConfig.deepseek.key || process.env.DEEPSEEK_API_KEY || '',
                MODEL_NAME: appConfig.deepseek.model || process.env.MODEL_NAME || '',
                PLANMOSAIC_ACTIVE_USERNAME: pmPaths.getActiveUsername() || ''
            }
        });
        pythonProcess = child;

        child.stdout.on('data', (data) => {
            console.log(`[Python Backend] ${data.toString().trim()}`);
        });
        child.stderr.on('data', (data) => {
            console.error(`[Python Backend] ${data.toString().trim()}`);
        });
        child.on('error', (err) => {
            console.error('[Python Backend] Failed to start:', err.message);
            const win = BrowserWindow.getAllWindows()[0];
            if (win && !win.isDestroyed()) {
                win.webContents.send('python-status', { status: 'error', message: 'AI 服务未启动，部分功能不可用' });
            }
            if (pythonProcess === child) {
                pythonProcess = null;
            }
            pythonIsRestarting = false;
            reject(err);
        });
        child.on('exit', (code) => {
            console.log(`[Python Backend] Exit code: ${code}`);
            if (pythonProcess === child) {
                pythonProcess = null;
            }
            if (code !== 0 && pythonRestartCount < PYTHON_MAX_RESTARTS) {
                pythonTotalRestarts++;
                pythonRestartCount = nextRestartAttempt;
                console.log(`[Python Backend] Restarting (${pythonRestartCount}/${PYTHON_MAX_RESTARTS}), total=${pythonTotalRestarts}...`);
                const win = BrowserWindow.getAllWindows()[0];
                if (win && !win.isDestroyed()) {
                    win.webContents.send('python-status', { status: 'restarting' });
                }
                setTimeout(() => {
                    startPythonBackend().then(() => {
                        pythonRestartCount = 0;
                    }).catch(err => {
                        console.error('[Python Backend] Restart failed:', err.message);
                    });
                }, 2000 * Math.pow(2, pythonRestartCount - 1));
            } else if (pythonRestartCount >= PYTHON_MAX_RESTARTS) {
                console.error('[Python Backend] Max restarts exceeded, giving up');
                const win = BrowserWindow.getAllWindows()[0];
                if (win) {
                    win.webContents.send('python-status', { status: 'error', message: 'AI 服务多次启动失败，请检查 Python 环境' });
                    win.webContents.send('python-backend-error', {
                        error: 'Python 后端进程多次启动失败',
                        exitCode: code,
                        restarts: pythonRestartCount
                    });
                }
                pythonIsRestarting = false;
            }
        });

        // Poll for health check; also try to discover the actual port from
        // the port info file so we support auto-fallback (8081, 8082, ...).
        let attempts = 0;
        const maxAttempts = 30;
        const interval = setInterval(async () => {
            if (pythonProcess !== child) {
                clearInterval(interval);
                return;
            }
            attempts++;
            const portInfo = readBackendPortInfo();
            if (portInfo && portInfo.port && portInfo.port !== PYTHON_BACKEND_PORT) {
                PYTHON_BACKEND_PORT = portInfo.port;
                PYTHON_BACKEND_HOST = portInfo.host || '127.0.0.1';
                PYTHON_BACKEND_URL = `http://${PYTHON_BACKEND_HOST}:${PYTHON_BACKEND_PORT}`;
                console.log(`[Python Backend] Discovered actual backend URL: ${PYTHON_BACKEND_URL}`);
            }
            try {
                const result = await new Promise((res) => {
                    http.get(`${PYTHON_BACKEND_URL}/health`, (resp) => {
                        let data = '';
                        resp.on('data', chunk => data += chunk);
                        resp.on('end', () => res(data));
                    }).on('error', () => res(null));
                });

                if (result) {
                    clearInterval(interval);
                    console.log('[Python Backend] Ready!');
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('python-status', { status: 'ready' });
                    }
                    pythonIsRestarting = false;
                    resolve();
                }
            } catch (e) {}

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                pythonIsRestarting = false;
                reject(new Error('Python backend startup timed out'));
            }
        }, 500);
    });
}

function stopPythonBackend() {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
        console.log('[Python Backend] Stopped');
    }
}

// ============ HTTP 客户端（调用 Python 后端）============

function buildPythonApiHeaders(bodyStr) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Control-Token': CONTROL_AUTH_TOKEN
    };
    if (bodyStr) {
        headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    return headers;
}

function pythonApi(method, path, body) {
    if (pythonIsRestarting) {
        return Promise.resolve({ error: '服务正在重启，请稍候' });
    }
    return new Promise((resolve, reject) => {
        const url = new URL(path, PYTHON_BACKEND_URL);
        const bodyStr = body ? JSON.stringify(body) : undefined;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            timeout: 30000,
            headers: buildPythonApiHeaders(bodyStr)
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
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时（30秒无响应）'));
        });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function syncActiveUserToPython() {
    const username = pmPaths.getActiveUsername() || null;
    try {
        const res = await pythonApi('POST', '/api/active-username', { username });
        console.log(`[ActiveUsername] Python backend synced user=${res && res.username}, configPath=${res && res.configPath}`);
        return { success: true, response: res };
    } catch (error) {
        console.warn('[ActiveUsername] Failed to sync Python backend:', error.message);
        return { success: false, error: error.message };
    }
}

// ============ IPC Handlers ============

// 设置当前活跃用户名（用于按账号隔离数据目录）
ipcMain.handle('set-active-user', async (event, username) => {
    if (username === null || username === undefined || username === '') {
        pmPaths.setActiveUsername(null);
        loadSettings();
        await syncActiveUserToPython();
        return { success: true };
    }

    if (typeof username !== 'string' || username.trim() === '') {
        return { success: false, error: '无效的用户名' };
    }

    const result = pmPaths.setActiveUsername(username);
    if (result === null || result === undefined) {
        return { success: false, error: '无效的用户名' };
    }
    migrateRootDataToUserIfNeeded(result);
    console.log(`[Paths] Active user set to: ${username || '(none)'}`);
    loadSettings();
    await syncActiveUserToPython();
    if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('account-switched', { username });
    }
    return { success: true };
});

// ---- 委托给 Python 后端的 IPC 处理器 ----

// agent-chat

// TODO: 未来迭代在主进程中添加图片大小检查 — 若 buffer > 10MB，使用 Electron nativeImage 或 sharp 缩放至 max 4096x4096，避免传递超大图片导致 OOM
ipcMain.handle('agent-chat', async (event, data) => {
    try {
        await syncActiveUserToPython();
        return await pythonApi('POST', '/api/agent-chat', data);
    } catch (error) {
        console.error('[agent-chat] Error:', error);
        return { error: error.message };
    }
});

ipcMain.handle('deep-planning-chat', async (event, data) => {
    try {
        await syncActiveUserToPython();
        return await pythonApi('POST', '/api/deep-planning-chat', data);
    } catch (error) {
        console.error('[deep-planning-chat] Error:', error);
        return { error: error.message };
    }
});

ipcMain.handle('deep-planning-profile', async (event, data) => {
    try {
        await syncActiveUserToPython();
        return await pythonApi('POST', '/api/deep-planning-profile', data);
    } catch (error) {
        console.error('[deep-planning-profile] Error:', error);
        return { success: false, error: error.message, profileExtract: { longTermGoals: [], values: [], strengths: [], constraints: [] } };
    }
});

// agent-chat-stream (SSE)
let activeAgentStreamReq = null;
let activeAgentStreamHeartbeat = null;

ipcMain.handle('agent-chat-stream', async (event, data) => {
    return new Promise((resolve) => {
        if (activeAgentStreamReq) {
            activeAgentStreamReq.destroy();
            if (activeAgentStreamHeartbeat) clearInterval(activeAgentStreamHeartbeat);
        }
        const url = new URL('/api/agent-chat-stream', PYTHON_BACKEND_URL);
        const bodyStr = JSON.stringify(data);

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            timeout: 120000,
            headers: buildPythonApiHeaders(bodyStr)
        };

        let accumulatedContent = '';
        let finalResponse = null;
        let lastDataTime = performance.now();
        let doneSent = false;
        let resultReceived = false;
        let streamWindow = null;

        const model = (data && data.model) || '';
        const heartbeatThreshold = 45000;

        const clearHeartbeat = () => {
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
            if (visibilityCleanup) visibilityCleanup();
            activeAgentStreamHeartbeat = null;
        };

        let heartbeatTimer = setInterval(() => {
            if (performance.now() - lastDataTime > heartbeatThreshold) {
                req.destroy();
                clearHeartbeat();
                activeAgentStreamReq = null;
                event.sender.send('agent-stream-error', { error: 'Heartbeat timeout: no data for ' + (heartbeatThreshold / 1000) + 's' });
                resolve({ error: 'Heartbeat timeout: no data for 45s' });
            }
        }, 15000);
        activeAgentStreamHeartbeat = heartbeatTimer;

        let visibilityCleanup = null;
        try {
            streamWindow = BrowserWindow.fromWebContents(event.sender);
            if (streamWindow && !streamWindow.isDestroyed()) {
                const onHide = () => {
                    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
                };
                const onShow = () => {
                    if (!heartbeatTimer) {
                        lastDataTime = performance.now();
                        heartbeatTimer = setInterval(() => {
                            if (performance.now() - lastDataTime > heartbeatThreshold) {
                                req.destroy();
                                clearHeartbeat();
                                activeAgentStreamReq = null;
                                event.sender.send('agent-stream-error', { error: 'Heartbeat timeout: no data for ' + (heartbeatThreshold / 1000) + 's' });
                                resolve({ error: 'Heartbeat timeout: no data for 45s' });
                            }
                        }, 15000);
                        activeAgentStreamHeartbeat = heartbeatTimer;
                    }
                };
                streamWindow.on('hide', onHide);
                streamWindow.on('show', onShow);
                visibilityCleanup = () => {
                    if (streamWindow && !streamWindow.isDestroyed()) {
                        streamWindow.removeListener('hide', onHide);
                        streamWindow.removeListener('show', onShow);
                    }
                };
            }
        } catch (e) {
            console.warn('[agent-chat-stream] Failed to setup visibility listener:', e.message);
        }

        const req = http.request(options, (res) => {
            let byteBuffer = Buffer.alloc(0);
            let lineBuffer = '';
            const MAX_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB max buffer
            var failedCount = 0;
            res.on('data', (chunk) => {
                lastDataTime = performance.now();
                byteBuffer = Buffer.concat([byteBuffer, chunk]);

                // Prevent unbounded buffer growth
                if (byteBuffer.length > MAX_BUFFER_SIZE) {
                    console.warn('[agent-chat-stream] Buffer exceeded max size, truncating');
                    byteBuffer = byteBuffer.slice(byteBuffer.length - MAX_BUFFER_SIZE / 2);
                }

                let safeLen = byteBuffer.length;
                for (let i = 0; i < 3 && safeLen - 1 - i >= 0; i++) {
                    const idx = safeLen - 1 - i;
                    const b = byteBuffer[idx];
                    if (b < 0x80) break;
                    if ((b & 0xC0) === 0x80) continue;
                    const needBytes = (b & 0xE0) === 0xC0 ? 2 : (b & 0xF0) === 0xE0 ? 3 : (b & 0xF8) === 0xF0 ? 4 : 0;
                    if (needBytes > 0 && i + 1 < needBytes) {
                        safeLen = idx;
                    }
                    break;
                }

                const text = lineBuffer + byteBuffer.slice(0, safeLen).toString('utf-8');
                byteBuffer = byteBuffer.slice(safeLen);

                const lines = text.split('\n');
                lineBuffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const eventData = line.slice(6);
                        if (eventData === '[DONE]') {
                            clearHeartbeat();
                            doneSent = true;
                            activeAgentStreamReq = null;
                            event.sender.send('agent-stream-done');
                            resolve({
                                response: {
                                    content: accumulatedContent,
                                    proposal: finalResponse?.proposal || null,
                                    trace: finalResponse?.trace || [],
                                },
                                shouldRefresh: finalResponse?.shouldRefresh || false
                            });
                            return;
                        }
                        try {
                            const parsed = JSON.parse(eventData);
                            if (parsed.type === 'content' || parsed.type === 'reasoning') {
                                event.sender.send('agent-stream-chunk', parsed);
                                if (parsed.type === 'content') {
                                    accumulatedContent += parsed.content;
                                }
                            } else if (parsed.type === 'status') {
                                event.sender.send('agent-stream-status', parsed);
                            } else if (parsed.type === 'retry') {
                                event.sender.send('agent-stream-chunk', parsed);
                                accumulatedContent = '';
                            } else if (parsed.type === 'self_check') {
                                event.sender.send('agent-stream-self-check', parsed);
                            } else if (parsed.type === 'result') {
                                resultReceived = true;
                                finalResponse = parsed;
                            }
                        } catch (e) {
                            failedCount++;
                            if (failedCount <= 3) {
                                console.warn('[Agent SSE] JSON parse failed (' + failedCount + '):', eventData.substring(0, 200));
                            }
                            if (failedCount >= 5) {
                                console.error('[Agent SSE] Too many JSON parse failures, forwarding error to renderer');
                                if (streamWindow && !streamWindow.isDestroyed()) {
                                    streamWindow.webContents.send('agent-stream-chunk', {
                                        type: 'error',
                                        content: 'SSE 数据解析失败，请重试',
                                        status: 'error'
                                    });
                                }
                                failedCount = 0;
                            }
                        }
                    }
                }
            });
            res.on('end', () => {
                clearHeartbeat();
                activeAgentStreamReq = null;
                if (!doneSent) {
                    event.sender.send('agent-stream-done');
                }
                resolve({
                    response: {
                        content: accumulatedContent,
                        proposal: finalResponse?.proposal || null,
                        trace: finalResponse?.trace || [],
                    },
                    shouldRefresh: finalResponse?.shouldRefresh || false
                });
            });
            res.on('error', (err) => {
                clearHeartbeat();
                activeAgentStreamReq = null;
                resolve({ error: err.message });
            });
        });
        req.on('error', (err) => {
            clearHeartbeat();
            activeAgentStreamReq = null;
            resolve({ error: err.message });
        });
        req.on('timeout', () => {
            clearHeartbeat();
            activeAgentStreamReq = null;
            req.destroy();
            event.sender.send('agent-stream-error', { error: '请求超时（2分钟无响应）' });
            resolve({ error: '请求超时（2分钟无响应）' });
        });
        req.write(bodyStr);
        req.end();
        activeAgentStreamReq = req;
    });
});

ipcMain.handle('cancel-agent-stream', async () => {
    if (activeAgentStreamReq) {
        activeAgentStreamReq.destroy();
        activeAgentStreamReq = null;
    }
    if (activeAgentStreamHeartbeat) {
        clearInterval(activeAgentStreamHeartbeat);
        activeAgentStreamHeartbeat = null;
    }
    return { success: true };
});

// agent-approve
ipcMain.handle('agent-approve', async (event, proposal) => {
    try {
        return await pythonApi('POST', '/api/agent-approve', proposal);
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// schedule data
ipcMain.handle('get-schedule-data', async () => {
    try {
        return await pythonApi('GET', '/api/schedule-data');
    } catch (error) {
        return { startDate: '', endDate: '', schedules: {} };
    }
});

ipcMain.handle('save-schedule-data', async (event, data) => {
    try {
        return await pythonApi('POST', '/api/save-schedule', data);
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-startup-scan', async () => {
    try {
        return await pythonApi('GET', '/api/startup-scan');
    } catch (error) {
        return { todaySchedule: null, yesterdayIncompleteTasks: [], today: '' };
    }
});

// agent history
ipcMain.handle('get-agent-history', async () => {
    try {
        return await pythonApi('GET', '/api/agent-history');
    } catch (error) {
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
});

ipcMain.handle('save-agent-history', async (event, data) => {
    try {
        return await pythonApi('POST', '/api/agent-save', data);
    } catch (error) {
        const msg = (error && error.message) || '';
        const isVersionConflict = /409|版本冲突|conflict/i.test(msg);
        const result = { success: false, error: msg };
        if (isVersionConflict) result.conflict = true;
        return result;
    }
});

ipcMain.handle('generate-react-log', async (event, data, full = false) => {
    try {
        const query = full ? '?full=true' : '';
        return await pythonApi('POST', `/api/generate-react-log${query}`, data);
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('archive-conversations', async () => {
    try {
        return await pythonApi('POST', '/api/agent-archive');
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('clear-conversations', async () => {
    try {
        return await pythonApi('POST', '/api/agent-clear');
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Local (offline) data access — bypass Python backend
ipcMain.handle('get-schedule-data-local', async () => {
    try {
        return readScheduleData();
    } catch (error) {
        return { startDate: '', endDate: '', schedules: {} };
    }
});

ipcMain.handle('save-schedule-data-local', async (event, data) => {
    try {
        await writeScheduleData(data);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-agent-history-local', async () => {
    try {
        return readAgentHistory();
    } catch (error) {
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
});

// ============ API Key 管理 API ============

const API_KEY_INFO = {
    deepseek: {
        name: 'DeepSeek',
        getUrl: 'https://platform.deepseek.com/api_keys',
        signupUrl: 'https://platform.deepseek.com/'
    }
};

ipcMain.handle('get-api-keys', async () => {
    return {
        deepseek: {
            key: appConfig.deepseek.key ? maskApiKey(appConfig.deepseek.key) : '',
            hasKey: !!appConfig.deepseek.key && appConfig.deepseek.key !== 'YOUR_DEEPSEEK_API_KEY_HERE',
            baseUrl: appConfig.deepseek.url,
            model: appConfig.deepseek.model
        }
    };
});

ipcMain.handle('set-api-key', async (event, provider, key) => {
    if (provider !== 'deepseek') {
        return { success: false, error: 'Invalid provider' };
    }
    if (typeof key !== 'string' || key.trim() === '' || key.length < 20) {
        return { success: false, error: 'Invalid API key' };
    }
    try {
        const configPath = pmPaths.getConfigPath();
        let config = {};
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(data);
        }

        config.api = config.api || {};
        config.api.deepseek = config.api.deepseek || {};
        config.api.deepseek.key = encryptApiKey(key);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        appConfig.deepseek.key = key;

        console.log(`[Config] DeepSeek API key updated`);

        const result = { success: true };

        event.sender.send('api-key-configured', { provider });

        pythonApi('POST', '/api/config', {
            api: { deepseek: { key } }
        }).then(() => {
            console.log(`[Config] Backend reloaded with new DeepSeek API key`);
        }).catch(err => {
            console.warn(`[Config] Backend not available for hot-reload (will use key on next restart):`, err.message);
            result.warning = '后端不在运行，配置将在下次启动时生效';
        });

        return result;
    } catch (error) {
        console.error('[Config] Set API key error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-api-key-url', async (event, provider) => {
    const info = API_KEY_INFO[provider];
    if (info) {
        safeOpenExternal(info.getUrl);
        return { success: true };
    }
    return { success: false, error: 'Unknown provider' };
});

ipcMain.handle('validate-api-key', async (event, provider) => {
    try {
        const apiKey = appConfig.deepseek.key;
        const apiUrl = appConfig.deepseek.url;
        const model = appConfig.deepseek.model;

        if (!apiKey || apiKey === 'YOUR_DEEPSEEK_API_KEY_HERE') {
            return {
                valid: false,
                error: 'API Key 未配置',
                info: API_KEY_INFO[provider]
            };
        }

        const testResult = await testApiKeyConnection(apiKey, apiUrl, model);
        return testResult;
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            info: API_KEY_INFO[provider]
        };
    }
});

ipcMain.handle('save-react-file', async (event, { content, defaultName }) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出 ReAct 日志',
            defaultPath: defaultName || 'ReAct_日志.txt',
            filters: [
                { name: '文本文件', extensions: ['txt'] },
                { name: 'Markdown 文件', extensions: ['md'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, cancelled: true };
        }

        fs.writeFileSync(result.filePath, content, 'utf-8');
        return { success: true, filePath: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

function maskApiKey(key) {
    if (!key || key.length < 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

async function testApiKeyConnection(apiKey, apiUrl, model) {
    return new Promise((resolve) => {
        const url = new URL(apiUrl);
        const postData = JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 1
        });

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: true
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve({ valid: true });
                } else if (res.statusCode === 401) {
                    resolve({
                        valid: false,
                        error: 'API Key 无效或已过期',
                        statusCode: res.statusCode
                    });
                } else if (res.statusCode === 429) {
                    resolve({
                        valid: false,
                        error: 'API 调用频率超限，请稍后再试',
                        statusCode: res.statusCode
                    });
                } else if (res.statusCode === 402 || res.statusCode === 403) {
                    resolve({
                        valid: false,
                        error: '账户余额不足或权限不足',
                        statusCode: res.statusCode
                    });
                } else {
                    resolve({
                        valid: false,
                        error: `API 返回错误: ${res.statusCode}`,
                        statusCode: res.statusCode
                    });
                }
            });
        });

        req.on('error', (e) => {
            resolve({
                valid: false,
                error: `网络连接失败: ${e.message}`
            });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({
                valid: false,
                error: '连接超时'
            });
        });

        req.write(postData);
        req.end();
    });
}

// ============ 窗口管理 ============

function createWindow() {
    // 根据已保存的主题设置窗口背景色，避免启动时闪烁
    let bgColor = '#F9F8F6'; // 默认浅色
    try {
        const dataPath = pmPaths.getDataFilePath();
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            if (data.settings && data.settings.theme === 'dark') {
                bgColor = '#1A1816';
            }
        }
    } catch(e) {}

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: bgColor,
        titleBarStyle: 'hiddenInset',
        frame: true,
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow = win; // 存储模块级引用
    win.loadFile('index.html');

    win.webContents.on('did-finish-load', () => {
        win.setTitle('PlanMosaic');
        testWindowLoaded = true;
        maybeEmitTestReady();
    });

    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        delete webPreferences.preload;
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        if (params.src && !params.src.startsWith('file://')) {
            console.warn('[Security] Blocked webview loading external URL:', params.src);
            event.preventDefault();
        }
    });

    // 开发模式
    if (process.env.NODE_ENV === 'dev') {
        win.webContents.openDevTools();
    }
}

// ============ CLI 控制 HTTP 服务器 ============

const CONTROL_PORT = 5199;
const CONTROL_HOST = pmPaths.normalizeLoopbackHost(process.env.PLANMOSAIC_CONTROL_HOST || '127.0.0.1');
const CONTROL_AUTH_TOKEN = pmPaths.ensureControlToken(process.env.PLANMOSAIC_CONTROL_TOKEN);
const CONTROL_MAX_BODY_SIZE = 1024 * 1024; // 1MB
let controlServer = null;
let mainWindow = null; // 模块级窗口引用，避免重复调用 BrowserWindow.getAllWindows()[0]
let testWindowLoaded = false;
let testControlServerReady = false;
let testReadyEmitted = false;

function maybeEmitTestReady() {
    if (!IS_TEST_MODE || testReadyEmitted || !testWindowLoaded || !testControlServerReady) {
        return;
    }
    testReadyEmitted = true;
    console.log(`[TEST_READY] control=http://${CONTROL_HOST}:${CONTROL_PORT}`);
}

function getMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    mainWindow = BrowserWindow.getAllWindows()[0] || null;
    return mainWindow;
}

function applyControlCors(req, res) {
    const reqOrigin = req.headers['origin'] || '';
    if (pmPaths.isAllowedLocalOrigin(reqOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Control-Token');
}

function readControlRequestBody(req, res) {
    return new Promise((resolve, reject) => {
        let body = '';
        let bodySize = 0;
        let completed = false;

        req.on('data', chunk => {
            if (completed) return;
            bodySize += chunk.length;
            if (bodySize > CONTROL_MAX_BODY_SIZE) {
                completed = true;
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'Request body too large' }));
                req.resume();
                resolve(null);
                return;
            }
            body += chunk;
        });

        req.on('end', () => {
            if (completed) return;
            completed = true;
            resolve(body);
        });

        req.on('error', err => {
            if (completed) return;
            completed = true;
            reject(err);
        });
    });
}

function startControlServer() {
    controlServer = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        applyControlCors(req, res);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const body = await readControlRequestBody(req, res);
        if (body === null) return;

        const start = Date.now();
        try {
            const url = new URL(req.url, `http://${CONTROL_HOST}:${CONTROL_PORT}`);

            // Auth: validate token for non-health endpoints
            const reqToken = req.headers['x-control-token'] || '';
            if (url.pathname !== '/health' && reqToken !== CONTROL_AUTH_TOKEN) {
                res.writeHead(403);
                res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing control token' }));
                return;
            }

            // ========== 健康检查 ==========
            if (req.method === 'GET' && url.pathname === '/health') {
                const mw = getMainWindow();
                res.writeHead(200);
                res.end(JSON.stringify({
                    ready: true,
                    backend: PYTHON_BACKEND_URL,
                    pythonRunning: pythonProcess !== null,
                    app: mw ? {
                        title: mw.getTitle(),
                        isMaximized: mw.isMaximized(),
                        isMinimized: mw.isMinimized(),
                        isFocused: mw.isFocused(),
                        size: mw.getSize()
                    } : null
                }));
                return;
            }

            // ========== UI 状态查询 ==========
            if (req.method === 'GET' && url.pathname === '/ui/status') {
                const mw = getMainWindow();
                if (!mw) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, error: 'No window available' }));
                    return;
                }
                mw.webContents.executeJavaScript(`
                        (function() {
                            return {
                                theme: document.documentElement.getAttribute('data-theme') || 'light',
                                activeTab: document.querySelector('.nav-item.active')?.textContent?.trim() || 'unknown',
                                conversationCount: window._conversationHistory?.length || 0,
                                sidebarVisible: !!document.querySelector('.sidebar:not(.hidden)')
                            };
                        })()
                `).then(uiState => {
                    res.writeHead(200);
                    res.end(JSON.stringify({
                        success: true,
                        data: {
                            window: {
                                title: mw.getTitle(),
                                width: mw.getSize()[0],
                                height: mw.getSize()[1],
                                isMaximized: mw.isMaximized(),
                                isMinimized: mw.isMinimized(),
                                isFocused: mw.isFocused()
                            },
                            backend: {
                                running: pythonProcess !== null,
                                url: PYTHON_BACKEND_URL
                            },
                            config: {
                                deepseekModel: appConfig.deepseek.model,
                                hasDeepseekKey: !!appConfig.deepseek.key
                            },
                            ui: uiState
                        },
                        elapsed: Date.now() - start
                    }));
                }).catch(err => {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, error: err.message }));
                });
                return;
            }

                // ========== 窗口操作 ==========
                if (req.method === 'POST' && url.pathname === '/ui/window') {
                    const data = JSON.parse(body);
                    const action = data.action;
                    const mainWindow = getMainWindow();
                    if (!mainWindow) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                        return;
                    }
                    let result = { success: true };
                    switch (action) {
                        case 'minimize': mainWindow.minimize(); result.action = 'minimized'; break;
                        case 'maximize': mainWindow.maximize(); result.action = 'maximized'; break;
                        case 'restore': mainWindow.restore(); result.action = 'restored'; break;
                        case 'focus': mainWindow.focus(); result.action = 'focused'; break;
                        case 'resize':
                            if (data.width && data.height) {
                                mainWindow.setSize(data.width, data.height);
                                result.action = `resized to ${data.width}x${data.height}`;
                            }
                            break;
                        case 'center': mainWindow.center(); result.action = 'centered'; break;
                        default:
                            result = { success: false, error: `Unknown window action: ${action}` };
                    }
                    result.elapsed = Date.now() - start;
                    res.writeHead(200);
                    res.end(JSON.stringify(result));
                    return;
                }

                // ========== 主题切换 ==========
                if (req.method === 'POST' && url.pathname === '/ui/theme') {
                    const data = JSON.parse(body);
                    const theme = (data.theme === 'dark' || data.theme === 'light') ? data.theme : 'light';
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        mainWindow.webContents.executeJavaScript(`
                            (function() {
                                document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                                localStorage.setItem('mosaique-theme', ${JSON.stringify(theme)});
                                if (typeof changeTheme === 'function') {
                                    changeTheme(${JSON.stringify(theme)});
                                }
                                return 'theme set to ${theme}';
                            })()
                        `).then(() => {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, action: 'theme', theme }));
                        }).catch(err => {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: false, error: err.message, action: 'theme', theme }));
                        });
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                    }
                    return;
                }

                // ========== 发送聊天消息 ==========
                if (req.method === 'POST' && url.pathname === '/ui/chat') {
                    const data = JSON.parse(body);
                    const message = data.message || '';
                    const mainWindow = getMainWindow();
                    if (!mainWindow) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                        return;
                    }
                    if (!message) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No message provided' }));
                        return;
                    }
                    mainWindow.webContents.executeJavaScript(`
                        (function() {
                            var msg = ${JSON.stringify(message)};
                            var mainArea = document.getElementById('agentMainArea');
                            var isMainVisible = mainArea && mainArea.offsetParent !== null;
                            var input = isMainVisible
                                ? document.getElementById('agentMainInput')
                                : (document.getElementById('agentInput') || document.querySelector('.agent-input'));
                            if (!input) return { sent: false, error: 'Chat input not found' };
                            input.value = msg;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            if (typeof sendAgentMessage === 'function') {
                                sendAgentMessage();
                                return { sent: true };
                            }
                            return { sent: false, error: 'sendAgentMessage not available' };
                        })()
                    `).then(jsResult => {
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: !!(jsResult && jsResult.sent),
                            action: 'chat',
                            message: message.substring(0, 100),
                            error: jsResult && jsResult.error ? jsResult.error : undefined,
                            elapsed: Date.now() - start
                        }));
                    }).catch(err => {
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: false,
                            action: 'chat',
                            message: message.substring(0, 100),
                            error: err.message,
                            elapsed: Date.now() - start
                        }));
                    });
                    return;
                }

                // ========== 执行 JavaScript ==========
                if (req.method === 'POST' && url.pathname === '/ui/exec') {
                    if (app.isPackaged) {
                        res.writeHead(403);
                        res.end(JSON.stringify({ success: false, error: 'Script execution disabled in production builds', elapsed: Date.now() - start }));
                        return;
                    }
                    const data = JSON.parse(body);
                    const script = data.script || '';
                    const mainWindow = getMainWindow();
                    if (!mainWindow) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                        return;
                    }
                    if (!script) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No script provided' }));
                        return;
                    }
                    // Safety: block dangerous patterns
                    const dangerousPatterns = [
                        /\blocalStorage\s*\.\s*clear\s*\(/,
                        /\blocalStorage\s*\.\s*removeItem\s*\(/,
                        /\bsessionStorage\s*\.\s*clear\s*\(/,
                        /\bindexedDB\s*\.\s*deleteDatabase\s*\(/,
                        /\blocation\s*=\s*/,
                        /\blocation\s*\.\s*href\s*=/,
                        /\blocation\s*\.\s*replace\s*\(/,
                        /\blocation\s*\.\s*assign\s*\(/,
                        /\beval\s*\(/,
                        /\bFunction\s*\(/,
                        /\bfetch\s*\(\s*['"]delete\b/i,
                        /\bfetch\s*\(\s*['"]\/api\/.*(?:clear|delete|remove)/i
                    ];
                    const isDangerous = dangerousPatterns.some(p => p.test(script));
                    if (isDangerous) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'Script blocked: contains potentially destructive operation. Use specific CLI commands instead.', elapsed: Date.now() - start }));
                        return;
                    }
                    mainWindow.webContents.executeJavaScript(script).then(result => {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, result, elapsed: Date.now() - start }));
                    }).catch(err => {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: err.message, elapsed: Date.now() - start }));
                    });
                    return;
                }

                // ========== 重新加载窗口 ==========
                if (req.method === 'POST' && url.pathname === '/ui/reload') {
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        mainWindow.reload();
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, action: 'reload', elapsed: Date.now() - start }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                    }
                    return;
                }

                // ========== 打开开发者工具 ==========
                if (req.method === 'POST' && url.pathname === '/ui/devtools') {
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        const isOpen = mainWindow.webContents.isDevToolsOpened();
                        if (isOpen) {
                            mainWindow.webContents.closeDevTools();
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, action: 'devtools-closed', elapsed: Date.now() - start }));
                        } else {
                            mainWindow.webContents.openDevTools();
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, action: 'devtools-opened', elapsed: Date.now() - start }));
                        }
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                    }
                    return;
                }

                // ========== 查询渲染进程状态 ==========
                if (req.method === 'GET' && url.pathname === '/ui/query') {
                    const target = url.searchParams.get('target') || '';
                    const mainWindow = getMainWindow();

                    // Validate selector to prevent injection
                    const rawSelector = url.searchParams.get('selector') || 'body';
                    const safeSelector = /^[a-zA-Z0-9#\.\-\s\[\]="':>~+*,]+$/.test(rawSelector) ? rawSelector : 'body';

                    const queries = {
                        'messages': 'JSON.stringify(window._conversationHistory || [])',
                        'theme': '(document.documentElement.getAttribute("data-theme") || "light")',
                        'title': 'document.title',
                        'dom': `(function() {
                            const selector = ${JSON.stringify(safeSelector)};
                            const el = document.querySelector(selector);
                            if (!el) return null;
                            return {
                                tag: el.tagName,
                                className: el.className,
                                textContent: el.textContent?.slice(0, 500)
                            };
                        })()`
                    };

                    const script = queries[target] || queries['dom'];
                    if (mainWindow) {
                        mainWindow.webContents.executeJavaScript(script).then(data => {
                            const parsed = target === 'messages' ? JSON.parse(data) : data;
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, target, data: parsed, elapsed: Date.now() - start }));
                        }).catch(err => {
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: false, error: err.message }));
                        });
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                    }
                    return;
                }

                // ========== 统一 UI 动作端点 ==========
                if (req.method === 'POST' && url.pathname === '/ui/action') {
                    const data = JSON.parse(body);
                    const action = data.action || '';
                    const params = data.params || {};
                    const mainWindow = getMainWindow();

                    if (!mainWindow || mainWindow.isDestroyed()) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: 'No window available' }));
                        return;
                    }

                    // 参数消毒函数
                    const safeStr = (s) => String(s || '').replace(/[^a-zA-Z0-9\-_]/g, '');
                    const safeDate = (s) => String(s || '').replace(/[^0-9\-]/g, '');
                    const safeNum = (s) => Number(s) || 0;

                    // 动作注册表
                    const ACTION_MAP = {
                        // --- 导航 & 视图 ---
                        'navigate.calendar':     () => `renderCalendar()`,
                        'navigate.date':         () => `openModal('${safeDate(params.dateStr)}')`,
                        'navigate.today':        () => {
                            const d = new Date();
                            const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                            return `openModal('${ds}'); currentEditDate = '${ds}';`;
                        },
                        'navigate.week':         () => `(function(){ if(typeof isWeekView!=='undefined'&&!isWeekView) toggleViewMode(); })()`,
                        'navigate.prev':         () => `previousMonth()`,
                        'navigate.next':         () => `nextMonth()`,

                        // --- 面板 ---
                        'panel.toggle':          () => `toggleRightPanel('${safeStr(params.panelId)}')`,
                        'panel.sidebar':         () => `toggleSidebar()`,
                        'panel.tasks':           () => `toggleBigTasks()`,

                        // --- 设置 & 模态框 ---
                        'settings.open':         () => `openSettingsModal()`,
                        'settings.close':        () => `closeSettingsModal()`,
                        'agent.open':            () => `(typeof window.openAgentModal==='function')&&window.openAgentModal()`,
                        'agent.close':           () => `(typeof window.closeAgentModal==='function')&&window.closeAgentModal()`,
                        'agent.mini':            () => `openAgentMiniModal()`,

                        // --- 编辑操作 ---
                        'edit.openDay':          () => `openDayEditMode('${safeDate(params.dateStr)}')`,
                        'edit.cancel':           () => `cancelEdit()`,
                        'edit.save':             () => `saveSchedule()`,
                        'edit.scheduleEditor':   () => `openScheduleEditor()`,
                        'edit.closeScheduleEditor': () => `closeScheduleEditor()`,
                        'template.create':       () => `createNewTemplate()`,
                        'template.edit':         () => `editTemplate(${safeNum(params.index)})`,
                        'template.copy':         () => `copyTemplate(${safeNum(params.index)})`,
                        'template.delete':       () => `deleteTemplate(${safeNum(params.index)})`,
                        'template.activate':     () => `activateSchedule()`,

                        // --- Toast 通知 ---
                        'toast':                 () => `showToast(${JSON.stringify(params.message||'')},${JSON.stringify(params.type||'info')},${safeNum(params.duration)||3000})`,
                        'toast.success':         () => `showToast(${JSON.stringify(params.message||'操作成功')},'success',3000)`,
                        'toast.error':           () => `showToast(${JSON.stringify(params.message||'操作失败')},'error',5000)`,
                        'toast.info':            () => `showToast(${JSON.stringify(params.message||'')},'info',3000)`,
                        'toast.warning':         () => `showToast(${JSON.stringify(params.message||'注意')},'warning',4000)`,

                        // --- 主题 ---
                        'theme.change':          () => {
                            const t = params.theme === 'dark' ? 'dark' : 'light';
                            return `document.documentElement.setAttribute('data-theme','${t}');localStorage.setItem('mosaique-theme','${t}');if(typeof changeTheme==='function')changeTheme('${t}');`;
                        },

                        // --- 数据刷新 ---
                        'data.refresh':          () => `loadDataAndSync()`,
                        'data.refreshCalendar':  () => `renderCalendar()`,
                        'data.refreshTasks':     () => `renderTaskPanel(currentEditDate||getTodayDateString())`,
                        'data.refreshTimeline':  () => `renderTimeSidebar(currentEditDate||getTodayDateString())`,
                        'data.refreshBigTasks':  () => `renderBigTasks()`,
                        'data.refreshAll':       () => `(async function(){if(typeof loadDataAndSync==='function')await loadDataAndSync();renderCalendar();if(typeof renderBigTasks==='function')renderBigTasks();})()`,

                        // --- 日程项 CRUD ---
                        'schedule.add':          () => {
                            const ds = safeDate(params.dateStr);
                            const act = JSON.stringify(params.activity || '');
                            const tm = JSON.stringify(params.time || '');
                            const det = JSON.stringify(params.detail || '');
                            const ico = JSON.stringify(params.icon || '●');
                            return `(function(){
                                var ds='${ds}',tm=${tm},act=${act},det=${det},ico=${ico};
                                if(!window.scheduleData) window.scheduleData={schedules:{}};
                                if(!window.scheduleData.schedules[ds]) window.scheduleData.schedules[ds]={timeSlots:[],tasks:[]};
                                window.scheduleData.schedules[ds].timeSlots.push({time:tm,activity:act,detail:det,icon:ico});
                                if(typeof saveData==='function') saveData();
                                renderCalendar();
                                if(currentEditDate===ds) renderTimeSidebar(ds);
                                return {added:true,date:ds,time:tm,activity:act};
                            })()`;
                        },
                        'schedule.remove':       () => {
                            const ds = safeDate(params.dateStr);
                            const idx = safeNum(params.index);
                            return `(function(){
                                var ds='${ds}',idx=${idx};
                                if(!window.scheduleData||!window.scheduleData.schedules[ds]) return {removed:false,error:'date not found'};
                                var slots=window.scheduleData.schedules[ds].timeSlots;
                                if(idx<0||idx>=slots.length) return {removed:false,error:'index out of range'};
                                var removed=slots.splice(idx,1)[0];
                                if(typeof saveData==='function') saveData();
                                renderCalendar();
                                if(currentEditDate===ds) renderTimeSidebar(ds);
                                return {removed:true,date:ds,item:removed};
                            })()`;
                        },
                        'schedule.list':         () => {
                            const ds = safeDate(params.dateStr);
                            return `(function(){
                                var ds='${ds}';
                                if(!window.scheduleData||!window.scheduleData.schedules[ds]) return [];
                                return window.scheduleData.schedules[ds].timeSlots||[];
                            })()`;
                        },
                        'schedule.save':         () => `(function(){if(typeof saveData==='function'){saveData();return true;}return false;})()`,

                        // --- 每日任务 CRUD ---
                        'task.add':              () => {
                            const ds = safeDate(params.dateStr);
                            const txt = JSON.stringify(params.text || params.name || '');
                            return `(async function(){
                                var ds='${ds}',txt=${txt};
                                if(!window.scheduleData) window.scheduleData={schedules:{}};
                                if(!window.scheduleData.schedules[ds]) window.scheduleData.schedules[ds]={timeSlots:[],tasks:[]};
                                if(!window.scheduleData.schedules[ds].tasks) window.scheduleData.schedules[ds].tasks=[];
                                window.scheduleData.schedules[ds].tasks.push({name:txt,estimated:'',actual:'',note:'',completed:false});
                                if(typeof currentEditDate!=='undefined') currentEditDate=ds;
                                if(typeof saveScheduleDirectly==='function') await saveScheduleDirectly(window.scheduleData.schedules[ds], { silentQueueNotice: true });
                                if(typeof renderTaskPanel==='function') renderTaskPanel(ds);
                                return {added:true,date:ds,text:txt};
                            })()`;
                        },
                        'task.toggle':           () => {
                            const ds = safeDate(params.dateStr);
                            const idx = safeNum(params.index);
                            return `(async function(){
                                var ds='${ds}',idx=${idx};
                                if(!window.scheduleData||!window.scheduleData.schedules[ds]||!window.scheduleData.schedules[ds].tasks) return {toggled:false};
                                var tasks=window.scheduleData.schedules[ds].tasks;
                                if(idx<0||idx>=tasks.length) return {toggled:false};
                                tasks[idx].completed=!tasks[idx].completed;
                                if(typeof currentEditDate!=='undefined') currentEditDate=ds;
                                if(typeof saveScheduleDirectly==='function') await saveScheduleDirectly(window.scheduleData.schedules[ds], { silentQueueNotice: true });
                                if(typeof renderTaskPanel==='function') renderTaskPanel(ds);
                                return {toggled:true,date:ds,index:idx,completed:tasks[idx].completed};
                            })()`;
                        },
                        'task.remove':           () => {
                            const ds = safeDate(params.dateStr);
                            const idx = safeNum(params.index);
                            return `(async function(){
                                var ds='${ds}',idx=${idx};
                                if(!window.scheduleData||!window.scheduleData.schedules[ds]||!window.scheduleData.schedules[ds].tasks) return {removed:false};
                                var tasks=window.scheduleData.schedules[ds].tasks;
                                if(idx<0||idx>=tasks.length) return {removed:false};
                                var removed=tasks.splice(idx,1)[0];
                                if(typeof currentEditDate!=='undefined') currentEditDate=ds;
                                if(typeof saveScheduleDirectly==='function') await saveScheduleDirectly(window.scheduleData.schedules[ds], { silentQueueNotice: true });
                                if(typeof renderTaskPanel==='function') renderTaskPanel(ds);
                                return {removed:true,date:ds,item:removed};
                            })()`;
                        },
                        'task.list':             () => {
                            const ds = safeDate(params.dateStr);
                            return `(function(){
                                var ds='${ds}';
                                if(!window.scheduleData||!window.scheduleData.schedules[ds]) return [];
                                return window.scheduleData.schedules[ds].tasks||[];
                            })()`;
                        },

                        // --- 大任务 CRUD ---
                        'bigtask.add':           () => {
                            const title = JSON.stringify(params.title || params.name || '');
                            const note = JSON.stringify(params.note || params.description || '');
                            const deadline = safeDate(params.deadline || params.ddl);
                            const tp = JSON.stringify(params.type || 'short');
                            const estimated = safeNum(params.estimated || params.minutes);
                            const startDate = safeDate(params.startDate);
                            return `(async function(){
                                var title=${title},note=${note},deadline='${deadline}',tp=${tp},estimated=${estimated},startDate='${startDate}';
                                if(!window.bigTasks) window.bigTasks=[];
                                window.bigTasks.push({name:title,estimated:estimated||0,ddl:deadline,startDate:startDate,note:note,type:tp,completed:false,createdAt:new Date().toISOString()});
                                if(typeof saveBigTasks==='function') await saveBigTasks({ silentQueueNotice: true });
                                if(typeof renderBigTasks==='function') renderBigTasks();
                                return {added:true,name:title};
                            })()`;
                        },
                        'bigtask.toggle':        () => {
                            const idx = safeNum(params.index);
                            return `(async function(){
                                var idx=${idx};
                                if(!window.bigTasks||idx<0||idx>=window.bigTasks.length) return {toggled:false};
                                window.bigTasks[idx].completed=!window.bigTasks[idx].completed;
                                if(typeof saveBigTasks==='function') await saveBigTasks({ silentQueueNotice: true });
                                if(typeof renderBigTasks==='function') renderBigTasks();
                                return {toggled:true,index:idx,completed:window.bigTasks[idx].completed};
                            })()`;
                        },
                        'bigtask.remove':        () => {
                            const idx = safeNum(params.index);
                            return `(async function(){
                                var idx=${idx};
                                if(!window.bigTasks||idx<0||idx>=window.bigTasks.length) return {removed:false};
                                var removed=window.bigTasks.splice(idx,1)[0];
                                if(typeof saveBigTasks==='function') await saveBigTasks({ silentQueueNotice: true });
                                if(typeof renderBigTasks==='function') renderBigTasks();
                                return {removed:true,item:removed};
                            })()`;
                        },
                        'bigtask.list':          () => `(window.bigTasks||[])`,

                        // --- Deep Planning ---
                        'planning.open':         () => `(typeof window.openDeepPlanningModal==='function')&&window.openDeepPlanningModal()`,
                        'planning.close':        () => `(typeof window.closeDeepPlanningModal==='function')&&window.closeDeepPlanningModal()`,
                        'planning.send':         () => {
                            return `(function(){
                                var msg=${JSON.stringify(params.message||'')};
                                if(typeof window.openDeepPlanningModal==='function') window.openDeepPlanningModal();
                                setTimeout(function(){
                                    var input=document.getElementById('dpInput');
                                    if(input){input.value=msg;input.dispatchEvent(new Event('input',{bubbles:true}));}
                                    if(typeof window.sendDeepPlanningMessage==='function') window.sendDeepPlanningMessage();
                                },250);
                            })()`;
                        },

                        // --- 聊天 ---
                        'chat.send':             () => {
                            return `(function(){
                                var msg=${JSON.stringify(params.message||'')};
                                if(typeof window.openAgentModal==='function')window.openAgentModal();
                                setTimeout(function(){
                                    var input=document.getElementById('agentMainInput')||document.getElementById('agentInput');
                                    if(input){input.value=msg;input.dispatchEvent(new Event('input',{bubbles:true}));}
                                    if(typeof sendAgentMessage==='function')sendAgentMessage();
                                },300);
                            })()`;
                        },

                        // --- 窗口 (主进程操作) ---
                        'window.focus':          () => '__WINDOW_OP__',
                        'window.restore':        () => '__WINDOW_OP__',
                    };

                    const actionFn = ACTION_MAP[action];
                    if (!actionFn) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
                        return;
                    }

                    let script;
                    try { script = actionFn(); } catch (e) {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, error: `Action param error: ${e.message}` }));
                        return;
                    }

                    // 窗口操作直接在主进程执行
                    if (script === '__WINDOW_OP__') {
                        if (action === 'window.focus') mainWindow.focus();
                        else if (action === 'window.restore') { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, action, elapsed: Date.now() - start }));
                        return;
                    }

                    mainWindow.webContents.executeJavaScript(script).then(result => {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, action, result, elapsed: Date.now() - start }));
                    }).catch(err => {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, action, error: err.message, elapsed: Date.now() - start }));
                    });
                    return;
                }

                // ========== 兼容旧的测试端点 ==========
                if (req.method === 'GET' && url.pathname === '/test/health') {
                    res.writeHead(200);
                    res.end(JSON.stringify({ ready: true, backend: PYTHON_BACKEND_URL,
                        pythonRunning: pythonProcess !== null }));
                    return;
                }

                if (app.isPackaged) {
                    res.writeHead(403);
                    res.end(JSON.stringify({ error: 'Test endpoints disabled in production' }));
                    return;
                }
                if (req.method === 'POST' && url.pathname === '/test/exec') {
                    const data = JSON.parse(body);
                    const { command, params } = data;
                    const result = await Promise.resolve(handleTestCommand(command, params));
                    res.writeHead(200);
                    res.end(JSON.stringify(result));
                    return;
                }

                if (req.method === 'GET' && url.pathname === '/test/query') {
                    const target = url.searchParams.get('target') || '';
                    const result = await Promise.resolve(handleTestQuery(target));
                    res.writeHead(200);
                    res.end(JSON.stringify(result));
                    return;
                }

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Unknown endpoint', path: url.pathname }));
        } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: e.message, elapsed: Date.now() - start }));
        }
    });

    controlServer.listen(CONTROL_PORT, CONTROL_HOST, () => {
        console.log(`[CLI Control] Server listening on http://${CONTROL_HOST}:${CONTROL_PORT}`);
        process.env.PLANMOSAIC_CONTROL_TOKEN = CONTROL_AUTH_TOKEN;
        testControlServerReady = true;
        maybeEmitTestReady();
    });
    controlServer.timeout = 30000; // 30s request timeout
}

function handleTestCommand(command, params) {
    const start = Date.now();
    try {
        switch (command) {
            case 'set-api-key': {
                const key = params.key || '';
                appConfig.deepseek.key = key;

                const configPath = pmPaths.getConfigPath();
                let config = {};
                if (fs.existsSync(configPath)) {
                    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                }
                config.api = config.api || {};
                config.api.deepseek = config.api.deepseek || {};
                config.api.deepseek.key = encryptApiKey(key);
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

                pythonApi('POST', '/api/config', { api: { deepseek: { key } } })
                    .catch(() => {});
                return { success: true, data: { keyLength: key.length }, elapsed: Date.now() - start };
            }

            case 'send-message': {
                const message = params.message || '';
                const mainWindow = getMainWindow();
                if (mainWindow) {
                    return mainWindow.webContents.executeJavaScript(`
                        (function() {
                            var msg = ${JSON.stringify(message)};
                            var mainArea = document.getElementById('agentMainArea');
                            var isMainVisible = mainArea && mainArea.offsetParent !== null;
                            var input = isMainVisible
                                ? document.getElementById('agentMainInput')
                                : (document.getElementById('agentInput') || document.querySelector('.agent-input'));
                            if (!input) return false;
                            input.value = msg;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            if (typeof sendAgentMessage === 'function') {
                                sendAgentMessage();
                                return true;
                            }
                            return false;
                        })()
                    `).then(sent => {
                        return { success: true, data: { sent }, elapsed: Date.now() - start };
                    });
                }
                return { success: false, error: 'No window available', elapsed: Date.now() - start };
            }

            case 'inject-dom': {
                const script = params.script || '';
                const mainWindow = getMainWindow();
                if (mainWindow) {
                    return mainWindow.webContents.executeJavaScript(script).then(data => {
                        return { success: true, data, elapsed: Date.now() - start };
                    });
                }
                return { success: false, error: 'No window available', elapsed: Date.now() - start };
            }

            case 'kill-backend': {
                if (pythonProcess) {
                    pythonProcess.kill('SIGKILL');
                    pythonProcess = null;
                    return { success: true, data: { killed: true }, elapsed: Date.now() - start };
                }
                return { success: false, error: 'No backend process', elapsed: Date.now() - start };
            }

            case 'backend-request': {
                const method = typeof params.method === 'string' ? params.method.toUpperCase() : 'GET';
                const requestPath = typeof params.path === 'string' ? params.path : '/health';
                return pythonApi(method, requestPath, params.body)
                    .then((data) => ({
                        success: true,
                        data: {
                            status: 200,
                            body: data
                        },
                        elapsed: Date.now() - start
                    }))
                    .catch((error) => {
                        const message = error && error.message ? error.message : String(error);
                        const statusMatch = message.match(/^HTTP\s+(\d+):\s*(.*)$/);
                        const statusCode = statusMatch ? Number(statusMatch[1]) : 500;
                        let payload = statusMatch ? statusMatch[2] : message;
                        try {
                            payload = JSON.parse(payload);
                        } catch (_) {}
                        return {
                            success: false,
                            data: {
                                status: statusCode,
                                body: payload
                            },
                            error: message,
                            elapsed: Date.now() - start
                        };
                    });
            }

            case 'backend-raw-request': {
                const method = typeof params.method === 'string' ? params.method.toUpperCase() : 'GET';
                const requestPath = typeof params.path === 'string' ? params.path : '/health';
                const requestUrl = new URL(requestPath, PYTHON_BACKEND_URL);
                const rawHeaders = params.headers && typeof params.headers === 'object' ? params.headers : {};
                const bodyPayload = params.rawBody !== undefined
                    ? String(params.rawBody)
                    : (params.body !== undefined ? JSON.stringify(params.body) : '');
                const headers = { ...rawHeaders };
                if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
                    headers['Content-Type'] = 'application/json';
                }
                if (bodyPayload) {
                    headers['Content-Length'] = Buffer.byteLength(bodyPayload);
                }

                return new Promise((resolve) => {
                    const req = http.request({
                        hostname: requestUrl.hostname,
                        port: requestUrl.port,
                        path: requestUrl.pathname + requestUrl.search,
                        method,
                        timeout: 30000,
                        headers
                    }, (resp) => {
                        let data = '';
                        resp.on('data', chunk => data += chunk);
                        resp.on('end', () => {
                            let parsed = data;
                            try {
                                parsed = JSON.parse(data);
                            } catch (_) {}
                            resolve({
                                success: resp.statusCode >= 200 && resp.statusCode < 300,
                                data: {
                                    status: resp.statusCode,
                                    body: parsed
                                },
                                elapsed: Date.now() - start
                            });
                        });
                    });
                    req.on('error', (error) => {
                        resolve({
                            success: false,
                            error: error.message,
                            elapsed: Date.now() - start
                        });
                    });
                    req.on('timeout', () => {
                        req.destroy(new Error('Request timeout'));
                    });
                    if (bodyPayload) req.write(bodyPayload);
                    req.end();
                });
            }

            case 'backend-oversized-request': {
                const targetBytes = Number(params.bytes) > 0 ? Number(params.bytes) : (21 * 1024 * 1024);
                const fillerBytes = Math.max(1, targetBytes - 32);
                return handleTestCommand('backend-raw-request', {
                    method: typeof params.method === 'string' ? params.method : 'POST',
                    path: typeof params.path === 'string' ? params.path : '/api/save-schedule',
                    headers: params.headers && typeof params.headers === 'object' ? params.headers : {},
                    rawBody: JSON.stringify({ blob: 'x'.repeat(fillerBytes) })
                });
            }

            default:
                return { success: false, error: `Unknown command: ${command}`, elapsed: Date.now() - start };
        }
    } catch (e) {
        return { success: false, error: e.message, elapsed: Date.now() - start };
    }
}

function handleTestQuery(target) {
    const start = Date.now();
    try {
        switch (target) {
            case 'config':
                return { success: true, data: {
                    provider: 'deepseek',
                    deepseekModel: appConfig.deepseek.model,
                    hasKey: !!appConfig.deepseek.key }, elapsed: Date.now() - start };
            case 'backend':
                return { success: true, data: { url: PYTHON_BACKEND_URL,
                    running: pythonProcess !== null }, elapsed: Date.now() - start };
            case 'messages': {
                const mainWindow = getMainWindow();
                if (mainWindow) {
                    return mainWindow.webContents.executeJavaScript(
                        'JSON.stringify(window._conversationHistory || [])'
                    ).then(data => ({
                        success: true, data: JSON.parse(data), elapsed: Date.now() - start
                    }));
                }
                return { success: false, error: 'No window available', elapsed: Date.now() - start };
            }
            case 'dom': {
                const selector = arguments[1]?.selector || '';
                const mainWindow = getMainWindow();
                if (mainWindow && selector) {
                    return mainWindow.webContents.executeJavaScript(
                        `(function() {
                            const el = document.querySelector(${JSON.stringify(selector)});
                            if (!el) return null;
                            const style = window.getComputedStyle(el);
                            return {
                                tag: el.tagName,
                                className: el.className,
                                background: style.background,
                                whiteSpace: style.whiteSpace,
                                color: style.color,
                                display: style.display,
                                textContent: el.textContent?.slice(0, 200)
                            };
                        })()`
                    ).then(data => ({
                        success: true, data, elapsed: Date.now() - start
                    }));
                }
                return { success: false, error: 'No window or selector', elapsed: Date.now() - start };
            }
            default:
                return { success: false, error: `Unknown query target: ${target}`, elapsed: Date.now() - start };
        }
    } catch (e) {
        return { success: false, error: e.message, elapsed: Date.now() - start };
    }
}

// ============ Webview 错误处理 ============

app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
        contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            console.error('[Webview] Load failed:', errorDescription, 'Code:', errorCode);
            contents.executeJavaScript(`
                document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>加载失败</h2><p>页面无法加载，请检查网络连接</p><button onclick="location.reload()" style="padding:10px 20px;margin-top:20px;cursor:pointer;">重试</button></div>';
            `);
        });
    }
});

// ============ 单实例锁 ============

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ============ App 启动与退出 ============

app.whenReady().then(async () => {
    try {
        await startPythonBackend();
    } catch (error) {
        console.error('[Startup] Failed to start Python backend:', error.message);
    }
    createWindow();
    startControlServer();
    testNetworkConnection().catch(err => {
        console.warn('[Startup] Network test failed:', err.message);
    });
    createDesktopShortcut();
});

app.on('window-all-closed', () => {
    if (activeAgentStreamReq) {
        activeAgentStreamReq.destroy();
        activeAgentStreamReq = null;
    }
    if (activeAgentStreamHeartbeat) {
        clearInterval(activeAgentStreamHeartbeat);
        activeAgentStreamHeartbeat = null;
    }
    if (controlServer) {
        controlServer.close();
        controlServer = null;
    }
    stopPythonBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (controlServer) {
        controlServer.close();
        controlServer = null;
    }
    stopPythonBackend();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

console.log('=================================================');
console.log('PlanMosaic - Electron版');
console.log('Model:', appConfig.deepseek.model);
console.log('Backend:', PYTHON_BACKEND_URL);
console.log('=================================================');
