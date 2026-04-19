const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const pmPaths = require('./paths.js');

// 创建桌面快捷方式
function createDesktopShortcut() {
    if (process.platform !== 'win32') return;
    try {
        const desktop = path.join(app.getPath('desktop'), 'PlanMosaic.lnk');
        if (fs.existsSync(desktop)) return;
        const exePath = process.execPath;
        const appDir = path.dirname(exePath);
        const iconPath = path.join(appDir, 'resources', 'app', 'image4.ico');
        const { execSync } = require('child_process');
        const ps = `
            $ws = New-Object -ComObject WScript.Shell;
            $s = $ws.CreateShortcut('${desktop.replace(/\\/g, '\\\\')}');
            $s.TargetPath = '${exePath.replace(/\\/g, '\\\\')}';
            $s.WorkingDirectory = '${appDir.replace(/\\/g, '\\\\')}';
            $s.Description = 'PlanMosaic 学业规划系统';
            $s.IconLocation = '${iconPath.replace(/\\/g, '\\\\')}';
            $s.Save();
        `;
        execSync(`powershell -Command "${ps.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
        console.log('[Shortcut] Desktop shortcut created with icon');
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

// 清理 reasoner 模型的 content 字段，移除混入的思考过程
function cleanReasonerContent(content) {
    if (!content) return content;
    // deepseek-reasoner 有时把思考过程混入 content，表现为：
    // 1. 以 <think</think 或 <thinking> 开头的标签
    // 2. 以 "好的，让我" "我来" "首先" 等推理性开头后跟步骤描述
    // 3. 包含 "第一步" "接下来" 等明显推理标记
    let cleaned = content;
    // 移除 <think...</think 块
    cleaned = cleaned.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    return cleaned || content;
}

// 清理字符串中的 lone surrogates，防止 .includes() 等操作抛出 RangeError
function sanitizeStr(s) { return (s || '').replace(/[\uD800-\uDFFF]/g, ''); }
const { AI_TOOLS } = require('./ai-tools.js');
// agent-capabilities removed — conflict detection inlined

// ============ 配置 ============

// 从配置文件加载API密钥（不在代码中硬编码）
let DEEPSEEK_API_KEY = '';
let DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
let MODEL_NAME = 'deepseek-chat';          // 默认快速模型
let REASONER_MODEL_NAME = 'deepseek-reasoner';  // 推理模型（复杂任务）

// Qwen 配置
let QWEN_API_KEY = '';
let QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
let QWEN_MODEL_NAME = 'qwen3.5-plus';

// 当前使用的 provider
let currentProvider = 'deepseek';  // 'deepseek' 或 'qwen'

let appSettings = {
    enableTimeout: false,
    timeoutMs: 30000,
    rejectUnauthorized: true  // 默认启用SSL验证
};

// 获取当前 provider 的配置
function getCurrentProvider() {
    return currentProvider;
}

// 设置当前 provider
function setCurrentProvider(provider) {
    if (provider === 'deepseek' || provider === 'qwen') {
        currentProvider = provider;
        console.log('[Config] Provider changed to:', provider);
    }
}

// 获取当前 API Key
function getCurrentApiKey() {
    return currentProvider === 'qwen' ? QWEN_API_KEY : DEEPSEEK_API_KEY;
}

// 获取当前 API URL
function getCurrentApiUrl() {
    return currentProvider === 'qwen' ? QWEN_API_URL : DEEPSEEK_API_URL;
}

// 获取当前模型名称
function getCurrentModelName() {
    return currentProvider === 'qwen' ? QWEN_MODEL_NAME : MODEL_NAME;
}

function loadSettings() {
    try {
        // 优先从config.json加载
        const configPath = pmPaths.getConfigPath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(data);

            // DeepSeek 配置
            if (config.api?.deepseek?.key) {
                DEEPSEEK_API_KEY = config.api.deepseek.key;
            }
            if (config.api?.deepseek?.baseUrl) {
                DEEPSEEK_API_URL = config.api.deepseek.baseUrl;
            }
            if (config.api?.deepseek?.model) {
                MODEL_NAME = config.api.deepseek.model;
            }
            if (config.api?.deepseek?.reasonerModel) {
                REASONER_MODEL_NAME = config.api.deepseek.reasonerModel;
            }

            // Qwen 配置
            if (config.api?.qwen?.key) {
                QWEN_API_KEY = config.api.qwen.key;
            }
            if (config.api?.qwen?.baseUrl) {
                QWEN_API_URL = config.api.qwen.baseUrl;
            }
            if (config.api?.qwen?.model) {
                QWEN_MODEL_NAME = config.api.qwen.model;
            }

            // Agent provider 配置
            if (config.agent?.provider) {
                currentProvider = config.agent.provider;
            }

            if (config.security?.rejectUnauthorized !== undefined) {
                appSettings.rejectUnauthorized = config.security.rejectUnauthorized;
            }
            if (config.timeouts?.apiTimeoutMs) {
                appSettings.timeoutMs = config.timeouts.apiTimeoutMs;
            }
            console.log('[Config] Loaded from config.json, provider:', currentProvider);
        }

        // 兼容旧的settings.json
        const settingsPath = pmPaths.getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(data);
            appSettings = { ...appSettings, ...settings };
            console.log('[Settings] Loaded:', appSettings);
        }

        // 如果没有配置API密钥，尝试从环境变量读取
        if (!DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY) {
            DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
            console.log('[Config] Loaded DeepSeek API key from environment');
        }
        if (!QWEN_API_KEY && process.env.DASHSCOPE_API_KEY) {
            QWEN_API_KEY = process.env.DASHSCOPE_API_KEY;
            console.log('[Config] Loaded Qwen API key from environment');
        }

        // 检查API密钥是否已配置
        if (currentProvider === 'deepseek') {
            if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
                console.warn('[Config] WARNING: DeepSeek API key not configured!');
            }
        } else {
            if (!QWEN_API_KEY) {
                console.warn('[Config] WARNING: Qwen API key not configured!');
            }
        }
    } catch (e) {
        console.error('[Config] Load error:', e);
    }
}

function saveSettings(settings) {
    try {
        appSettings = settings;
        const settingsPath = pmPaths.getSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('[Settings] Saved:', appSettings);
    } catch (e) {
        console.error('[Settings] Save error:', e);
    }
}

// 首次运行：从程序目录迁移旧数据到 AppData
pmPaths.migrateFromLegacyDir(__dirname);

// 打包版首次运行：清空旧的全局数据
pmPaths.cleanLegacyDataForPackagedApp();

loadSettings();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseTimeRange(timeStr) {
    const [start, end] = timeStr.split('-');
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    return {
        startMinutes: startHour * 60 + startMin,
        endMinutes: endHour * 60 + endMin,
        startHour, startMin, endHour, endMin
    };
}

// ============ 数据文件操作 ============

function getDataFilePath() {
    return pmPaths.getDataFilePath();
}

function getBackupDir() {
    return pmPaths.getBackupDir();
}

function getAgentLogPath() {
    return pmPaths.getAgentLogPath();
}

function readScheduleData() {
    try {
        const content = fs.readFileSync(getDataFilePath(), 'utf8');
        return JSON.parse(content);
    } catch (error) {
        return { startDate: '', endDate: '', schedules: {} };
    }
}

function writeScheduleData(data) {
    // 写入前先创建备份
    createBackup('data.json');

    fs.writeFileSync(getDataFilePath(), safeJsonStringify(data, 2), 'utf8');
}

// 创建数据备份
function createBackup(filename) {
    try {
        const sourcePath = pmPaths.getDataPath(filename);
        if (!fs.existsSync(sourcePath)) {
            return;  // 文件不存在，无需备份
        }

        const backupDir = getBackupDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        const backupFilename = `${filename.split('.')[0]}_${timestamp}_${time}.json`;
        const backupPath = path.join(backupDir, backupFilename);

        fs.copyFileSync(sourcePath, backupPath);
        console.log(`[Backup] Created: ${backupFilename}`);

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
            .map(f => ({
                name: f,
                path: path.join(backupDir, f),
                time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        // 保留最新的10个备份
        if (files.length > 10) {
            files.slice(10).forEach(f => {
                fs.unlinkSync(f.path);
                console.log(`[Backup] Deleted old backup: ${f.name}`);
            });
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
        return { userProfile: {}, conversations: [], archivedConversations: [], lastUpdate: '' };
    }
}

function writeAgentHistory(data) {
    fs.writeFileSync(getAgentLogPath(), safeJsonStringify(data, 2), 'utf8');
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

// ============ 网络测试功能 ============

async function testNetworkConnection() {
    console.log('=================================================');
    console.log('[Network Test] Testing connection to Deepseek API...');
    console.log('[Network Test] API URL:', DEEPSEEK_API_URL);
    console.log('[Network Test] Model:', MODEL_NAME);
    console.log('[Network Test] API Key:', DEEPSEEK_API_KEY.substring(0, 10) + '...' + DEEPSEEK_API_KEY.slice(-4));
    console.log('[Network Test] API Key Length:', DEEPSEEK_API_KEY.length);

    // 验证API密钥格式
    if (!DEEPSEEK_API_KEY.startsWith('sk-')) {
        console.error('[Network Test] API Key format error: should start with "sk-"');
        return false;
    }
    if (DEEPSEEK_API_KEY.length !== 35) {  // "sk-" + 32 chars = 35
        console.warn('[Network Test] API Key length unusual:', DEEPSEEK_API_KEY.length, '(expected 35)');
    }

    const url = new URL(DEEPSEEK_API_URL);

    // 使用实际的API请求来测试（带简单的测试消息）
    const testBody = {
        model: MODEL_NAME,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        stream: false
    };

    const bodyStr = JSON.stringify(testBody);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(bodyStr)
    };

    console.log('[Network Test] Request headers:', {
        'Content-Type': headers['Content-Type'],
        'Authorization': headers['Authorization'].substring(0, 25) + '...',
        'Content-Length': headers['Content-Length']
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: headers,
            timeout: appSettings.enableTimeout ? appSettings.timeoutMs : 0,
            rejectUnauthorized: appSettings.rejectUnauthorized !== false
        }, (res) => {
            console.log('[Network Test] Response status:', res.statusCode);
            console.log('[Network Test] Response headers:', JSON.stringify(res.headers, null, 2));

            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('[Network Test] Connection successful! API key is valid.');
                    resolve(true);
                } else if (res.statusCode === 401) {
                    console.error('[Network Test] Authentication failed (401)');
                    console.error('[Network Test] Please check:');
                    console.error('  1. API key configured in config.json');
                    console.error('  2. Visit: https://platform.deepseek.com/ to verify your key');
                    console.error('  3. Check account balance/quota');
                    console.error('[Network Test] Response:', responseData.substring(0, 500));
                    resolve(false);
                } else if (res.statusCode === 429) {
                    console.warn('[Network Test] Rate limit exceeded (429)');
                    resolve(true); // 网络正常，只是限流
                } else {
                    console.error('[Network Test] Unexpected status:', res.statusCode);
                    console.error('[Network Test] Response:', responseData.substring(0, 500));
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Network Test] Connection error:', err.message);
            console.error('[Network Test] Error code:', err.code);
            console.log('[Network Test] Possible causes:');
            console.log('  - No internet connection');
            console.log('  - Firewall blocking the request');
            console.log('  - DNS resolution failed');
            console.log('  - Proxy configuration needed');
            resolve(false);
        });

        if (appSettings.enableTimeout) {
            req.on('timeout', () => {
                console.error('[Network Test] Connection timeout');
                req.destroy();
                resolve(false);
            });
        }

        req.write(bodyStr);
        req.end();
    });
}



// ============ 工具定义 - 简化版 ============

// 获取课程图标
function getCourseIcon(courseName) {
    const icons = {
        '数学': '∫',
        '英语': 'Aa',
        '语文': '文',
        '物理': 'F',
        '化学': '化',
        '生物': 'DNA',
        '历史': '史',
        '地理': 'G',
        '政治': '法',
        '体育': '体',
        '音乐': '乐',
        '美术': '美',
        '计算机': 'PC',
        '编程': 'Code',
        '形势与政策': '政',
        '马克思主义': '马'
    };

    for (const [key, icon] of Object.entries(icons)) {
        if (courseName.includes(key)) {
            return icon;
        }
    }
    return '';
}

function getTools() {
    // 从 ai-tools.js 导入的统一工具定义
    return AI_TOOLS;
}

// ============ 工具执行 ============

function executeToolCall(toolCall, scheduleData) {
    // 安全解析工具调用
    // DeepSeek API格式: toolCall.function.name, toolCall.function.arguments
    let name, args, callId;

    if (typeof toolCall === 'string') {
        name = toolCall;
        args = {};
        callId = 'call_unknown';
    } else {
        // DeepSeek返回的格式是 { id, type, function: { name, arguments } }
        callId = toolCall.id || 'call_unknown';
        name = toolCall.function?.name || toolCall.name;
        const argsStr = toolCall.function?.arguments || toolCall.arguments || '{}';

        try {
            args = JSON.parse(argsStr);
        } catch (e) {
            console.error('[Tool] Failed to parse arguments:', argsStr);
            args = {};
        }
    }

    const schedules = scheduleData?.schedules || {};
    console.log('[Tool] Executing:', name, args, 'call_id:', callId);

    // ========== 工具路由：兼容旧工具名称 ==========
    // 将旧工具名称的调用重新路由到新的合并工具
    const TOOL_ROUTING = {
        'list_schedules': 'view_schedule',
        'list_all_dates': 'view_schedule',
        'search_schedules': 'view_schedule',
        'search_keyword': 'view_schedule',
        'get_date_schedule': 'view_schedule',
        'add_recurring_schedule': 'add_schedule',
        'batch_modify_schedules': 'modify_schedule',
        'batch_delete_schedule': 'modify_schedule',
        'suggest_schedule_edit': 'modify_schedule',
        'edit_time_slot': 'modify_schedule',
        'detect_schedule_conflicts': 'check_conflicts',
        'add_task': 'manage_tasks',
        'view_tasks': 'manage_tasks',
        'complete_task': 'manage_tasks',
        'update_task': 'manage_tasks',
        'delete_task_proposal': 'manage_tasks',
        'delete_task': 'manage_tasks',
        'batch_delete_tasks': 'manage_tasks',
        'add_big_task': 'manage_big_tasks',
        'list_big_tasks': 'manage_big_tasks',
        'complete_big_task': 'manage_big_tasks',
        'update_big_task': 'manage_big_tasks',
        'delete_big_task_proposal': 'manage_big_tasks',
        'delete_big_task': 'manage_big_tasks',
        'batch_delete_big_tasks': 'manage_big_tasks',
        'break_down_big_task': 'manage_big_tasks',
        'create_course_schedule': 'manage_courses',
        'add_course': 'manage_courses',
        'modify_course': 'manage_courses',
        'remove_course': 'manage_courses',
        'list_courses': 'manage_courses',
        'swap_courses': 'manage_courses',
        'adjust_schedule_by_week': 'manage_courses',
        'analyze_course_load': 'manage_courses',
        'import_course_schedule': 'manage_courses',
        'export_course_schedule': 'manage_courses',
        'batch_manage_courses': 'manage_courses',
        'check_conflicts': 'check_conflicts',
        'suggest_optimization': 'analyze',
        'analyze_schedule_patterns': 'analyze',
        'check_ddl_status': 'analyze',
        'suggest_time_for_activity': 'analyze',
        'apply_schedule_template': 'manage_templates',
        'get_user_habits': 'analyze',
        'smart_reschedule': 'analyze'
    };

    // 将旧工具名称映射到新名称
    const routedName = TOOL_ROUTING[name] || name;

    // 适配旧工具参数到新工具参数
    let routedArgs = { ...args };
    if (routedName === 'view_schedule' && name === 'list_schedules') {
        routedArgs.list_all = true;
    } else if (routedName === 'view_schedule' && (name === 'search_schedules' || name === 'search_keyword')) {
        routedArgs.keyword = args.keyword;
    } else if (routedName === 'manage_tasks' && name === 'add_task') {
        routedArgs.action = 'add';
    } else if (routedName === 'manage_tasks' && name === 'view_tasks') {
        routedArgs.action = 'view';
        routedArgs.date = args.date;
    } else if (routedName === 'manage_tasks' && name === 'complete_task') {
        routedArgs.action = 'complete';
        routedArgs.actual_minutes = args.actual_minutes;
    } else if (routedName === 'manage_tasks' && name === 'update_task') {
        routedArgs.action = 'update';
        routedArgs.new_task_name = args.new_task_name;
        routedArgs.new_estimated_minutes = args.new_estimated_minutes;
        routedArgs.new_note = args.new_note;
    } else if (routedName === 'manage_tasks' && (name === 'delete_task_proposal' || name === 'delete_task')) {
        routedArgs.action = 'delete';
    } else if (routedName === 'manage_tasks' && name === 'batch_delete_tasks') {
        routedArgs.action = 'batch_delete';
        routedArgs.tasks = args.tasks;
    } else if (routedName === 'manage_big_tasks' && name === 'add_big_task') {
        routedArgs.action = 'add';
    } else if (routedName === 'manage_big_tasks' && name === 'list_big_tasks') {
        routedArgs.action = 'view';
        routedArgs.filter = args.filter;
    } else if (routedName === 'manage_big_tasks' && name === 'complete_big_task') {
        routedArgs.action = 'complete';
    } else if (routedName === 'manage_big_tasks' && name === 'update_big_task') {
        routedArgs.action = 'update';
        routedArgs.new_task_name = args.new_task_name;
        routedArgs.new_estimated_minutes = args.new_estimated_minutes;
        routedArgs.new_ddl = args.new_ddl;
        routedArgs.new_task_type = args.new_task_type;
        routedArgs.new_start_date = args.new_start_date;
        routedArgs.new_note = args.new_note;
    } else if (routedName === 'manage_big_tasks' && (name === 'delete_big_task_proposal' || name === 'delete_big_task')) {
        routedArgs.action = 'delete';
    } else if (routedName === 'manage_big_tasks' && name === 'batch_delete_big_tasks') {
        routedArgs.action = 'batch_delete';
        routedArgs.task_names = args.task_names;
    } else if (routedName === 'manage_big_tasks' && name === 'break_down_big_task') {
        routedArgs.action = 'break_down';
        routedArgs.subtasks = args.subtasks;
    } else if (routedName === 'manage_courses' && name === 'create_course_schedule') {
        routedArgs.action = 'create';
        routedArgs.courses = args.courses;
    } else if (routedName === 'manage_courses' && name === 'add_course') {
        routedArgs.action = 'add';
    } else if (routedName === 'manage_courses' && name === 'modify_course') {
        routedArgs.action = 'modify';
    } else if (routedName === 'manage_courses' && name === 'remove_course') {
        routedArgs.action = 'remove';
    } else if (routedName === 'manage_courses' && name === 'list_courses') {
        routedArgs.action = 'list';
        routedArgs.weekday_filter = args.weekday;
        routedArgs.keyword = args.keyword;
    } else if (routedName === 'manage_courses' && name === 'swap_courses') {
        routedArgs.action = 'swap';
    } else if (routedName === 'manage_courses' && name === 'adjust_schedule_by_week') {
        routedArgs.action = 'adjust_week';
    } else if (routedName === 'manage_courses' && name === 'analyze_course_load') {
        routedArgs.action = 'analyze_load';
    } else if (routedName === 'manage_courses' && name === 'import_course_schedule') {
        routedArgs.action = 'import';
    } else if (routedName === 'manage_courses' && name === 'export_course_schedule') {
        routedArgs.action = 'export';
        routedArgs.export_format = args.format;
    } else if (routedName === 'manage_courses' && name === 'batch_manage_courses') {
        routedArgs.action = 'batch_manage';
        routedArgs.batch_operation = args.operation;
    } else if (routedName === 'modify_schedule' && name === 'batch_modify_schedules') {
        routedArgs.operation = args.operation;
        routedArgs.criteria = args.criteria;
        routedArgs.new_details = args.new_details;
    } else if (routedName === 'modify_schedule' && name === 'batch_delete_schedule') {
        routedArgs.operation = 'batch_delete_dates';
        routedArgs.dates = args.dates;
    } else if (routedName === 'analyze' && name === 'suggest_optimization') {
        routedArgs.action = 'optimize';
    } else if (routedName === 'analyze' && name === 'analyze_schedule_patterns') {
        routedArgs.action = 'patterns';
    } else if (routedName === 'analyze' && name === 'check_ddl_status') {
        routedArgs.action = 'ddl_status';
    } else if (routedName === 'analyze' && name === 'get_user_habits') {
        routedArgs.action = 'habits';
    } else if (routedName === 'analyze' && name === 'smart_reschedule') {
        routedArgs.action = 'optimize';
    } else if (routedName === 'add_schedule' && name === 'add_recurring_schedule') {
        routedArgs.start_date = args.startDate;
        routedArgs.end_date = args.endDate;
        routedArgs.repeat_pattern = args.repeatPattern;
        routedArgs.weekdays = args.weekdays;
        routedArgs.title = args.title;
        routedArgs.highlights = args.highlights;
        // 将单时间段的周期添加转换为timeSlots数组
        routedArgs.timeSlots = [{
            time: args.time,
            activity: args.activity,
            detail: args.detail,
            icon: args.icon
        }];
    }

    switch (routedName) {
        case 'view_schedule': {
            // 合并 view_schedule + list_schedules + search_schedules
            if (routedArgs.list_all) {
                const dates = Object.keys(schedules).sort();
                return JSON.stringify({ dates, count: dates.length });
            }
            if (routedArgs.keyword) {
                const sanitize = s => (s || '').replace(/[\uD800-\uDFFF]/g, '');
                const safeKeyword = sanitize(routedArgs.keyword).toLowerCase();
                const results = [];
                if (safeKeyword) {
                    for (const [date, schedule] of Object.entries(schedules)) {
                        const text = `${sanitize(schedule.title)} ${sanitize(schedule.highlights)} ${(schedule.timeSlots || []).map(s => sanitize(s.activity)).join(' ')}`.toLowerCase();
                        if (text.includes(safeKeyword)) {
                            results.push({ date, title: sanitize(schedule.title) });
                        }
                    }
                }
                return safeJsonStringify({ keyword: safeKeyword, results, count: results.length });
            }
            const date = routedArgs.date;
            const schedule = schedules[date];
            if (!schedule) {
                const availableDates = Object.keys(schedules).sort();
                return JSON.stringify({ exists: false, date, message: `${date} 没有安排`, availableDates });
            }
            return JSON.stringify({
                exists: true, date,
                title: schedule.title,
                highlights: schedule.highlights,
                timeSlots: schedule.timeSlots || []
            });
        }

        case 'add_schedule': {
            // 合并 add_schedule + add_recurring_schedule
            if (routedArgs.start_date) {
                // 周期性添加
                const startDate = routedArgs.start_date;
                const endDate = routedArgs.end_date;
                const repeatPattern = routedArgs.repeat_pattern;
                const targetWeekdays = routedArgs.weekdays || [];
                const timeSlots = routedArgs.timeSlots || [];

                if (!startDate || !repeatPattern || timeSlots.length === 0) {
                    return JSON.stringify({ success: false, error: '缺少必要参数' });
                }

                const datesToAdd = [];
                const start = new Date(startDate);
                const end = endDate ? new Date(endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

                if (repeatPattern === 'daily') {
                    let current = new Date(start);
                    while (current <= end) {
                        datesToAdd.push(current.toISOString().split('T')[0]);
                        current.setDate(current.getDate() + 1);
                    }
                } else if (repeatPattern === 'weekly') {
                    let current = new Date(start);
                    while (current <= end) {
                        if (targetWeekdays.includes(current.getDay())) {
                            const dateStr = current.toISOString().split('T')[0];
                            if (!datesToAdd.includes(dateStr)) datesToAdd.push(dateStr);
                        }
                        current.setDate(current.getDate() + 1);
                    }
                } else if (repeatPattern === 'weekdays') {
                    let current = new Date(start);
                    while (current <= end) {
                        if (current.getDay() >= 1 && current.getDay() <= 5) {
                            datesToAdd.push(current.toISOString().split('T')[0]);
                        }
                        current.setDate(current.getDate() + 1);
                    }
                }

                let successCount = 0;
                let skippedCount = 0;
                const addedDates = [];

                for (const date of datesToAdd) {
                    if (!scheduleData.schedules[date]) {
                        scheduleData.schedules[date] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] };
                    }

                    const { startMinutes, endMinutes } = parseTimeRange(timeSlots[0].time);
                    let hasConflict = false;
                    for (const existing of scheduleData.schedules[date].timeSlots || []) {
                        const { startMinutes: sStart, endMinutes: sEnd } = parseTimeRange(existing.time);
                        if (!(endMinutes <= sStart || startMinutes >= sEnd)) { hasConflict = true; break; }
                    }

                    if (hasConflict) { skippedCount++; continue; }

                    const newSlot = {
                        time: timeSlots[0].time,
                        activity: timeSlots[0].activity || '未命名活动',
                        detail: timeSlots[0].detail || '',
                        icon: timeSlots[0].icon || ''
                    };
                    scheduleData.schedules[date].timeSlots.push(newSlot);
                    scheduleData.schedules[date].timeSlots.sort((a, b) => a.time.localeCompare(b.time));
                    if (routedArgs.title) scheduleData.schedules[date].title = routedArgs.title;
                    if (routedArgs.highlights) scheduleData.schedules[date].highlights = routedArgs.highlights;
                    successCount++;
                    addedDates.push(date);
                }

                writeScheduleData(scheduleData);
                return JSON.stringify({
                    success: true, repeatPattern, successCount, skippedCount, addedDates,
                    message: `已周期性添加：成功 ${successCount} 个，跳过 ${skippedCount} 个`,
                    shouldRefresh: true
                });
            }

            // 单次添加
            const date = routedArgs.date;
            const timeSlots = routedArgs.timeSlots || [];

            if (!date || timeSlots.length === 0) {
                return JSON.stringify({ success: false, error: '缺少必要参数：需要 date(YYYY-MM-DD) 和 timeSlots 数组' });
            }

            if (!schedules[date]) {
                schedules[date] = { title: routedArgs.title || '', highlights: routedArgs.highlights || '', milestone: '', timeSlots: [] };
            }

            const addedSlots = [];
            const conflicts = [];

            for (const slot of timeSlots) {
                const timeRegex = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
                if (!timeRegex.test(slot.time)) { conflicts.push({ slot, error: '时间格式错误' }); continue; }

                const { startMinutes, endMinutes } = parseTimeRange(slot.time);
                let hasConflict = false;
                for (const existing of schedules[date].timeSlots || []) {
                    const { startMinutes: sStart, endMinutes: sEnd } = parseTimeRange(existing.time);
                    if (!(endMinutes <= sStart || startMinutes >= sEnd)) {
                        hasConflict = true;
                        conflicts.push({ slot, error: `与 ${existing.time} ${existing.activity} 冲突` });
                        break;
                    }
                }

                if (hasConflict) continue;

                const newSlot = { time: slot.time, activity: slot.activity || '未命名活动', detail: slot.detail || '', icon: slot.icon || '' };
                schedules[date].timeSlots.push(newSlot);
                addedSlots.push(newSlot);
            }

            schedules[date].timeSlots.sort((a, b) => a.time.localeCompare(b.time));
            if (routedArgs.title) schedules[date].title = routedArgs.title;
            if (routedArgs.highlights) schedules[date].highlights = routedArgs.highlights;

            writeScheduleData(scheduleData);
            return JSON.stringify({
                success: true, date, addedCount: addedSlots.length, addedSlots, conflicts,
                message: `已为 ${date} 添加 ${addedSlots.length} 个时间段`,
                shouldRefresh: true
            });
        }

        case 'modify_schedule': {
            // 合并所有修改/删除日程的工具
            const operation = routedArgs.operation;
            const date = routedArgs.date;

            if (operation === 'batch_delete_dates') {
                const dates = routedArgs.dates;
                const reason = routedArgs.reason;
                if (!dates || dates.length === 0) {
                    return JSON.stringify({ success: false, error: '没有指定要删除的日期' });
                }
                const validDates = [];
                const datesDetail = [];
                for (const d of dates) {
                    const schedule = scheduleData?.schedules?.[d];
                    if (schedule && (schedule.timeSlots?.length > 0 || schedule.tasks?.length > 0)) {
                        validDates.push(d);
                        datesDetail.push({ date: d, title: schedule.title || '', timeSlots: (schedule.timeSlots || []).map(s => ({ time: s.time, activity: s.activity, detail: s.detail || '' })), tasks: (schedule.tasks || []).map(t => ({ name: t.name, estimated: t.estimated })) });
                    }
                }
                if (validDates.length === 0) {
                    return JSON.stringify({ success: false, error: '指定的日期中没有找到需要删除的安排' });
                }
                return JSON.stringify({
                    success: true, content: `**批量删除提案**\n\n原因：${reason}\n\n将删除 ${validDates.length} 个日期的安排\n\n请在对话框中确认或取消。`,
                    proposal: { type: 'batch_delete_schedule', dates: validDates, datesDetail, reason }
                });
            }

            if (operation === 'delete_all_matching') {
                const criteria = routedArgs.criteria || {};
                const reason = routedArgs.reason;
                const affectedDates = [];
                for (const [d, schedule] of Object.entries(schedules)) {
                    const slots = schedule.timeSlots || [];
                    const matched = slots.filter(s =>
                        (!criteria.activity || sanitizeStr(s.activity).includes(sanitizeStr(criteria.activity))) &&
                        (!criteria.date || d === criteria.date)
                    );
                    if (matched.length > 0) affectedDates.push({ date: d, slots: matched });
                }
                if (affectedDates.length === 0) {
                    const availableActivities = [...new Set(Object.values(schedules).flatMap(s => (s.timeSlots || []).map(sl => sl.activity)))];
                    return JSON.stringify({ success: false, error: `未找到匹配的日程。可用活动：${availableActivities.join('、')}` });
                }
                return JSON.stringify({
                    success: true, type: 'proposal',
                    proposal: { type: 'batch_modify_schedules', operation, criteria, new_details: routedArgs.new_details, reason, affectedDates: affectedDates.map(d => ({ date: d.date, count: d.slots.length })), description: `批量删除 ${affectedDates.length} 个日期中匹配的 ${affectedDates.reduce((a, d) => a + d.slots.length, 0)} 项安排` }
                });
            }

            if (operation === 'update_all_matching') {
                const criteria = routedArgs.criteria || {};
                const newDetails = routedArgs.new_details || {};
                const reason = routedArgs.reason;
                const affectedDates = [];
                for (const [d, schedule] of Object.entries(schedules)) {
                    const slots = schedule.timeSlots || [];
                    const matched = slots.filter(s =>
                        (!criteria.activity || sanitizeStr(s.activity).includes(sanitizeStr(criteria.activity))) &&
                        (!criteria.date || d === criteria.date)
                    );
                    if (matched.length > 0) affectedDates.push({ date: d, slots: matched });
                }
                if (affectedDates.length === 0) {
                    return JSON.stringify({ success: false, error: '未找到匹配的日程' });
                }
                const changes = [];
                if (newDetails.activity) changes.push(`活动改为"${newDetails.activity}"`);
                if (newDetails.time) changes.push(`时间改为${newDetails.time}`);
                return JSON.stringify({
                    success: true, type: 'proposal',
                    proposal: { type: 'batch_modify_schedules', operation, criteria, new_details: newDetails, reason, affectedDates: affectedDates.map(d => ({ date: d.date, count: d.slots.length })), description: `批量修改 ${affectedDates.length} 个日期中的 ${changes.join('，')}` }
                });
            }

            // Default: return proposal for delete_slots, modify_slot, add_slot, etc.
            return JSON.stringify({
                type: 'proposal', date, changes: routedArgs.changes || [], reason: routedArgs.reason,
                proposal: { type: 'modify_schedule', operation, date, changes: routedArgs.changes, reason: routedArgs.reason, timeSlots: routedArgs.timeSlots, newSlotDetails: routedArgs.newSlotDetails, criteria: routedArgs.criteria, new_details: routedArgs.new_details }
            });
        }

        case 'check_conflicts': {
            const date = routedArgs.date;
            const timeSlot = routedArgs.time_slot;
            if (!date || !timeSlot) {
                return JSON.stringify({ success: false, error: '缺少日期或时间段' });
            }
            // Inlined conflict detection
            const [sS, sE] = parseTimeRange(timeSlot);
            const conflicts = [];
            for (const slot of (scheduleData?.schedules?.[date]?.timeSlots || [])) {
                const [eS, eE] = parseTimeRange(slot.time);
                if (!(sE <= eS || sS >= eE)) conflicts.push({ existingActivity: slot.activity, existingTime: slot.time });
            }
            return JSON.stringify({
                success: true, date, timeSlot,
                hasConflicts: conflicts.length > 0,
                conflicts
            });
        }

        // ========== 5. manage_tasks (合并 add/view/complete/update/delete/batch_delete) ==========
        case 'manage_tasks': {
            const action = routedArgs.action;
            switch (action) {
                case 'add': {
                    const date = routedArgs.date;
                    const taskName = routedArgs.task_name;
                    const estimatedMinutes = routedArgs.estimated_minutes;
                    const note = routedArgs.note || '';
                    if (!date || !taskName || !estimatedMinutes) return JSON.stringify({ success: false, error: '缺少必要参数' });
                    if (!scheduleData.schedules) scheduleData.schedules = {};
                    if (!scheduleData.schedules[date]) scheduleData.schedules[date] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] };
                    if (!scheduleData.schedules[date].tasks) scheduleData.schedules[date].tasks = [];
                    if (!scheduleData.schedules[date].timeSlots) scheduleData.schedules[date].timeSlots = [];
                    scheduleData.schedules[date].tasks.push({ name: taskName, estimated: estimatedMinutes.toString(), actual: '', note, completed: false });
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `已为 ${date} 添加任务：${taskName}（预计${estimatedMinutes}分钟）`, shouldRefresh: true });
                }
                case 'view': {
                    const date = routedArgs.date;
                    const schedule = scheduleData?.schedules?.[date];
                    if (!schedule || !schedule.tasks || schedule.tasks.length === 0) {
                        return JSON.stringify({ success: true, content: `${date} 的任务列表\n\n暂无任务。` });
                    }
                    const parts = [`${date} 的任务列表\n\n`];
                    const pending = schedule.tasks.filter(t => !t.completed);
                    const done = schedule.tasks.filter(t => t.completed);
                    if (pending.length > 0) { parts.push(`[ ] 待完成 (${pending.length})\n`); pending.forEach(t => parts.push(`  [ ] ${t.name} - 预计${t.estimated}分钟\n`)); parts.push('\n'); }
                    if (done.length > 0) { parts.push(`已完成 (${done.length})\n`); done.forEach(t => parts.push(`  [x] ${t.name} - 预计${t.estimated}分钟，实际${t.actual || '?'}分钟\n`)); }
                    parts.push(`\n完成率：${schedule.tasks.length > 0 ? Math.round((done.length / schedule.tasks.length) * 100) : 0}%`);
                    return JSON.stringify({ success: true, content: parts.join('') });
                }
                case 'complete': {
                    const date = routedArgs.date;
                    const taskName = routedArgs.task_name;
                    const actualMinutes = routedArgs.actual_minutes;
                    const schedule = scheduleData?.schedules?.[date];
                    if (!schedule || !schedule.tasks) return JSON.stringify({ success: false, content: `在 ${date} 没有找到任务。` });
                    const task = schedule.tasks.find(t => t.name === taskName);
                    if (!task) return JSON.stringify({ success: false, content: `在 ${date} 没有找到"${taskName}"。` });
                    task.completed = true; task.actual = (actualMinutes || 0).toString();
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `任务已完成：${taskName}（实际${actualMinutes || '?'}分钟）`, shouldRefresh: true });
                }
                case 'update': {
                    const date = routedArgs.date;
                    const oldTaskName = routedArgs.old_task_name || routedArgs.task_name;
                    const newTaskName = routedArgs.new_task_name;
                    const newEstimatedMinutes = routedArgs.new_estimated_minutes;
                    const reason = routedArgs.reason;
                    const schedule = scheduleData?.schedules?.[date];
                    if (!schedule || !schedule.tasks) return JSON.stringify({ success: false, content: `在 ${date} 没有找到任务。` });
                    const task = schedule.tasks.find(t => t.name === oldTaskName);
                    if (!task) return JSON.stringify({ success: false, content: `在 ${date} 没有找到"${oldTaskName}"。` });
                    const changes = [];
                    if (newTaskName && newTaskName !== oldTaskName) changes.push(`名称：${oldTaskName} -> ${newTaskName}`);
                    if (newEstimatedMinutes && newEstimatedMinutes.toString() !== task.estimated) changes.push(`用时：${task.estimated}分钟 -> ${newEstimatedMinutes}分钟`);
                    if (changes.length === 0) return JSON.stringify({ success: false, content: '没有检测到修改。' });
                    return JSON.stringify({
                        success: true, content: `**修改任务提案**\n\n原因：${reason}\n\n${changes.map(c => '* ' + c).join('\n')}\n\n请确认。`,
                        proposal: { type: 'update_task', date, oldTaskName, newTaskName: newTaskName || oldTaskName, newEstimatedMinutes: newEstimatedMinutes || parseInt(task.estimated), reason }
                    });
                }
                case 'delete': {
                    const date = routedArgs.date;
                    const taskName = routedArgs.task_name;
                    const reason = routedArgs.reason;
                    const schedule = scheduleData?.schedules?.[date];
                    if (!schedule || !schedule.tasks) return JSON.stringify({ success: false, content: `在 ${date} 没有找到任务。` });
                    const task = schedule.tasks.find(t => t.name === taskName);
                    if (!task) return JSON.stringify({ success: false, content: `在 ${date} 没有找到"${taskName}"。` });
                    return JSON.stringify({
                        success: true, content: `**删除任务提案**\n\n原因：${reason}\n\n任务：${taskName}（预计${task.estimated}分钟）\n\n请确认。`,
                        proposal: { type: 'delete_task', date, taskName, reason }
                    });
                }
                case 'batch_delete': {
                    const tasks = routedArgs.tasks || [];
                    const reason = routedArgs.reason;
                    if (tasks.length === 0) return JSON.stringify({ success: false, content: '没有指定要删除的任务。' });
                    const validTasks = [];
                    for (const ti of tasks) {
                        const sch = scheduleData?.schedules?.[ti.date];
                        if (sch?.tasks?.find(t => t.name === ti.task_name)) validTasks.push(ti);
                    }
                    if (validTasks.length === 0) return JSON.stringify({ success: false, content: '没有找到任何任务。' });
                    return JSON.stringify({
                        success: true, content: `**批量删除任务提案**\n\n原因：${reason}\n\n将删除 ${validTasks.length} 个任务。\n\n请确认。`,
                        proposal: { type: 'batch_delete_tasks', tasks: validTasks, reason }
                    });
                }
                default:
                    return JSON.stringify({ success: false, error: `manage_tasks: 未知 action "${action}"` });
            }
        }

        // ========== 6. manage_big_tasks (合并 add/complete/view/update/delete/batch_delete/break_down) ==========
        case 'manage_big_tasks': {
            const action = routedArgs.action;
            switch (action) {
                case 'add': {
                    const taskName = routedArgs.task_name;
                    const estimatedMinutes = routedArgs.estimated_minutes;
                    const ddl = routedArgs.ddl;
                    const taskType = routedArgs.task_type || 'short';
                    const startDate = routedArgs.start_date || null;
                    const note = routedArgs.note || '';
                    if (!taskName || !estimatedMinutes || !ddl) return JSON.stringify({ success: false, error: '缺少必要参数' });
                    if (!scheduleData.bigTasks) scheduleData.bigTasks = [];
                    scheduleData.bigTasks.push({ name: taskName, estimated: estimatedMinutes, ddl, taskType, startDate, note, completed: false, createdAt: new Date().toISOString() });
                    writeScheduleData(scheduleData);
                    const typeText = taskType === 'long' ? '长期任务' : '短期任务';
                    return JSON.stringify({ success: true, content: `已创建${typeText}：${taskName}\n预计：${estimatedMinutes}分钟\nDDL：${ddl}`, shouldRefresh: true });
                }
                case 'view': {
                    const filter = routedArgs.filter || 'all';
                    if (!scheduleData.bigTasks || scheduleData.bigTasks.length === 0) return JSON.stringify({ success: true, content: '大任务列表\n\n暂无大任务。' });
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    let filtered = scheduleData.bigTasks;
                    if (filter === 'pending') filtered = filtered.filter(t => !t.completed);
                    else if (filter === 'completed') filtered = filtered.filter(t => t.completed);
                    else if (filter === 'overdue') filtered = filtered.filter(t => !t.completed && t.ddl && new Date(t.ddl) < today);
                    if (filtered.length === 0) return JSON.stringify({ success: true, content: `大任务列表 (${filter})\n\n无匹配。` });
                    const parts = [`大任务列表 (${filtered.length}个)\n\n`];
                    filtered.sort((a, b) => a.ddl && b.ddl ? new Date(a.ddl) - new Date(b.ddl) : 0);
                    filtered.forEach(task => { parts.push(`${task.completed ? '[x]' : '[ ]'} ${task.name} | ${task.estimated}分钟 | DDL: ${task.ddl || '无'}\n`); });
                    return JSON.stringify({ success: true, content: parts.join('') });
                }
                case 'complete': {
                    const taskName = routedArgs.task_name;
                    const task = scheduleData.bigTasks?.find(t => t.name === taskName);
                    if (!task) return JSON.stringify({ success: false, content: `未找到"${taskName}"。` });
                    if (task.completed) return JSON.stringify({ success: true, content: `"${taskName}"已完成。` });
                    task.completed = true;
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `大任务已完成：${taskName}`, shouldRefresh: true });
                }
                case 'update': {
                    const oldTaskName = routedArgs.old_task_name || routedArgs.task_name;
                    const task = scheduleData.bigTasks?.find(t => t.name === oldTaskName);
                    if (!task) return JSON.stringify({ success: false, content: `未找到"${oldTaskName}"。` });
                    const changes = [];
                    if (routedArgs.new_task_name && routedArgs.new_task_name !== oldTaskName) changes.push(`名称：${oldTaskName} -> ${routedArgs.new_task_name}`);
                    if (routedArgs.new_estimated_minutes && routedArgs.new_estimated_minutes !== task.estimated) changes.push(`用时：${task.estimated} -> ${routedArgs.new_estimated_minutes}`);
                    if (routedArgs.new_ddl && routedArgs.new_ddl !== task.ddl) changes.push(`DDL：${task.ddl || '无'} -> ${routedArgs.new_ddl}`);
                    if (changes.length === 0) return JSON.stringify({ success: false, content: '没有检测到修改。' });
                    return JSON.stringify({
                        success: true, content: `**修改大任务提案**\n\n原因：${routedArgs.reason}\n\n${changes.map(c => '* ' + c).join('\n')}\n\n请确认。`,
                        proposal: { type: 'update_big_task', oldTaskName, newTaskName: routedArgs.new_task_name || oldTaskName, newEstimatedMinutes: routedArgs.new_estimated_minutes || task.estimated, newDdl: routedArgs.new_ddl || task.ddl, reason: routedArgs.reason }
                    });
                }
                case 'delete': {
                    const taskName = routedArgs.task_name;
                    const reason = routedArgs.reason;
                    const task = scheduleData.bigTasks?.find(t => t.name === taskName);
                    if (!task) return JSON.stringify({ success: false, content: `未找到"${taskName}"。` });
                    return JSON.stringify({
                        success: true, content: `**删除大任务提案**\n\n原因：${reason}\n\n任务：${taskName}\nDDL：${task.ddl || '无'}\n\n请确认。`,
                        proposal: { type: 'delete_big_task', taskName, reason }
                    });
                }
                case 'batch_delete': {
                    const taskNames = routedArgs.task_names || [];
                    const reason = routedArgs.reason;
                    const valid = taskNames.filter(n => scheduleData.bigTasks?.find(t => t.name === n));
                    if (valid.length === 0) return JSON.stringify({ success: false, content: '没有找到任何大任务。' });
                    return JSON.stringify({
                        success: true, content: `**批量删除大任务提案**\n\n原因：${reason}\n\n将删除 ${valid.length} 个大任务。\n\n请确认。`,
                        proposal: { type: 'batch_delete_big_tasks', taskNames: valid, reason }
                    });
                }
                case 'break_down': {
                    const bigTaskName = routedArgs.task_name || routedArgs.big_task_name;
                    const subtasks = routedArgs.subtasks || [];
                    const bigTask = scheduleData.bigTasks?.find(t => t.name === bigTaskName);
                    if (!bigTask) return JSON.stringify({ success: false, content: `未找到"${bigTaskName}"。` });
                    let count = 0;
                    for (const sub of subtasks) {
                        if (!scheduleData.schedules[sub.date]) scheduleData.schedules[sub.date] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] };
                        if (!scheduleData.schedules[sub.date].tasks) scheduleData.schedules[sub.date].tasks = [];
                        scheduleData.schedules[sub.date].tasks.push({ name: sub.name, estimated: sub.estimated_minutes.toString(), actual: '', completed: false });
                        count++;
                    }
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `已将"${bigTaskName}"分解为 ${count} 个子任务`, shouldRefresh: true });
                }
                default:
                    return JSON.stringify({ success: false, error: `manage_big_tasks: 未知 action "${action}"` });
            }
        }

        // ========== 7. manage_courses (合并 create/add/modify/remove/list/swap/adjust_week/analyze_load/import/export/batch_manage) ==========
        case 'manage_courses': {
            const action = routedArgs.action;
            switch (action) {
                case 'create': {
                    const semesterName = routedArgs.semester_name;
                    const startDate = routedArgs.start_date;
                    const endDate = routedArgs.end_date;
                    const courses = routedArgs.courses || [];
                    const skipDates = routedArgs.skip_dates || [];
                    if (!semesterName || !startDate || !endDate || !courses.length) return JSON.stringify({ success: false, error: '缺少必要参数' });
                    const start = new Date(startDate), end = new Date(endDate);
                    const skipSet = new Set(skipDates);
                    let addedCount = 0;
                    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                        const ds = date.toISOString().split('T')[0];
                        if (skipSet.has(ds)) continue;
                        const dayCourses = courses.filter(c => c.weekday === date.getDay());
                        if (!dayCourses.length) continue;
                        if (!scheduleData.schedules) scheduleData.schedules = {};
                        if (!scheduleData.schedules[ds]) scheduleData.schedules[ds] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] };
                        for (const course of dayCourses) {
                            const { startMinutes, endMinutes } = parseTimeRange(course.time);
                            let conflict = false;
                            for (const ex of scheduleData.schedules[ds].timeSlots || []) {
                                const { startMinutes: sS, endMinutes: sE } = parseTimeRange(ex.time);
                                if (!(endMinutes <= sS || startMinutes >= sE)) { conflict = true; break; }
                            }
                            if (conflict) continue;
                            const icon = typeof getCourseIcon === 'function' ? getCourseIcon(course.name) : '';
                            const detailParts = [course.location, course.teacher, course.weeks].filter(Boolean);
                            scheduleData.schedules[ds].timeSlots.push({ time: course.time, activity: course.name, detail: detailParts.join(' * '), icon });
                            addedCount++;
                        }
                        scheduleData.schedules[ds].timeSlots.sort((a, b) => a.time.localeCompare(b.time));
                    }
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `已创建课表"${semesterName}"：${startDate}至${endDate}，${courses.length}门课，${addedCount}个课时`, shouldRefresh: true });
                }
                case 'add': {
                    const courseName = routedArgs.course_name;
                    const weekday = routedArgs.weekday;
                    const time = routedArgs.time;
                    if (!courseName || weekday === undefined || !time) return JSON.stringify({ success: false, error: '缺少必要参数' });
                    const start = routedArgs.start_date ? new Date(routedArgs.start_date) : new Date();
                    const end = routedArgs.end_date ? new Date(routedArgs.end_date) : new Date(start.getTime() + 120 * 24 * 60 * 60 * 1000);
                    let count = 0;
                    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                        if (date.getDay() !== weekday) continue;
                        const ds = date.toISOString().split('T')[0];
                        if (!scheduleData.schedules) scheduleData.schedules = {};
                        if (!scheduleData.schedules[ds]) scheduleData.schedules[ds] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] };
                        const { startMinutes, endMinutes } = parseTimeRange(time);
                        let conflict = false;
                        for (const ex of scheduleData.schedules[ds].timeSlots || []) {
                            const { startMinutes: sS, endMinutes: sE } = parseTimeRange(ex.time);
                            if (!(endMinutes <= sS || startMinutes >= sE)) { conflict = true; break; }
                        }
                        if (conflict) continue;
                        const icon = typeof getCourseIcon === 'function' ? getCourseIcon(courseName) : '';
                        scheduleData.schedules[ds].timeSlots.push({ time, activity: courseName, detail: [routedArgs.location, routedArgs.teacher].filter(Boolean).join(' * '), icon });
                        scheduleData.schedules[ds].timeSlots.sort((a, b) => a.time.localeCompare(b.time));
                        count++;
                    }
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, content: `已添加课程：${courseName}，${count}个课时`, shouldRefresh: true });
                }
                case 'modify': {
                    const changes = [];
                    const old = routedArgs.old_course_info || {};
                    const nw = routedArgs.new_course_info || {};
                    if (nw.name) changes.push(`课程：${old.name} -> ${nw.name}`);
                    if (nw.weekday !== undefined) changes.push(`星期：${old.weekday} -> ${nw.weekday}`);
                    if (nw.time) changes.push(`时间：${old.time} -> ${nw.time}`);
                    if (changes.length === 0) return JSON.stringify({ success: false, content: '没有修改。' });
                    return JSON.stringify({
                        success: true, content: `**修改课程提案**\n\n原因：${routedArgs.reason}\n\n${changes.map(c => '* ' + c).join('\n')}\n\n请确认。`,
                        proposal: { type: 'modify_course', oldCourseInfo: old, newCourseInfo: nw, reason: routedArgs.reason }
                    });
                }
                case 'remove': {
                    return JSON.stringify({
                        success: true, content: `**移除课程提案**\n\n原因：${routedArgs.reason}\n\n课程：${routedArgs.course_name}\n\n请确认。`,
                        proposal: { type: 'remove_course', courseName: routedArgs.course_name, weekday: routedArgs.weekday, time: routedArgs.time, reason: routedArgs.reason }
                    });
                }
                case 'list': {
                    const wFilter = routedArgs.weekday_filter;
                    const keyword = (routedArgs.keyword || '').replace(/[\uD800-\uDFFF]/g, '').toLowerCase();
                    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                    const allCourses = [];
                    for (const [date, schedule] of Object.entries(scheduleData.schedules || {})) {
                        const dow = new Date(date).getDay();
                        if (wFilter !== undefined && dow !== wFilter) continue;
                        for (const slot of (schedule.timeSlots || [])) {
                            const name = (slot.activity || '').replace(/[\uD800-\uDFFF]/g, '');
                            if (keyword && !name.toLowerCase().includes(keyword)) continue;
                            allCourses.push({ date, weekday: dow, time: slot.time, name, detail: (slot.detail || '').replace(/[\uD800-\uDFFF]/g, '') });
                        }
                    }
                    if (!allCourses.length) return JSON.stringify({ success: true, content: '课程表\n\n暂无课程。' });
                    allCourses.sort((a, b) => a.weekday !== b.weekday ? a.weekday - b.weekday : a.time.localeCompare(b.time));
                    const parts = [`课程表 (${allCourses.length} 门)\n\n`];
                    const byDay = {};
                    allCourses.forEach(c => { (byDay[c.weekday] = byDay[c.weekday] || []).push(c); });
                    for (let d = 1; d <= 7; d++) { const dd = d === 7 ? 0 : d; if (!byDay[dd]) continue; parts.push(`[${weekdayNames[dd]}]\n`); byDay[dd].forEach(c => parts.push(`  ${c.time} ${c.name}${c.detail ? ' * ' + c.detail : ''}\n`)); parts.push('\n'); }
                    return safeJsonStringify({ success: true, content: parts.join('') });
                }
                case 'swap': {
                    const c1 = routedArgs.course1 || {}, c2 = routedArgs.course2 || {};
                    return JSON.stringify({
                        success: true, content: `**交换课程提案**\n\n原因：${routedArgs.reason}\n\n${c1.name}(${c1.date}) <-> ${c2.name}(${c2.date})\n\n请确认。`,
                        proposal: { type: 'swap_courses', course1: c1, course2: c2, reason: routedArgs.reason }
                    });
                }
                case 'adjust_week': {
                    return JSON.stringify({
                        success: true, content: `**周调整提案**\n\n原因：${routedArgs.reason}\n\n${routedArgs.source_date} -> ${routedArgs.target_date}\n\n请确认。`,
                        proposal: { type: 'adjust_schedule_by_week', sourceDate: routedArgs.source_date, targetDate: routedArgs.target_date, reason: routedArgs.reason }
                    });
                }
                case 'analyze_load': {
                    const sd = routedArgs.start_date, ed = routedArgs.end_date;
                    if (!sd || !ed) return JSON.stringify({ success: false, error: '缺少日期范围' });
                    let total = 0, hours = 0;
                    for (const [date, schedule] of Object.entries(scheduleData.schedules || {})) {
                        if (date < sd || date > ed) continue;
                        for (const slot of (schedule.timeSlots || [])) {
                            total++;
                            const { startHour: sh, endHour: eh } = parseTimeRange(slot.time);
                            hours += eh - sh;
                        }
                    }
                    return JSON.stringify({ success: true, content: `课程负荷：${total}节课，约${Math.round(hours)}小时` });
                }
                case 'import': {
                    return JSON.stringify({
                        success: true, content: `**导入课表提案**\n\n${(routedArgs.schedule_text || '').substring(0, 200)}...\n\n请确认。`,
                        proposal: { type: 'import_course_schedule', scheduleText: routedArgs.schedule_text, semesterStart: routedArgs.semester_start, semesterEnd: routedArgs.semester_end }
                    });
                }
                case 'export': {
                    const fmt = routedArgs.export_format || 'text';
                    const all = [];
                    for (const [date, schedule] of Object.entries(scheduleData.schedules || {})) {
                        const d = new Date(date);
                        for (const slot of (schedule.timeSlots || [])) {
                            all.push({ date, weekday: ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()], time: slot.time, name: slot.activity, detail: slot.detail || '' });
                        }
                    }
                    let content = '';
                    if (fmt === 'json') content = '```json\n' + JSON.stringify(all, null, 2) + '\n```';
                    else if (fmt === 'markdown') content = all.map(c => `## ${c.name}\n- ${c.weekday} ${c.time} (${c.date})${c.detail ? '\n- ' + c.detail : ''}`).join('\n\n');
                    else content = all.map(c => `${c.date} ${c.weekday} ${c.time} - ${c.name}${c.detail ? ' [' + c.detail + ']' : ''}`).join('\n');
                    return JSON.stringify({ success: true, content });
                }
                case 'batch_manage': {
                    return JSON.stringify({
                        success: true, content: `**批量管理课程提案**\n\n操作：${routedArgs.batch_operation}\n原因：${routedArgs.reason}\n\n请确认。`,
                        proposal: { type: 'batch_manage_courses', operation: routedArgs.batch_operation, courses: routedArgs.courses || [], newTimeSlot: routedArgs.new_time_slot, reason: routedArgs.reason }
                    });
                }
                default:
                    return JSON.stringify({ success: false, error: `manage_courses: 未知 action "${action}"` });
            }
        }

        // ========== 8. analyze (合并 patterns/optimize/ddl_status/habits) ==========
        case 'analyze': {
            const action = routedArgs.action;
            switch (action) {
                case 'patterns': {
                    const period = routedArgs.period || '本月';
                    const now = new Date();
                    let startDate, endDate;
                    if (period === '本周') { startDate = new Date(now); startDate.setDate(now.getDate() - now.getDay() + 1); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); }
                    else if (period === '上周') { startDate = new Date(now); startDate.setDate(now.getDate() - now.getDay() - 6); endDate = new Date(now); endDate.setDate(now.getDate() - now.getDay()); }
                    else { startDate = new Date(now.getFullYear(), now.getMonth(), 1); endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
                    const activityCount = {};
                    let totalMinutes = 0;
                    for (const [date, schedule] of Object.entries(schedules)) {
                        const d = new Date(date);
                        if (d < startDate || d > endDate) continue;
                        for (const slot of (schedule.timeSlots || [])) {
                            totalMinutes += parseTimeRange(slot.time).endMinutes - parseTimeRange(slot.time).startMinutes;
                            activityCount[slot.activity] = (activityCount[slot.activity] || 0) + 1;
                        }
                    }
                    const sorted = Object.entries(activityCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
                    return JSON.stringify({
                        success: true, period, dateRange: `${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`,
                        summary: { totalHours: Math.round(totalMinutes / 60 * 10) / 10 },
                        topActivities: sorted.map(([name, count]) => ({ name, count }))
                    });
                }
                case 'optimize': {
                    const date = routedArgs.date;
                    if (!date || !schedules[date]) return JSON.stringify({ success: true, message: '该日期没有安排，暂无建议' });
                    const slots = schedules[date].timeSlots || [];
                    if (slots.length < 2) return JSON.stringify({ success: true, message: '安排较少，暂无建议' });
                    const sorted = slots.map(s => ({ ...s, parsed: parseTimeRange(s.time) })).sort((a, b) => a.parsed.startMinutes - b.parsed.startMinutes);
                    const gaps = [];
                    for (let i = 1; i < sorted.length; i++) {
                        const gap = sorted[i].parsed.startMinutes - sorted[i - 1].parsed.endMinutes;
                        if (gap >= 30) gaps.push({ between: `${sorted[i - 1].time} 和 ${sorted[i].time}`, duration: gap });
                    }
                    return JSON.stringify({ success: true, date, totalSlots: slots.length, gaps, suggestions: gaps.length > 0 ? [`${gaps.length}段空闲超30分钟`] : [] });
                }
                case 'ddl_status': {
                    const threshold = routedArgs.days_threshold || 7;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const reminders = [];
                    for (const task of (scheduleData.bigTasks || [])) {
                        if (task.completed || !task.ddl) continue;
                        const ddlDate = new Date(task.ddl); ddlDate.setHours(0, 0, 0, 0);
                        const daysLeft = Math.ceil((ddlDate - today) / (1000 * 60 * 60 * 24));
                        if (daysLeft <= threshold) reminders.push({ taskName: task.name, ddl: task.ddl, daysLeft, level: daysLeft <= 0 ? 'critical' : daysLeft <= 3 ? 'urgent' : 'warning' });
                    }
                    return JSON.stringify({ success: true, reminders, urgentCount: reminders.filter(r => r.level === 'urgent' || r.level === 'critical').length });
                }
                case 'habits': {
                    // 简单习惯分析
                    const dayCount = {};
                    const timeCount = {};
                    for (const [date, schedule] of Object.entries(schedules)) {
                        const dow = new Date(date).getDay();
                        for (const slot of (schedule.timeSlots || [])) {
                            dayCount[dow] = (dayCount[dow] || 0) + 1;
                            const hour = slot.time.split('-')[0].split(':')[0];
                            timeCount[hour] = (timeCount[hour] || 0) + 1;
                        }
                    }
                    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                    const busiestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
                    const busiestHour = Object.entries(timeCount).sort((a, b) => b[1] - a[1])[0];
                    return JSON.stringify({
                        success: true, habits: {
                            busiestDay: busiestDay ? `${weekdayNames[busiestDay[0]]} (${busiestDay[1]}项)` : '无数据',
                            busiestHour: busiestHour ? `${busiestHour[0]}:00 (${busiestHour[1]}项)` : '无数据',
                            totalDays: Object.keys(schedules).length
                        }
                    });
                }
                default:
                    return JSON.stringify({ success: false, error: `analyze: 未知 action "${action}"` });
            }
        }

        // ========== 9. manage_templates ==========
        case 'manage_templates': {
            const action = routedArgs.action;
            switch (action) {
                case 'list': {
                    const templates = scheduleData.templates || {};
                    return JSON.stringify({ success: true, templates: Object.keys(templates), count: Object.keys(templates).length });
                }
                case 'create': {
                    if (!routedArgs.template_name || !routedArgs.template_data) return JSON.stringify({ success: false, error: '缺少模板名称或数据' });
                    if (!scheduleData.templates) scheduleData.templates = {};
                    scheduleData.templates[routedArgs.template_name] = routedArgs.template_data;
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, message: `模板"${routedArgs.template_name}"已创建` });
                }
                case 'apply': {
                    if (!routedArgs.template_name || !routedArgs.target_date) return JSON.stringify({ success: false, error: '缺少模板名称或目标日期' });
                    const template = scheduleData?.templates?.[routedArgs.template_name];
                    if (!template) return JSON.stringify({ success: false, error: `模板"${routedArgs.template_name}"不存在` });
                    return JSON.stringify({
                        success: true, type: 'proposal',
                        proposal: { type: 'apply_template', templateName: routedArgs.template_name, targetDate: routedArgs.target_date, templateData: template }
                    });
                }
                case 'delete': {
                    if (!routedArgs.template_name) return JSON.stringify({ success: false, error: '缺少模板名称' });
                    delete scheduleData?.templates?.[routedArgs.template_name];
                    writeScheduleData(scheduleData);
                    return JSON.stringify({ success: true, message: `模板"${routedArgs.template_name}"已删除` });
                }
                default:
                    return JSON.stringify({ success: false, error: `manage_templates: 未知 action "${action}"` });
            }
        }

        default:
            console.error('[Tool] Unknown tool:', routedName, '(original:', name, ')');
            return JSON.stringify({ error: 'Unknown tool', name: routedName });
    }
}

// ============ AI Agent 核心逻辑 - 支持流式输出和优化 ============

let currentStreamEvent = null;

// 判断用户消息是否需要推理模型
// 涉及规划、安排、数据修改时返回 true
function needsReasoning(message) {
    if (!message) return false;
    const msg = message.toLowerCase();

    // 规划与安排类
    const planningKeywords = [
        '规划', '计划', '安排', '排', '调整', '优化', '整理', '重新',
        '帮我安排', '帮我规划', '帮我排', '怎么安排', '怎么规划',
        '推荐', '建议', '应该', '好不好', '合理', '更好',
        '冲突', '撞了', '重叠', '空闲', '有空',
        '本周', '下周', '这周', '下周', '本月', '这个月',
        '周计划', '日计划', '月计划', '学习计划', '复习计划',
        '课表', '选课', '加课', '退课', '换课'
    ];

    // 数据修改类
    const modificationKeywords = [
        '添加', '新增', '增加', '删除', '移除', '修改', '改', '换',
        '取消', '推迟', '提前', '延期', '挪', '移',
        '添加日程', '加个', '建一个', '创建', '新建',
        '设置', '设为', '标记', '完成', '未完成',
        '批量', '全部', '所有.*删除', '所有.*改'
    ];

    // 复杂分析类
    const analysisKeywords = [
        '分析', '统计', '总结', '回顾', '对比', '比较',
        '多久', '频率', '规律', '习惯', '模式',
        '进度', 'ddl', 'deadline', '截止', ' overdue'
    ];

    for (const kw of [...planningKeywords, ...modificationKeywords, ...analysisKeywords]) {
        if (msg.includes(kw)) return true;
    }

    return false;
}

// 根据意图获取应该使用的模型名
function getModelForIntent(message) {
    const provider = getCurrentProvider();
    if (provider === 'qwen') return QWEN_MODEL_NAME;  // Qwen 走原有逻辑
    return needsReasoning(message) ? REASONER_MODEL_NAME : MODEL_NAME;
}

async function handleAgentChat(data, event = null) {
    const { message, images, history, profile, scheduleData, userProfileText } = data;
    currentStreamEvent = event;

    // 获取东八区时间
    const now = new Date();
    const utc8Offset = 8 * 60; // UTC+8 in minutes
    const utc8Now = new Date(now.getTime() + (now.getTimezoneOffset() + utc8Offset) * 60000);
    const today = `${utc8Now.getFullYear()}-${String(utc8Now.getMonth() + 1).padStart(2, '0')}-${String(utc8Now.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date(utc8Now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(utc8Now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    // 注入用户画像
    let profileSection = '';
    if (userProfileText && userProfileText.trim()) {
        profileSection = `\n\n【用户画像】\n${userProfileText.trim()}`;
    }

    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const dateInfo = `今天是 ${today}（周${weekdayNames[utc8Now.getDay()]}），昨天是 ${yesterdayStr}，明天是 ${tomorrowStr}。`;

    const systemPrompt = `你是 Mosa，一个日程管理助理。直接、高效、准确。

【当前日期】${dateInfo}时区 UTC+8。工具的 date 参数用 YYYY-MM-DD。
${profileSection}`;

    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    const recentHistory = (history || [])
        .filter(h => !h.proposal && !h.compressed)
        .slice(-8);

    for (const msg of recentHistory) {
        messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content
        });
    }

    if (message) {
        messages.push({ role: 'user', content: message });
    }

    console.log('[AI] Starting chat, messages:', messages.length);

    // 根据用户消息意图选择模型
    const useReasoning = needsReasoning(message);
    const selectedModel = getModelForIntent(message);
    console.log(`[AI] Intent detection: reasoning=${useReasoning}, model=${selectedModel}`);

    try {
        const result = await callDeepseekAPIMessages(messages, scheduleData, event, selectedModel);
        console.log('[AI] Got result');
        return result;
    } catch (error) {
        console.error('[AI] Chat error:', error);
        return {
            response: {
                content: getFallbackResponse(error),
                proposal: null
            }
        };
    }
}

// API调用（支持全流程流式输出和并行工具调用）
async function callDeepseekAPIMessages(messages, scheduleData, event = null, overrideModel = null) {
    let currentMessages = [...messages];
    let finalProposal = null;
    let maxIterations = 10;
    let iteration = 0;
    let hasDataModification = false;
    const modelName = overrideModel || getCurrentModelName();

    while (iteration < maxIterations) {
        iteration++;
        console.log(`[AI] API call iteration ${iteration}`);

        const requestBody = {
            model: modelName,
            messages: currentMessages,
            tools: getTools(),
            tool_choice: 'auto',
            max_tokens: modelName.includes('reasoner') ? 16000 : 4000,
            stream: !!event
        };
        // deepseek-reasoner 不支持 temperature/top_p/presence_penalty/frequency_penalty
        if (!modelName.includes('reasoner')) {
            requestBody.temperature = 0.7;
        }

        if (event) {
            event.sender.send('agent-stream-status', { iteration, phase: 'thinking' });
            
            const result = await callAPIStream(requestBody, event, scheduleData);
            
            if (result.tool_calls && result.tool_calls.length > 0) {
                event.sender.send('agent-stream-status', { iteration, phase: 'executing_tools', count: result.tool_calls.length });
                
                const assistantMessage = {
                    role: 'assistant',
                    content: result.content || '',
                    tool_calls: result.tool_calls
                };
                // 仅在使用推理模型时附加 reasoning_content，避免 deepseek-chat 返回 400
                if (result.reasoning_content && modelName.includes('reasoner')) {
                    assistantMessage.reasoning_content = result.reasoning_content;
                }
                currentMessages.push(assistantMessage);

                const toolPromises = result.tool_calls.map(tc => 
                    Promise.resolve().then(() => {
                        const toolResult = executeToolCall(tc, scheduleData);
                        return { tc, toolResult };
                    })
                );
                
                const toolResults = await Promise.all(toolPromises);
                
                for (const { tc, toolResult } of toolResults) {
                    try {
                        const resultObj = JSON.parse(toolResult);
                        if (resultObj.shouldRefresh) {
                            hasDataModification = true;
                        }
                        if (resultObj.proposal || resultObj.type === 'proposal') {
                            const proposalObj = resultObj.proposal || resultObj;
                            finalProposal = proposalObj;
                        }
                        currentMessages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: toolResult
                        });
                    } catch (e) {
                        console.error('[AI] Tool error:', e);
                    }
                }
                continue;
            }

            event.sender.send('agent-stream-done');
            return {
                response: {
                    content: cleanReasonerContent(result.content) || '我没听懂，再说一遍？',
                    proposal: finalProposal,
                    reasoning: result.reasoning_content || null
                },
                updatedProfile: {},
                shouldRefresh: hasDataModification
            };
        }

        const result = await callAPI(requestBody);

        if (result.error) {
            throw new Error(result.error);
        }

        const aiMessage = result.choices[0]?.message;
        if (!aiMessage) {
            throw new Error('No message in response');
        }

        if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            console.log('[AI] Tool calls detected:', aiMessage.tool_calls.length);

            const assistantMessage = {
                role: 'assistant',
                content: aiMessage.content || '',
                tool_calls: aiMessage.tool_calls
            };
            if (aiMessage.reasoning_content && modelName.includes('reasoner')) {
                assistantMessage.reasoning_content = aiMessage.reasoning_content;
            }
            currentMessages.push(assistantMessage);

            const toolPromises = aiMessage.tool_calls.map(tc => 
                Promise.resolve().then(() => {
                    try {
                        return { tc, toolResult: executeToolCall(tc, scheduleData) };
                    } catch (e) {
                        return { tc, toolResult: JSON.stringify({ error: e.message }) };
                    }
                })
            );
            
            const toolResults = await Promise.all(toolPromises);
            
            for (const { tc, toolResult } of toolResults) {
                try {
                    const resultObj = JSON.parse(toolResult);
                    if (resultObj.shouldRefresh) {
                        hasDataModification = true;
                    }
                    if (resultObj.proposal || resultObj.type === 'proposal') {
                        const proposalObj = resultObj.proposal || resultObj;
                        if (!finalProposal) {
                            finalProposal = proposalObj;
                        } else if (finalProposal.date === proposalObj.date) {
                            finalProposal.changes = [...(finalProposal.changes || []), ...(proposalObj.changes || [])];
                            if (proposalObj.reason) {
                                finalProposal.reason += '; ' + proposalObj.reason;
                            }
                        } else {
                            finalProposal = proposalObj;
                        }
                    }
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: toolResult
                    });
                } catch (e) {
                    console.error('[AI] Tool error:', e);
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: JSON.stringify({ error: e.message })
                    });
                }
            }
            continue;
        }

        return {
            response: {
                content: cleanReasonerContent(aiMessage.content) || '我没听懂，再说一遍？',
                proposal: finalProposal,
                reasoning: aiMessage.reasoning_content || null
            },
            updatedProfile: {},
            shouldRefresh: hasDataModification
        };
    }

    return {
        response: {
            content: '这个问题有点复杂，咱们分步来？',
            proposal: finalProposal
        },
        shouldRefresh: hasDataModification
    };
}

// 简单的API调用函数
async function callAPI(requestBody) {
    const apiUrl = getCurrentApiUrl();
    const apiKey = getCurrentApiKey();
    const modelName = getCurrentModelName();
    const provider = getCurrentProvider();

    const url = new URL(apiUrl);
    const bodyStr = safeJsonStringify(requestBody);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(bodyStr)
    };

    // Qwen 请求体
    let finalBody = requestBody;
    if (provider === 'qwen') {
        const useThinking = needsReasoning(requestBody.messages?.[requestBody.messages.length - 1]?.content || '');
        finalBody = {
            ...requestBody,
            extra_body: {
                enable_thinking: useThinking
            }
        };
    }

    const finalBodyStr = safeJsonStringify(finalBody);

    console.log(`[API] Calling ${provider} (${modelName}) at ${apiUrl}`);

    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(finalBodyStr)
            },
            rejectUnauthorized: appSettings.rejectUnauthorized !== false
        };

        const req = https.request(reqOptions, (res) => {
            let responseData = '';

            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    return;
                }

                try {
                    resolve(JSON.parse(responseData));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);

        if (appSettings.enableTimeout) {
            const timeout = appSettings.timeoutMs;
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout after ${timeout}ms`));
            });
            req.setTimeout(timeout);
        }

        req.write(finalBodyStr);
        req.end();
    });
}

// 流式API调用函数
async function callAPIStream(requestBody, event, scheduleData) {
    const apiUrl = getCurrentApiUrl();
    const apiKey = getCurrentApiKey();
    const provider = getCurrentProvider();

    if (!apiKey || apiKey === 'YOUR_DEEPSEEK_API_KEY_HERE') {
        const providerName = provider === 'qwen' ? 'Qwen' : 'DeepSeek';
        const getUrl = provider === 'qwen'
            ? 'https://dashscope.console.aliyun.com/apiKey'
            : 'https://platform.deepseek.com/api_keys';
        const error = new Error(`401 Unauthorized: ${providerName} API Key 未配置。请在设置中配置 API Key。\n\n获取 API Key: ${getUrl}`);
        error.code = 'NO_API_KEY';
        throw error;
    }

    const url = new URL(apiUrl);

    let finalBody = { ...requestBody, stream: true };
    if (provider === 'qwen') {
        // Qwen：简单查询关闭思考，复杂任务开启思考
        const useThinking = needsReasoning(requestBody.messages?.[requestBody.messages.length - 1]?.content || '');
        finalBody = {
            ...finalBody,
            extra_body: {
                enable_thinking: useThinking
            }
        };
    }

    const finalBodyStr = safeJsonStringify(finalBody);
    console.log(`[API Stream] Calling ${provider} (${finalBody.model}), temperature=${finalBody.temperature ?? 'N/A'}, tools=${finalBody.tools?.length || 0}`);

    const maxRetries = 2;
    const retryableCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const reqOptions = {
                    hostname: url.hostname,
                    port: url.port || 443,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Length': Buffer.byteLength(finalBodyStr)
                    },
                    rejectUnauthorized: appSettings.rejectUnauthorized !== false
                };

                const req = https.request(reqOptions, (res) => {
                    let buffer = '';
                    let rawBody = '';  // 累积原始响应体，用于错误诊断
                    let result = {
                        content: '',
                        reasoning_content: '',
                        tool_calls: []
                    };
                    let currentToolCall = null;

                    res.on('data', (chunk) => {
                        rawBody += chunk;
                        buffer += chunk;
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6).trim();
                                if (data === '[DONE]') continue;

                                try {
                                    const parsed = JSON.parse(data);
                                    const delta = parsed.choices[0]?.delta;

                                    if (delta) {
                                        if (delta.content) {
                                            result.content += delta.content;
                                            event.sender.send('agent-stream-chunk', {
                                                type: 'content',
                                                content: delta.content
                                            });
                                        }

                                        if (delta.reasoning_content) {
                                            result.reasoning_content += delta.reasoning_content;
                                            event.sender.send('agent-stream-chunk', {
                                                type: 'reasoning',
                                                content: delta.reasoning_content
                                            });
                                        }

                                        if (delta.tool_calls) {
                                            for (const tc of delta.tool_calls) {
                                                if (tc.index !== undefined) {
                                                    if (!result.tool_calls[tc.index]) {
                                                        result.tool_calls[tc.index] = {
                                                            id: tc.id || '',
                                                            type: 'function',
                                                            function: {
                                                                name: tc.function?.name || '',
                                                                arguments: ''
                                                            }
                                                        };
                                                    }
                                                    if (tc.id) {
                                                        result.tool_calls[tc.index].id = tc.id;
                                                    }
                                                    if (tc.function?.name) {
                                                        result.tool_calls[tc.index].function.name = tc.function.name;
                                                    }
                                                    if (tc.function?.arguments) {
                                                        result.tool_calls[tc.index].function.arguments += tc.function.arguments;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // 忽略解析错误
                                }
                            }
                        }
                    });

                    res.on('end', () => {
                        if (res.statusCode !== 200) {
                            const errorBody = rawBody.trim();
                            console.error(`[API Stream] HTTP ${res.statusCode} response body:`, errorBody);
                            reject(new Error(`HTTP ${res.statusCode}: ${errorBody}`));
                            return;
                        }

                        result.tool_calls = result.tool_calls.filter(tc => tc && tc.id);
                        event.sender.send('agent-stream-done');
                        resolve(result);
                    });
                });

                req.on('error', reject);

                if (appSettings.enableTimeout) {
                    req.on('timeout', () => {
                        req.destroy();
                        reject(new Error(`Request timeout after ${appSettings.timeoutMs}ms`));
                    });
                    req.setTimeout(appSettings.timeoutMs);
                }

                req.write(finalBodyStr);
                req.end();
            });
        } catch (error) {
            const isRetryable = retryableCodes.includes(error.code) ||
                (error.message && error.message.includes('ECONNRESET'));
            if (isRetryable && attempt < maxRetries) {
                const delay = 1000 * (attempt + 1);
                console.warn(`[API Stream] Network error (${error.code}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, delay));
                // 通知前端重置流式显示
                try {
                    event.sender.send('agent-stream-chunk', { type: 'retry' });
                } catch (e) { /* ignore */ }
                continue;
            }
            throw error;
        }
    }
}

function getFallbackResponse(error) {
    const msg = error.message || '';
    const code = error.code || '';

    console.error('[AI] Error details:', { message: msg, code: code });

    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid') && msg.includes('key')) {
        const provider = getCurrentProvider();
        const providerName = provider === 'qwen' ? 'Qwen' : 'DeepSeek';
        const getUrl = provider === 'qwen' 
            ? 'https://dashscope.console.aliyun.com/apiKey'
            : 'https://platform.deepseek.com/api_keys';
        return `API Key 无效或未配置。请在设置中配置有效的 ${providerName} API Key。\n\n获取 API Key: ${getUrl}`;
    }

    if (msg.includes('402') || msg.includes('insufficient') || msg.includes('余额')) {
        const provider = getCurrentProvider();
        const providerName = provider === 'qwen' ? '阿里云' : 'DeepSeek';
        return `${providerName} 账户余额不足，请充值后再试。`;
    }

    if (msg.includes('403') || msg.includes('forbidden')) {
        return '权限不足，请检查 API Key 是否有正确的权限。';
    }

    if (msg.includes('rate') || msg.includes('429') || msg.includes('1302') || code === 'ERR_HTTP2_STREAM_ERROR') {
        return '请求过于频繁，请稍等几秒再试。';
    }

    if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || code === 'ETIMEDOUT') {
        return '请求超时，请重试。';
    }

    if (msg.includes('ECONNREFUSED') || code === 'ECONNREFUSED') {
        return '网络连接被拒绝，请检查网络设置或代理配置。';
    }

    if (code === 'ENOTFOUND') {
        return '域名解析失败，请检查网络设置。';
    }

    if (code === 'ECONNRESET') {
        return '连接被重置，网络不稳定，请重试。';
    }

    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'CERT_UNTRUSTED') {
        return 'SSL证书问题，可能是网络环境限制';
    }

    if (code === 'ERR_PROXY_CONNECTION_FAILED') {
        return '代理连接失败，检查代理设置？';
    }

    if (code === 'ENETUNREACH') {
        return '网络不可达，检查下网络连接？';
    }

    const shortMsg = msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
    return `出错了：${shortMsg} (code: ${code})`;
}

// ============ 提案批准 ============

async function approveScheduleProposal(proposal) {
    try {
        console.log('[Approve] Processing proposal:', JSON.stringify(proposal, null, 2));

        const data = readScheduleData();

        if (proposal.type === 'direct_add_schedule') {
            return await handleDirectAddSchedule(proposal, data);
        }

        if (proposal.type === 'direct_add_task') {
            return await handleDirectAddTask(proposal, data);
        }

        if (proposal.type === 'batch_delete_schedule') {
            return await handleBatchDelete(proposal, data);
        }

        if (proposal.type === 'update_big_task') {
            return await handleUpdateBigTask(proposal, data);
        }

        if (proposal.type === 'delete_big_task') {
            return await handleDeleteBigTask(proposal, data);
        }

        if (proposal.type === 'batch_delete_big_tasks') {
            return await handleBatchDeleteBigTasks(proposal, data);
        }

        if (proposal.type === 'modify_course') {
            return await handleModifyCourse(proposal, data);
        }

        if (proposal.type === 'batch_modify_schedules') {
            return await handleBatchModifySchedules(proposal, data);
        }

        if (proposal.type === 'update_task') {
            return await handleUpdateTask(proposal, data);
        }

        if (proposal.type === 'delete_task') {
            return await handleDeleteTask(proposal, data);
        }

        if (proposal.type === 'batch_delete_tasks') {
            return await handleBatchDeleteTasks(proposal, data);
        }

        const date = proposal.date;

        if (!date) {
            console.error('[Approve] No date provided in proposal');
            return { success: false, error: '未提供日期' };
        }

        const existingSchedule = data.schedules[date];

        // 如果日期不存在，返回错误
        if (!existingSchedule) {
            console.error('[Approve] Schedule not found for date:', date);
            return { success: false, error: `日期 ${date} 没有找到任何安排` };
        }

        const originalTimeSlots = [...(existingSchedule.timeSlots || [])];
        const originalTasks = [...(existingSchedule.tasks || [])];

        // 收集所有要删除的时间段和活动
        const timesToDelete = new Set();
        const activitiesToDelete = new Set();

        // 解析changes中的删除指令
        if (proposal.changes && Array.isArray(proposal.changes)) {
            console.log('[Approve] Processing changes array:', proposal.changes.length, 'items');

            for (let i = 0; i < proposal.changes.length; i++) {
                const change = proposal.changes[i];
                console.log(`[Approve] Processing change [${i}]:`, change);

                // 解析所有时间范围（一个change可能包含多个）
                const timeMatches = change.matchAll(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/g);
                for (const match of timeMatches) {
                    const targetTime = `${match[1]}:${match[2]}-${match[3]}:${match[4]}`;
                    timesToDelete.add(targetTime);
                    console.log('[Approve] Marking time for deletion:', targetTime);
                }

                // 解析活动名称 - 支持多种格式
                // 格式1: "删除18:50-20:30的形势与政策I课程"
                // 格式2: "删除 形势与政策I课程"
                // 格式3: "删除课程"
                const activityPatterns = [
                    /(?:删除|移除|去掉)[^的]*的\s*(.+?)(?:\s|$)/,  // "删除XX的YYY"
                    /(?:删除|移除|去掉)\s*(.+)/,                 // "删除YYY"
                    /移除\s*(.+)/                                 // "移除YYY"
                ];

                for (const pattern of activityPatterns) {
                    const activityMatch = change.match(pattern);
                    if (activityMatch && activityMatch[1]) {
                        let activityName = activityMatch[1].trim();
                        // 去掉可能的时间前缀
                        activityName = activityName.replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s*/, '').trim();
                        if (activityName) {
                            activitiesToDelete.add(activityName);
                            console.log('[Approve] Marking activity for deletion:', activityName);
                            break;
                        }
                    }
                }
            }
        }

        console.log('[Approve] Total times to delete:', Array.from(timesToDelete));
        console.log('[Approve] Total activities to delete:', Array.from(activitiesToDelete));

        // 一次性过滤所有要删除的时间段
        const newTimeSlots = (existingSchedule.timeSlots || []).filter(slot => {
            // 检查时间段是否在删除列表中
            if (timesToDelete.has(slot.time)) {
                console.log(`[Approve] Removing slot by time: ${slot.time} - ${slot.activity}`);
                return false;
            }

            // 检查活动是否在删除列表中
            for (const activity of activitiesToDelete) {
                if (sanitizeStr(slot.activity).includes(sanitizeStr(activity)) || slot.activity === activity) {
                    console.log(`[Approve] Removing slot by activity: ${slot.time} - ${slot.activity}`);
                    return false;
                }
            }

            return true;
        });

        const deletedSlotsCount = originalTimeSlots.length - newTimeSlots.length;
        const modified = deletedSlotsCount > 0;

        if (!modified) {
            console.warn('[Approve] No matching slot found for deletion on', date);
            console.warn('[Approve] Target time slots:', proposal.changes);
            console.warn('[Approve] Existing time slots:', originalTimeSlots.map(s => `${s.time} - ${s.activity}`));
            // 返回失败，让用户知道删除没有成功
            return {
                success: false,
                error: '未找到匹配的时间段。该时间段可能不存在或已被删除。\n\n目标: ' + (proposal.changes || []).join(', ') + '\n现有: ' + originalTimeSlots.map(s => `${s.time} ${s.activity}`).join(', ')
            };
        }

        // 更新highlights
        existingSchedule.highlights = deletedSlotsCount > 0 ? `已删除${deletedSlotsCount}个时间段` : '';

        // 检查是否还有任务
        const hasTasks = existingSchedule.tasks && existingSchedule.tasks.length > 0;
        const hasTitle = existingSchedule.title && existingSchedule.title.trim() !== '';
        const hasMilestone = existingSchedule.milestone && existingSchedule.milestone.trim() !== '';

        if (newTimeSlots.length === 0 && !hasTasks && !hasTitle && !hasMilestone) {
            // 完全删除该日期的条目
            delete data.schedules[date];
            console.log('[Approve] Completely removed empty date entry:', date);
        } else {
            // 保存更新后的数据
            data.schedules[date] = existingSchedule;
            data.schedules[date].timeSlots = newTimeSlots;
        }

        writeScheduleData(data);

        // 验证写入
        const verifyData = readScheduleData();
        const verifySlots = verifyData.schedules[date]?.timeSlots || [];
        console.log('[Approve] After save, timeSlots count:', verifySlots.length);

        return {
            success: true,
            deletedCount: 1,
            deletedSlotsCount: deletedSlotsCount,
            deletedTasksCount: 0
        };
    } catch (error) {
        console.error('[Approve] Error:', error);
        return { success: false, error: error.message };
    }
}

// 处理批量删除
async function handleBatchDelete(proposal, data) {
    const dates = proposal.dates || [];
    console.log('[Approve] Batch delete for dates:', dates);

    if (dates.length === 0) {
        return { success: false, error: '没有指定要删除的日期' };
    }

    let deletedCount = 0;
    let deletedSlotsCount = 0;
    let deletedTasksCount = 0;
    const deletedDates = [];

    for (const date of dates) {
        const schedule = data.schedules[date];
        if (!schedule) {
            console.log('[Approve] Date not found, skipping:', date);
            continue;
        }

        const slotsCount = (schedule.timeSlots || []).length;
        const tasksCount = (schedule.tasks || []).length;

        if (slotsCount === 0 && tasksCount === 0) {
            console.log('[Approve] Date has no content, skipping:', date);
            continue;
        }

        deletedSlotsCount += slotsCount;
        deletedTasksCount += tasksCount;
        deletedCount++;
        deletedDates.push(date);

        // 完全删除该日期
        delete data.schedules[date];
        console.log('[Approve] Deleted date:', date, '- slots:', slotsCount, 'tasks:', tasksCount);
    }

    if (deletedCount === 0) {
        return { success: false, error: '没有找到需要删除的日期' };
    }

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Batch delete completed:', {
        deletedCount,
        deletedSlotsCount,
        deletedTasksCount,
        deletedDates
    });

    return {
        success: true,
        deletedCount,
        deletedSlotsCount,
        deletedTasksCount,
        deletedDates
    };
}

// 处理大任务更新
async function handleUpdateBigTask(proposal, data) {
    const oldTaskName = proposal.oldTaskName;
    const newTaskName = proposal.newTaskName;
    const newEstimatedMinutes = proposal.newEstimatedMinutes;
    const newDdl = proposal.newDdl;
    const newTaskType = proposal.newTaskType;
    const newStartDate = proposal.newStartDate;
    const newNote = proposal.newNote;

    if (!data.bigTasks) {
        return { success: false, error: '没有找到任何大任务' };
    }

    const task = data.bigTasks.find(t => t.name === oldTaskName);
    if (!task) {
        return { success: false, error: `没有找到名为"${oldTaskName}"的大任务` };
    }

    // 更新任务
    if (newTaskName) task.name = newTaskName;
    if (newEstimatedMinutes) task.estimated = newEstimatedMinutes;
    if (newDdl) task.ddl = newDdl;
    if (newTaskType) task.taskType = newTaskType;
    if (newStartDate !== undefined) task.startDate = newStartDate;
    if (newNote !== undefined) task.note = newNote;

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Big task updated:', task);

    return {
        success: true,
        message: `已更新大任务：${task.name}`
    };
}

// 处理大任务删除
async function handleDeleteBigTask(proposal, data) {
    const taskName = proposal.taskName;

    if (!data.bigTasks) {
        return { success: false, error: '没有找到任何大任务' };
    }

    const taskIndex = data.bigTasks.findIndex(t => t.name === taskName);
    if (taskIndex === -1) {
        return { success: false, error: `没有找到名为"${taskName}"的大任务` };
    }

    // 删除任务
    data.bigTasks.splice(taskIndex, 1);

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Big task deleted:', taskName);

    return {
        success: true,
        message: `已删除大任务：${taskName}`
    };
}

// 处理修改课程
async function handleModifyCourse(proposal, data) {
    const oldInfo = proposal.oldCourseInfo || {};
    const newInfo = proposal.newCourseInfo || {};
    const targetDate = proposal.date || oldInfo.date;
    const modifyAll = proposal.modifyAll === true;
    console.log('[Approve] Modify course:', oldInfo, '->', newInfo, 'targetDate:', targetDate, 'modifyAll:', modifyAll);

    if (!oldInfo.name && oldInfo.weekday === undefined) {
        return { success: false, error: '缺少 old_course_info，请提供 name 和/或 weekday' };
    }

    const schedules = data.schedules || {};
    let modifiedCount = 0;
    const matchedDates = [];

    for (const [date, schedule] of Object.entries(schedules)) {
        if (targetDate && date !== targetDate) continue;

        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay();

        if (oldInfo.weekday !== undefined && dayOfWeek !== oldInfo.weekday) continue;

        const slots = schedule.timeSlots || [];
        let dateMatched = false;

        for (const slot of slots) {
            const matchActivity = !oldInfo.name || slot.activity === oldInfo.name || sanitizeStr(slot.activity).includes(sanitizeStr(oldInfo.name));
            const matchTime = !oldInfo.time || slot.time === oldInfo.time;
            if (matchActivity && matchTime) {
                if (newInfo.name) slot.activity = newInfo.name;
                if (newInfo.time) slot.time = newInfo.time;
                if (newInfo.location !== undefined) slot.detail = newInfo.location;
                if (newInfo.teacher) slot.detail = (slot.detail ? slot.detail + ' ' : '') + newInfo.teacher;
                modifiedCount++;
                dateMatched = true;
                console.log(`[Approve] Modified slot on ${date}: ${slot.time} ${slot.activity}`);
            }
        }

        if (dateMatched) matchedDates.push(date);
    }

    // 没指定日期且没标记 modifyAll 时，多日期匹配只改最近一个，其余回滚
    if (!targetDate && !modifyAll && matchedDates.length > 1) {
        const freshData = readScheduleData();
        const freshSchedules = freshData.schedules || {};
        const latestDate = matchedDates.sort().reverse()[0];
        let revertedCount = 0;
        for (const date of matchedDates) {
            if (date === latestDate) continue;
            schedules[date] = freshSchedules[date] || schedules[date];
            revertedCount++;
        }
        if (revertedCount > 0) {
            modifiedCount -= revertedCount;
            console.log(`[Approve] Reverted ${revertedCount} dates, kept only ${latestDate}`);
        }
    }

    if (modifiedCount === 0) {
        console.warn('[Approve] No matching course found');
        return { success: false, error: '未找到匹配的课程' };
    }

    writeScheduleData(data);
    return { success: true, modifiedCount };
}

// 处理批量修改日程
async function handleBatchModifySchedules(proposal, data) {
    const operation = proposal.operation;
    const criteria = proposal.criteria || {};
    const newDetails = proposal.new_details || {};
    console.log('[Approve] Batch modify:', operation, criteria, '->', newDetails);

    const schedules = data.schedules || {};
    let modifiedCount = 0;

    for (const [date, schedule] of Object.entries(schedules)) {
        if (criteria.date && date !== criteria.date) continue;

        const slots = schedule.timeSlots || [];
        for (const slot of slots) {
            const matchActivity = !criteria.activity || sanitizeStr(slot.activity).includes(sanitizeStr(criteria.activity)) || slot.activity === criteria.activity;
            if (!matchActivity) continue;

            if (operation === 'update_all_matching') {
                if (newDetails.activity) slot.activity = newDetails.activity;
                if (newDetails.time) slot.time = newDetails.time;
                if (newDetails.detail !== undefined) slot.detail = newDetails.detail;
                modifiedCount++;
                console.log(`[Approve] Modified slot on ${date}: ${slot.time} -> ${slot.activity}`);
            } else if (operation === 'delete_all_matching') {
                const idx = slots.indexOf(slot);
                if (idx !== -1) slots.splice(idx, 1);
                modifiedCount++;
                console.log(`[Approve] Deleted slot on ${date}: ${slot.time} ${slot.activity}`);
            }
        }
    }

    if (modifiedCount === 0) {
        console.warn('[Approve] No matching schedule found for batch modify');
        return { success: false, error: '未找到匹配的日程' };
    }

    writeScheduleData(data);
    return { success: true, modifiedCount };
}

// 处理批量删除大任务
async function handleBatchDeleteBigTasks(proposal, data) {
    const taskNames = proposal.taskNames || [];
    console.log('[Approve] Batch delete big tasks:', taskNames.length);

    if (taskNames.length === 0) {
        return { success: false, error: '没有指定要删除的大任务' };
    }

    if (!data.bigTasks) {
        return { success: false, error: '没有找到任何大任务' };
    }

    let deletedCount = 0;
    const deletedTasks = [];

    for (const taskName of taskNames) {
        const taskIndex = data.bigTasks.findIndex(t => t.name === taskName);
        if (taskIndex !== -1) {
            data.bigTasks.splice(taskIndex, 1);
            deletedCount++;
            deletedTasks.push(taskName);
            console.log('[Approve] Big task deleted:', taskName);
        }
    }

    if (deletedCount === 0) {
        return { success: false, error: '没有找到需要删除的大任务' };
    }

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Batch delete big tasks completed:', {
        deletedCount,
        deletedTasks
    });

    return {
        success: true,
        deletedCount,
        deletedTasks
    };
}

// 处理小任务更新
async function handleUpdateTask(proposal, data) {
    const date = proposal.date;
    const oldTaskName = proposal.oldTaskName;
    const newTaskName = proposal.newTaskName;
    const newEstimatedMinutes = proposal.newEstimatedMinutes;
    const newStartTime = proposal.newStartTime;
    const newEndTime = proposal.newEndTime;
    const newNote = proposal.newNote;

    if (!data.schedules || !data.schedules[date]) {
        return { success: false, error: `日期 ${date} 没有找到任何安排` };
    }

    const schedule = data.schedules[date];
    if (!schedule.tasks) {
        return { success: false, error: `日期 ${date} 没有找到任何任务` };
    }

    const task = schedule.tasks.find(t => t.name === oldTaskName);
    if (!task) {
        return { success: false, error: `没有找到名为"${oldTaskName}"的任务` };
    }

    // 更新任务
    if (newTaskName) task.name = newTaskName;
    if (newEstimatedMinutes) task.estimated = newEstimatedMinutes.toString();
    if (newNote !== undefined) task.note = newNote;

    // 更新或创建关联的时间段
    if (newStartTime) {
        if (!schedule.timeSlots) schedule.timeSlots = [];

        // 计算结束时间
        let calculatedEndTime = newEndTime;
        if (!calculatedEndTime) {
            const [hours, minutes] = newStartTime.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hours, minutes, 0, 0);
            const endDate = new Date(startDate.getTime() + (newEstimatedMinutes || parseInt(task.estimated)) * 60000);
            const endHours = String(endDate.getHours()).padStart(2, '0');
            const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
            calculatedEndTime = `${endHours}:${endMinutes}`;
        }

        const timeRange = `${newStartTime}-${calculatedEndTime}`;

        // 查找并更新或创建时间段
        const existingSlot = schedule.timeSlots.find(slot => slot.activity === oldTaskName);
        if (existingSlot) {
            existingSlot.time = timeRange;
            existingSlot.activity = newTaskName || oldTaskName;
            existingSlot.detail = newNote || `预计用时：${newEstimatedMinutes || task.estimated}分钟`;
        } else {
            schedule.timeSlots.push({
                time: timeRange,
                activity: newTaskName || oldTaskName,
                detail: newNote || `预计用时：${newEstimatedMinutes || task.estimated}分钟`
            });
        }
    }

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Task updated:', task);

    return {
        success: true,
        message: `已更新任务：${task.name}`
    };
}

// 处理小任务删除
async function handleDeleteTask(proposal, data) {
    const date = proposal.date;
    const taskName = proposal.taskName;

    if (!data.schedules || !data.schedules[date]) {
        return { success: false, error: `日期 ${date} 没有找到任何安排` };
    }

    const schedule = data.schedules[date];
    if (!schedule.tasks) {
        return { success: false, error: `日期 ${date} 没有找到任何任务` };
    }

    const taskIndex = schedule.tasks.findIndex(t => t.name === taskName);
    if (taskIndex === -1) {
        return { success: false, error: `没有找到名为"${taskName}"的任务` };
    }

    // 删除任务
    schedule.tasks.splice(taskIndex, 1);

    // 同时删除关联的时间段
    if (schedule.timeSlots) {
        const slotIndex = schedule.timeSlots.findIndex(slot => slot.activity === taskName);
        if (slotIndex !== -1) {
            schedule.timeSlots.splice(slotIndex, 1);
        }
    }

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Task deleted:', taskName);

    return {
        success: true,
        message: `已删除任务：${taskName}`
    };
}

// 处理批量删除小任务
async function handleDirectAddSchedule(proposal, data) {
    const { date, timeSlots } = proposal;
    
    if (!date || !timeSlots || timeSlots.length === 0) {
        return { success: false, error: '缺少日期或时间段信息' };
    }
    
    console.log('[Approve] Direct add schedule:', date, timeSlots.length, 'slots');
    
    if (!data.schedules) {
        data.schedules = {};
    }
    
    if (!data.schedules[date]) {
        data.schedules[date] = {
            title: '',
            timeSlots: [],
            tasks: []
        };
    }
    
    for (const slot of timeSlots) {
        data.schedules[date].timeSlots.push({
            time: slot.time,
            activity: slot.activity,
            detail: slot.detail || '',
            icon: slot.icon || ''
        });
    }
    
    writeScheduleData(data);
    
    console.log('[Approve] Direct add schedule completed:', date);
    
    return {
        success: true,
        addedCount: timeSlots.length,
        date
    };
}

async function handleDirectAddTask(proposal, data) {
    const { date, taskName, estimatedMinutes } = proposal;
    
    if (!date || !taskName) {
        return { success: false, error: '缺少日期或任务名称' };
    }
    
    console.log('[Approve] Direct add task:', date, taskName);
    
    if (!data.schedules) {
        data.schedules = {};
    }
    
    if (!data.schedules[date]) {
        data.schedules[date] = {
            title: '',
            timeSlots: [],
            tasks: []
        };
    }
    
    if (!data.schedules[date].tasks) {
        data.schedules[date].tasks = [];
    }
    
    data.schedules[date].tasks.push({
        name: taskName,
        estimated: String(estimatedMinutes || 60),
        completed: false
    });
    
    writeScheduleData(data);
    
    console.log('[Approve] Direct add task completed:', date, taskName);
    
    return {
        success: true,
        taskName,
        date
    };
}

async function handleBatchDeleteTasks(proposal, data) {
    const tasks = proposal.tasks || [];
    console.log('[Approve] Batch delete tasks:', tasks.length);

    if (tasks.length === 0) {
        return { success: false, error: '没有指定要删除的任务' };
    }

    let deletedCount = 0;
    let deletedSlotsCount = 0;
    const deletedTasks = [];
    const affectedDates = new Set();

    for (const taskInfo of tasks) {
        const date = taskInfo.date;
        const taskName = taskInfo.taskName;

        const schedule = data.schedules?.[date];
        if (!schedule || !schedule.tasks) {
            console.log('[Approve] Task not found, skipping:', date, taskName);
            continue;
        }

        const taskIndex = schedule.tasks.findIndex(t => t.name === taskName);
        if (taskIndex === -1) {
            console.log('[Approve] Task not found, skipping:', date, taskName);
            continue;
        }

        // 删除任务
        schedule.tasks.splice(taskIndex, 1);
        deletedCount++;
        deletedTasks.push({ date, taskName });
        affectedDates.add(date);

        // 同时删除关联的时间段
        if (schedule.timeSlots) {
            const slotIndex = schedule.timeSlots.findIndex(slot => slot.activity === taskName);
            if (slotIndex !== -1) {
                schedule.timeSlots.splice(slotIndex, 1);
                deletedSlotsCount++;
            }
        }
    }

    if (deletedCount === 0) {
        return { success: false, error: '没有找到需要删除的任务' };
    }

    // 清理空日期
    for (const date of affectedDates) {
        const schedule = data.schedules[date];
        if (schedule && 
            (!schedule.tasks || schedule.tasks.length === 0) && 
            (!schedule.timeSlots || schedule.timeSlots.length === 0) &&
            (!schedule.title || schedule.title.trim() === '')) {
            delete data.schedules[date];
            console.log('[Approve] Removed empty date:', date);
        }
    }

    // 保存数据
    writeScheduleData(data);

    console.log('[Approve] Batch delete tasks completed:', {
        deletedCount,
        deletedSlotsCount,
        deletedTasks
    });

    return {
        success: true,
        deletedCount,
        deletedSlotsCount,
        deletedTasks
    };
}

// ============ IPC Handlers ============

// 设置当前活跃用户名（用于按账号隔离数据目录）
ipcMain.handle('set-active-user', (event, username) => {
    pmPaths.setActiveUsername(username);
    console.log(`[Paths] Active user set to: ${username || '(none)'}`);
    // 切换用户后重新加载设置
    loadSettings();
    return true;
});

// 获取 WordMosaic 子应用路径
ipcMain.handle('get-wordmosaic-path', () => {
    // 打包环境：WordMosaic 在 resources/WordMosaic/ 下（extraResources，不在asar内）
    // 优先使用此路径，因为 webview 中 fetch() 无法读取 asar 内的文件
    if (process.resourcesPath) {
        const packagedPath = path.join(process.resourcesPath, 'WordMosaic', 'index.html');
        if (fs.existsSync(packagedPath)) {
            console.log('[WordMosaic] Using resources path:', packagedPath);
            return packagedPath;
        }
    }
    // 开发环境：WordMosaic 在项目目录下
    const devPath = path.join(__dirname, 'WordMosaic', 'index.html');
    if (fs.existsSync(devPath)) {
        console.log('[WordMosaic] Using dev path:', devPath);
        return devPath;
    }
    // 旧的开发环境路径：上级目录
    const legacyPath = path.join(__dirname, '..', 'WordMosaic', 'index.html');
    if (fs.existsSync(legacyPath)) {
        console.log('[WordMosaic] Using legacy path:', legacyPath);
        return legacyPath;
    }
    console.warn('[WordMosaic] No WordMosaic found');
    return null;
});

ipcMain.handle('get-schedule-data', () => {
    return readScheduleData();
});

ipcMain.handle('get-agent-history', () => {
    return readAgentHistory();
});

ipcMain.handle('save-agent-history', (event, data) => {
    try {
        const compressed = archiveAndCompress(data);
        writeAgentHistory({
            ...compressed,
            lastUpdate: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error('[Save] Error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('agent-chat', async (event, data) => {
    const scheduleData = readScheduleData();
    const result = await handleAgentChat({
        ...data,
        scheduleData: scheduleData
    }, null);
    return result;
});

ipcMain.handle('agent-chat-stream', async (event, data) => {
    const scheduleData = readScheduleData();
    const result = await handleAgentChat({
        ...data,
        scheduleData: scheduleData,
        stream: true
    }, event);
    return result;
});

ipcMain.handle('agent-approve', async (event, proposal) => {
    return await approveScheduleProposal(proposal);
});

ipcMain.handle('archive-conversations', () => {
    try {
        const history = readAgentHistory();
        const archived = archiveAndCompress(history);
        writeAgentHistory({
            ...archived,
            lastUpdate: new Date().toISOString()
        });
        return { success: true, archived: archived };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('clear-conversations', () => {
    try {
        const history = readAgentHistory();
        const userProfile = history.userProfile || {};
        writeAgentHistory({
            userProfile,
            conversations: [],
            archivedConversations: history.archivedConversations || [],
            lastUpdate: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 保存日程数据API
ipcMain.handle('save-schedule-data', async (event, data) => {
    try {
        writeScheduleData(data);
        return { success: true };
    } catch (error) {
        console.error('[Save] Error:', error);
        return { success: false, error: error.message };
    }
});

// ============ Agent Provider API ============

// 获取当前 provider
ipcMain.handle('get-agent-provider', async () => {
    return {
        provider: getCurrentProvider(),
        model: getCurrentModelName()
    };
});

// 设置 provider
ipcMain.handle('set-agent-provider', async (event, provider) => {
    try {
        setCurrentProvider(provider);

        // 更新配置文件
        const configPath = pmPaths.getConfigPath();
        let config = {};
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(data);
        }
        config.agent = config.agent || {};
        config.agent.provider = provider;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log('[Agent] Provider set to:', provider);
        return { success: true, provider: provider, model: getCurrentModelName() };
    } catch (error) {
        console.error('[Agent] Set provider error:', error);
        return { success: false, error: error.message };
    }
});

// ============ API Key 管理 API ============

const API_KEY_INFO = {
    deepseek: {
        name: 'DeepSeek',
        getUrl: 'https://platform.deepseek.com/api_keys',
        signupUrl: 'https://platform.deepseek.com/'
    },
    qwen: {
        name: 'Qwen (通义千问)',
        getUrl: 'https://dashscope.console.aliyun.com/apiKey',
        signupUrl: 'https://dashscope.console.aliyun.com/'
    }
};

ipcMain.handle('get-api-keys', async () => {
    return {
        deepseek: {
            key: DEEPSEEK_API_KEY ? maskApiKey(DEEPSEEK_API_KEY) : '',
            hasKey: !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'YOUR_DEEPSEEK_API_KEY_HERE',
            baseUrl: DEEPSEEK_API_URL,
            model: MODEL_NAME
        },
        qwen: {
            key: QWEN_API_KEY ? maskApiKey(QWEN_API_KEY) : '',
            hasKey: !!QWEN_API_KEY,
            baseUrl: QWEN_API_URL,
            model: QWEN_MODEL_NAME
        },
        currentProvider: currentProvider
    };
});

ipcMain.handle('set-api-key', async (event, provider, key) => {
    try {
        const configPath = pmPaths.getConfigPath();
        let config = {};
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(data);
        }
        
        config.api = config.api || {};
        config.api[provider] = config.api[provider] || {};
        config.api[provider].key = key;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        if (provider === 'deepseek') {
            DEEPSEEK_API_KEY = key;
        } else if (provider === 'qwen') {
            QWEN_API_KEY = key;
        }
        
        console.log(`[Config] ${provider} API key updated`);
        return { success: true };
    } catch (error) {
        console.error('[Config] Set API key error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-api-key-url', async (event, provider) => {
    const info = API_KEY_INFO[provider];
    if (info) {
        shell.openExternal(info.getUrl);
        return { success: true };
    }
    return { success: false, error: 'Unknown provider' };
});

ipcMain.handle('validate-api-key', async (event, provider) => {
    try {
        const apiKey = provider === 'qwen' ? QWEN_API_KEY : DEEPSEEK_API_KEY;
        const apiUrl = provider === 'qwen' ? QWEN_API_URL : DEEPSEEK_API_URL;
        const model = provider === 'qwen' ? QWEN_MODEL_NAME : MODEL_NAME;
        
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
            rejectUnauthorized: appSettings.rejectUnauthorized !== false
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
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
            // 注意: sandbox设为false以确保preload.js正常工作
            // 如需启用sandbox，需要修改preload.js的实现方式
        }
    });

    win.loadFile('index.html');

    win.webContents.on('did-finish-load', () => {
        win.setTitle('PlanMosaic');
    });

    // 开发模式
    if (process.env.NODE_ENV === 'dev') {
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();
    testNetworkConnection();
    createDesktopShortcut();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

console.log('=================================================');
console.log('PlanMosaic - Electron版');
console.log('Model:', MODEL_NAME);
console.log('=================================================');
