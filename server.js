const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { AI_TOOLS } = require('./ai-tools.js');
const pmPaths = require('./paths.js');

// 清理字符串中的 lone surrogates，防止 .includes() 等操作抛出 RangeError
function sanitizeStr(s) { return (s || '').replace(/[\uD800-\uDFFF]/g, ''); }

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

// 获取课程图标
function getCourseIcon(courseName) {
    const icons = {
        '数学': '∫', '英语': 'Aa', '语文': '文', '物理': 'F',
        '化学': '化', '生物': 'DNA', '历史': '史', '地理': 'G',
        '政治': '法', '体育': '体', '音乐': '乐', '美术': '美',
        '计算机': 'PC', '编程': 'Code', '形势与政策': '政', '马克思主义': '马'
    };
    for (const [key, icon] of Object.entries(icons)) {
        if (courseName.includes(key)) return icon;
    }
    return '';
}

// 安全 JSON 序列化：处理无效的 Unicode 代理对（lone surrogates）
function safeJsonStringify(obj, indent) {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'string') {
            return value.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
        }
        return value;
    }, indent);
}
const url = require('url');

// 从配置文件加载API密钥（不在代码中硬编码）
let DEEPSEEK_API_KEY = '';
let DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
let MODEL_NAME = 'deepseek-chat';
let REASONER_MODEL_NAME = 'deepseek-reasoner';

let PORT = 8080;
let HOST = '127.0.0.1';

let appSettings = {
    enableTimeout: false,
    timeoutMs: 30000,
    rejectUnauthorized: true  // 默认启用SSL验证
};

function loadSettings() {
    try {
        // 优先从config.json加载
        const configPath = pmPaths.getConfigPath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(data);
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
            if (config.security?.rejectUnauthorized !== undefined) {
                appSettings.rejectUnauthorized = config.security.rejectUnauthorized;
            }
            if (config.timeouts?.apiTimeoutMs) {
                appSettings.timeoutMs = config.timeouts.apiTimeoutMs;
            }
            if (config.server?.port) {
                PORT = config.server.port;
            }
            if (config.server?.host) {
                HOST = config.server.host;
            }
            console.log('[Config] Loaded from config.json');
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
            console.log('[Config] Loaded API key from environment');
        }
        if (!MODEL_NAME || MODEL_NAME === 'deepseek-reasoner') {
            if (process.env.MODEL_NAME) {
                MODEL_NAME = process.env.MODEL_NAME;
            }
        }

        // 检查API密钥是否已配置
        if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
            console.warn('[Config] WARNING: DeepSeek API key not configured!');
            console.warn('[Config] Please set it in config.json or DEEPSEEK_API_KEY environment variable');
        }
    } catch (e) {
        console.error('[Config] Load error:', e);
    }
}

// 首次运行：从程序目录迁移旧数据到 AppData
pmPaths.migrateFromLegacyDir(__dirname);

loadSettings();

// API速率限制器（1秒1次）
class RateLimiter {
    constructor(minInterval = 1000) {
        this.minInterval = minInterval;
        this.lastCallTime = 0;
        this.queue = [];
    }

    async acquire() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;

        if (timeSinceLastCall < this.minInterval) {
            const waitTime = this.minInterval - timeSinceLastCall;
            console.log(`Rate limit: waiting ${waitTime}ms...`);
            await sleep(waitTime);
        }

        this.lastCallTime = Date.now();
    }
}

const apiRateLimiter = new RateLimiter(1000); // 1秒最小间隔

// PORT 和 HOST 已在 loadSettings() 中从配置文件加载

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
};

function getMimeType(ext) {
    return MIME_TYPES[ext] || 'application/octet-stream';
}

// ============ AI Agent Functions ============

// 判断用户消息是否需要推理模型
function needsReasoning(message) {
    if (!message) return false;
    const msg = message.toLowerCase();
    const keywords = [
        '规划', '计划', '安排', '排', '调整', '优化', '整理', '重新',
        '帮我安排', '帮我规划', '帮我排', '怎么安排', '怎么规划',
        '推荐', '建议', '应该', '好不好', '合理', '更好',
        '冲突', '撞了', '重叠', '空闲', '有空',
        '本周', '下周', '本月', '这个月',
        '周计划', '日计划', '月计划', '学习计划', '复习计划',
        '课表', '选课', '加课', '退课', '换课',
        '添加', '新增', '增加', '删除', '移除', '修改', '改', '换',
        '取消', '推迟', '提前', '延期', '挪', '移',
        '添加日程', '加个', '建一个', '创建', '新建',
        '设置', '设为', '标记', '完成', '未完成',
        '批量', '全部删除', '全部改',
        '分析', '统计', '总结', '回顾', '对比', '比较',
        '多久', '频率', '规律', '习惯', '模式',
        '进度', 'ddl', 'deadline', '截止'
    ];
    for (const kw of keywords) {
        if (msg.includes(kw)) return true;
    }
    return false;
}

// 处理AI对话
async function handleAgentChat(data) {
    const { message, images, history, profile, scheduleData, userProfileText } = data;

    // 获取东八区时间
    const now = new Date();
    const utc8Offset = 8 * 60;
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

    // 构建系统提示词
    const systemPrompt = `你是 Mosa，日程管理助理。用中文回复，简洁直接，不说废话。

【当前日期】${dateInfo}时区 UTC+8。工具 date 参数统一用 YYYY-MM-DD 格式。
${profileSection}

【核心规则】
1. 先调用工具获取数据，不猜测用户日程内容。
2. 一次请求可连续调用多个工具，完成所有必要操作后再回复。
3. 需要用户确认的操作（删除/修改日程）必须返回 proposal，不要直接执行。
4. 直接执行类操作（添加任务、完成任务、查看日程）无需确认，直接调用工具。
5. 回复控制在2句话以内，直接给出结果或确认已完成。

6. 所有"删除"和"移除"操作需用户确认，所有"批量"操作需用户确认。

【意图识别】
- "明天有什么" → view_schedule(date=明天日期)
- "把X改成Y"/"X换成Y" → update_task 或 modify_schedule(action="update")
- "删掉X" → delete_task_proposal(单个) 或 batch_delete_schedule(批量)
- "加个X"/"安排X" → add_task 或 add_schedule
- "所有/全部X" → batch操作，batch_modify_schedules 或 batch_delete_schedule
- "完成了X" → complete_task 或 complete_big_task
- "有什么任务/DDL" → view_tasks 或 list_big_tasks
- "X和Y冲突吗" → check_conflicts
- "搜索/找找X" → search_schedules(keyword=X)

【工具选择】
- 单个日期 → view_schedule / add_schedule / propose_schedule_change
- 批量日期 → batch_modify_schedules / batch_delete_schedule
- 日常任务 → add_task / update_task / complete_task / view_tasks
- 大任务(DDL) → add_big_task / list_big_tasks / complete_big_task
- 冲突检测 → check_conflicts
- 搜索 → search_schedules`;

// ============ 深度规划模式 ============

// 深度规划模式工具白名单
const DEEP_PLANNING_TOOL_WHITELIST = [
    'value_monetization',
    'roi_calculator',
    'milestone_planner',
    'swot_analysis',
    'decision_matrix',
    'view_schedule'  // 只读查看，用于了解用户现状
];

// 深度规划专用系统提示词
function getDeepPlanningSystemPrompt(profileSection) {
    const now = new Date();
    const utc8Offset = 8 * 60;
    const utc8Now = new Date(now.getTime() + (now.getTimezoneOffset() + utc8Offset) * 60000);
    const today = `${utc8Now.getFullYear()}-${String(utc8Now.getMonth() + 1).padStart(2, '0')}-${String(utc8Now.getDate()).padStart(2, '0')}`;
    const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const dateInfo = `今天是 ${today}（周${weekdayNames[utc8Now.getDay()]}）。时区 UTC+8。`;

    return `你是 Mosa 的【深度规划模式】—— 战略人生顾问。

【当前日期】${dateInfo}
${profileSection ? '\n【用户背景】\n' + profileSection : ''}

【核心身份】
你不是普通的日程管理助手。你是一个有耐心的战略顾问，帮助用户思考5-10年维度的长期方向。

【最重要的原则：慢热与先问后答】

你的工作方式是**咨询式的**，不是报告生成器。真正的战略规划需要先充分了解一个人，再给出判断。

🔑 **阶段一：信息收集（前3-5轮对话）**
- 用户打招呼/说模糊的话时，不要开始"分析"。先回应，然后问1-2个关键问题。
- 你需要了解的核心信息（按优先级）：
  1. 用户现在在做什么（学生？工作？什么领域？）
  2. 用户有没有一个模糊的方向或困惑
  3. 用户最在意的是什么（钱？自由？成就感？影响力？）
  4. 用户觉得目前最大的瓶颈是什么
- 每次回复只问1-2个问题，不要一次性问太多。让对话自然流动。
- 如果用户主动说了具体目标，可以跳过部分问题，但仍然要确认关键背景。

🔑 **阶段二：诊断与挑战（信息基本清楚后）**
- 在你开始任何"分析"之前，先用你自己的话复述一遍你对用户情况的理解
- 指出你看到的1-2个可能的认知盲区或矛盾点（这是你的价值所在）
- 问："我理解得对吗？还有我没覆盖到的重要方面吗？"

🔑 **阶段三：结构化分析（确认理解之后）**
- 只有在你对用户有了足够具体的了解后，才使用量化分析工具和框架
- 分析要有针对性，针对这个具体的人，而不是泛泛而谈

【对话风格】
- 像一个聪明的朋友在认真听你说话，而不是一个PPT机器
- 简洁。每条回复不超过4-5行。
- 可以用口语化的表达，不需要每句话都像论文
- 敢于说"我不确定，但我的直觉是..."——这比装作什么都知道更有价值

【核心原则】
1. **远见性思维**：引导用户思考更长期的影响
2. **客观理性**：不附和。如果想法有明显漏洞，直接指出
3. **量化分析**：在适当时机使用数据和量化方法（阶段三）
4. **挑战性提问**：提出用户可能忽视的问题

【禁止行为】
- ❌ 用户只是打个招呼你就开始"战略分析"
- ❌ 在不了解用户的情况下给具体建议
- ❌ 说"这个想法很好"之类的空话
- ❌ 进行日常日程安排（这不是你的职责范围）
- ❌ 使用过于学术化或晦涩的语言
- ❌ 一次输出超过6段长文——分多次对话逐步深入

【可用工具】（仅在阶段三、且确实需要时调用）
- value_monetization: 价值货币化评估
- roi_calculator: 投资回报率计算
- milestone_planner: 里程碑规划
- swot_analysis: SWOT分析
- decision_matrix: 决策矩阵分析
- view_schedule: 查看用户当前日程（只读）

记住：好的顾问70%的时间在提问和倾听，30%的时间在给出见解。`;
}

// 处理深度规划对话
async function handleDeepPlanningChat(data) {
    const { message, history, profile, userProfileText } = data;

    console.log('[Deep Planning] Received request, message length:', message?.length || 0);

    // 注入用户画像
    let profileSection = '';
    if (userProfileText && userProfileText.trim()) {
        profileSection = userProfileText.trim();
    }

    // 构建深度规划专用的系统提示词
    const systemPrompt = getDeepPlanningSystemPrompt(profileSection);
    console.log('[Deep Planning] System prompt built, profile section length:', profileSection.length);

    // 构建消息历史
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // 添加最近的历史对话（最多15条，深度规划可能需要更多上下文）
    const recentHistory = (history || []).slice(-15);
    for (const msg of recentHistory) {
        if (!msg.proposal) { // 跳过包含proposal的系统消息
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        }
    }

    // 添加当前消息
    if (message) {
        messages.push({ role: 'user', content: message });
    }

    // 过滤工具白名单
    const filteredTools = AI_TOOLS.filter(tool =>
        DEEP_PLANNING_TOOL_WHITELIST.includes(tool.function.name)
    );
    console.log('[Deep Planning] Filtered tools count:', filteredTools.length, '/', AI_TOOLS.length);
    console.log('[Deep Planning] Available tools:', filteredTools.map(t => t.function.name).join(', '));

    // 使用reasoner模型进行深度推理
    const selectedModel = REASONER_MODEL_NAME;
    console.log('[Deep Planning] Using model:', selectedModel);

    try {
        // 调用修改版的callDeepseekAI，传入过滤后的工具
        const response = await callDeepseekAIWithCustomTools(messages, filteredTools, selectedModel);
        console.log('[Deep Planning] Response received, content length:', response.content?.length || 0);

        return {
            response: {
                content: response.content,
                proposal: response.proposal
            },
            updatedProfile: extractProfileInfo(response.content, profile),
            shouldRefresh: false  // 深度规划模式通常不需要刷新UI
        };
    } catch (error) {
        console.error('[Deep Planning] Error:', error);
        return {
            response: {
                content: '抱歉，深度规划模块遇到了问题。请稍后重试。',
                proposal: null
            },
            shouldRefresh: false
        };
    }
}

// 带自定义工具列表的Deepseek AI调用
async function callDeepseekAIWithCustomTools(messages, customTools, overrideModel = null, retryCount = 0, depth = 0) {
    const modelName = overrideModel || MODEL_NAME;

    // 检查API密钥是否已配置
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
        console.error('[Deep Planning][API] ERROR: DeepSeek API key not configured!');
        return {
            content: 'AI服务未配置，请在config.json中设置有效的API密钥。',
            proposal: null
        };
    }

    // 应用速率限制
    await apiRateLimiter.acquire();

    // 递归深度限制
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) {
        console.error('[Deep Planning][API] Maximum tool call depth exceeded');
        return {
            content: '工具调用轮次过多，请简化您的请求。',
            proposal: null
        };
    }

    const maxRetries = 3;
    const retryDelay = 1000;

    try {
        const apiUrl = new URL(DEEPSEEK_API_URL);
        const isReasoner = modelName.includes('reasoner');
        const reqBody = {
            model: modelName,
            messages: messages,
            tools: customTools,
            tool_choice: 'auto',
            max_tokens: isReasoner ? 16000 : 4000  // 深度规划允许更长的响应
        };

        if (!isReasoner) {
            reqBody.temperature = 0.7;  // 稍低的温度，更有逻辑性
        }

        const requestBody = safeJsonStringify(reqBody);

        console.log('[Deep Planning][API] Calling DeepSeek with model:', modelName, 'tools:', customTools.length);

        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: apiUrl.hostname,
                port: apiUrl.port || 443,
                path: apiUrl.pathname + apiUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Length': Buffer.byteLength(requestBody)
                },
                rejectUnauthorized: appSettings.rejectUnauthorized !== false
            };

            if (appSettings.enableTimeout) {
                options.timeout = appSettings.timeoutMs;
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

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

            req.on('error', (err) => {
                reject(err);
            });

            if (appSettings.enableTimeout) {
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error(`Request timeout after ${appSettings.timeoutMs}ms`));
                });
            }

            req.write(requestBody);
            req.end();
        });

        console.log('[Deep Planning][API] Response received:', {
            hasToolCalls: !!result.choices[0]?.message?.tool_calls,
            toolCallsCount: result.choices[0]?.message?.tool_calls?.length || 0,
            finishReason: result.choices[0]?.finish_reason
        });

        // 处理工具调用
        if (result.choices[0]?.message?.tool_calls && result.choices[0]?.message.tool_calls.length > 0) {
            console.log('[Deep Planning][API] Tool calls detected, count:', result.choices[0].message.tool_calls.length);

            const toolResults = [];
            let hasDataModification = false;

            for (const tc of result.choices[0].message.tool_calls) {
                try {
                    const toolResult = await executeSingleToolCall(tc, data.scheduleData || {});

                    try {
                        const resultObj = JSON.parse(toolResult);
                        if (resultObj.shouldRefresh) {
                            hasDataModification = true;
                        }
                    } catch (e) {}

                    toolResults.push({
                        toolCallId: tc.id,
                        result: toolResult
                    });
                    console.log('[Deep Planning][API] Tool executed:', tc.function.name);
                } catch (e) {
                    console.error('[Deep Planning][API] Tool execution error:', e);
                    toolResults.push({
                        toolCallId: tc.id,
                        result: JSON.stringify({ error: e.message })
                    });
                }
            }

            const assistantMsg = {
                role: 'assistant',
                content: result.choices[0].message.content || '',
                tool_calls: result.choices[0].message.tool_calls
            };

            if (result.choices[0].message.reasoning_content && modelName.includes('reasoner')) {
                assistantMsg.reasoning_content = result.choices[0].message.reasoning_content;
            }

            const newMessages = [
                ...messages,
                assistantMsg
            ];

            for (const tr of toolResults) {
                newMessages.push({
                    role: 'tool',
                    tool_call_id: tr.toolCallId,
                    content: tr.result
                });
            }

            console.log('[Deep Planning][API] Making follow-up call with tool results, depth:', depth + 1);
            const followUpResult = await callDeepseekAIWithCustomTools(newMessages, customTools, overrideModel, retryCount, depth + 1);

            followUpResult.shouldRefresh = hasDataModification || followUpResult.shouldRefresh;
            return followUpResult;
        }

        return {
            content: result.choices[0]?.message?.content || '让我重新思考一下这个问题...',
            proposal: null,
            shouldRefresh: false
        };
    } catch (error) {
        console.error('[Deep Planning][API] Error:', error);

        if (error.message && (error.message.includes('HTTP 5') || error.message.includes('HTTP 429')) && retryCount < maxRetries) {
            console.log(`[Deep Planning][API] Server error, retrying... (${retryCount + 1}/${maxRetries})`);
            await sleep(retryDelay * (retryCount + 1));
            return callDeepseekAIWithCustomTools(messages, customTools, overrideModel, retryCount + 1, depth);
        }

        if ((error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') && retryCount < maxRetries) {
            console.log(`[Deep Planning][API] Network error, retrying... (${retryCount + 1}/${maxRetries})`);
            await sleep(retryDelay * (retryCount + 1));
            return callDeepseekAIWithCustomTools(messages, customTools, overrideModel, retryCount + 1, depth);
        }

        return getFallbackResponse(error, messages, {});
    }
}

    // 构建消息历史
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // 添加最近的历史对话（最多10条）
    const recentHistory = (history || []).slice(-10);
    for (const msg of recentHistory) {
        if (!msg.proposal) { // 跳过包含proposal的系统消息
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        }
    }

    // 添加当前消息（Deepseek不支持多模态，图片将被忽略）
    if (images && images.length > 0) {
        // Deepseek不支持图片分析，添加文本说明
        let userMessage = message || '';
        if (images.length > 0) {
            userMessage = (userMessage ? userMessage + '\n\n' : '') + `[用户上传了 ${images.length} 张图片，但当前AI不支持图片分析]`;
        }
        if (userMessage) {
            messages.push({ role: 'user', content: userMessage });
        }
    } else if (message) {
        // 纯文本消息
        messages.push({ role: 'user', content: message });
    }

    // 调用Deepseek AI API，根据意图选择模型
    const selectedModel = needsReasoning(message) ? REASONER_MODEL_NAME : MODEL_NAME;
    console.log(`[AI] Intent detection: reasoning=${needsReasoning(message)}, model=${selectedModel}`);

    try {
        const response = await callDeepseekAI(messages, scheduleData, 0, 0, selectedModel);
        return {
            response: {
                content: response.content,
                proposal: response.proposal
            },
            updatedProfile: extractProfileInfo(response.content, profile),
            shouldRefresh: response.shouldRefresh || false  // 传递刷新标志
        };
    } catch (error) {
        console.error('Deepseek AI error:', error);
        return {
            response: {
                content: '哎呀，我的脑子卡住了。换个话题？',
                proposal: null
            },
            shouldRefresh: false
        };
    }
}

// 调用Deepseek AI API（带重试机制）
async function callDeepseekAI(messages, scheduleData, retryCount = 0, depth = 0, overrideModel = null) {
    const modelName = overrideModel || MODEL_NAME;
    // 检查API密钥是否已配置
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
        console.error('[API] ERROR: DeepSeek API key not configured!');
        return {
            content: 'AI服务未配置，请在config.json中设置有效的API密钥。',
            proposal: null
        };
    }

    // 应用速率限制（1秒1次）
    await apiRateLimiter.acquire();

    // 递归深度限制，防止无限循环
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) {
        console.error('[API] Maximum tool call depth exceeded');
        return {
            content: '工具调用轮次过多，请简化您的请求。',
            proposal: null
        };
    }

    const maxRetries = 3;
    const retryDelay = 1000; // 1秒

    // 使用共享的工具定义（从 ai-tools.js 导入，9个核心工具）
    const tools = AI_TOOLS;

    try {
        // 使用 https 模块发起请求（支持 SSL 配置）
        const apiUrl = new URL(DEEPSEEK_API_URL);
        const isReasoner = modelName.includes('reasoner');
        const reqBody = {
            model: modelName,
            messages: messages,
            tools: tools,
            tool_choice: 'auto',
            max_tokens: isReasoner ? 16000 : 2000
        };
        // deepseek-reasoner 不支持 temperature
        if (!isReasoner) {
            reqBody.temperature = 0.8;
        }
        const requestBody = safeJsonStringify(reqBody);

        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: apiUrl.hostname,
                port: apiUrl.port || 443,
                path: apiUrl.pathname + apiUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Length': Buffer.byteLength(requestBody)
                },
                // 根据配置决定是否验证SSL证书
                rejectUnauthorized: appSettings.rejectUnauthorized !== false
            };

            if (appSettings.enableTimeout) {
                options.timeout = appSettings.timeoutMs;
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

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

            req.on('error', (err) => {
                reject(err);
            });

            if (appSettings.enableTimeout) {
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error(`Request timeout after ${appSettings.timeoutMs}ms`));
                });
            }

            req.write(requestBody);
            req.end();
        });

        // 调试日志：记录AI响应
        console.log('[Deepseek AI] Response:', {
            hasToolCalls: !!result.choices[0]?.message?.tool_calls,
            toolCallsCount: result.choices[0]?.message?.tool_calls?.length || 0,
            content: result.choices[0]?.message?.content,
            finishReason: result.choices[0]?.finish_reason
        });

        // 处理工具调用 - 支持多轮工具调用
        if (result.choices[0]?.message?.tool_calls && result.choices[0]?.message?.tool_calls.length > 0) {
            console.log('[Deepseek AI] Tool calls detected, count:', result.choices[0].message.tool_calls.length);

            // 执行所有工具调用并收集结果，同时追踪是否有修改数据的操作
            const toolResults = [];
            let hasDataModification = false;

            for (const tc of result.choices[0].message.tool_calls) {
                try {
                    const toolResult = await executeSingleToolCall(tc, scheduleData);

                    // 检查工具结果是否包含 shouldRefresh 标志
                    try {
                        const resultObj = JSON.parse(toolResult);
                        if (resultObj.shouldRefresh) {
                            hasDataModification = true;
                        }
                    } catch (e) {
                        // 不是 JSON，忽略
                    }

                    toolResults.push({
                        toolCallId: tc.id,
                        result: toolResult
                    });
                    console.log('[Deepseek AI] Tool executed:', tc.function.name, 'result length:', toolResult.length);
                } catch (e) {
                    console.error('[Deepseek AI] Tool execution error:', e);
                    toolResults.push({
                        toolCallId: tc.id,
                        result: JSON.stringify({ error: e.message })
                    });
                }
            }

            // 构建新的消息数组，包含工具调用和结果
            const assistantMsg = {
                role: 'assistant',
                content: result.choices[0].message.content || '',
                tool_calls: result.choices[0].message.tool_calls
            };
            // deepseek-reasoner 要求回传 reasoning_content，否则返回 400
            if (result.choices[0].message.reasoning_content && modelName.includes('reasoner')) {
                assistantMsg.reasoning_content = result.choices[0].message.reasoning_content;
            }
            const newMessages = [
                ...messages,
                assistantMsg
            ];

            // 添加工具结果
            for (const tr of toolResults) {
                newMessages.push({
                    role: 'tool',
                    tool_call_id: tr.toolCallId,
                    content: tr.result
                });
            }

            // 递归调用API，让AI基于工具结果生成最终回复
            console.log('[Deepseek AI] Making follow-up call with tool results, depth:', depth + 1);
            const followUpResult = await callDeepseekAI(newMessages, scheduleData, retryCount, depth + 1, overrideModel);

            // 传递 shouldRefresh 标志
            followUpResult.shouldRefresh = hasDataModification || followUpResult.shouldRefresh;
            return followUpResult;
        }

        return {
            content: result.choices[0]?.message?.content || '我没听懂，再说一遍？',
            proposal: null,
            shouldRefresh: false
        };
    } catch (error) {
        console.error('Deepseek AI call error:', error);

        // 网络错误或服务端错误，尝试重试
        if (error.message && (error.message.includes('HTTP 5') || error.message.includes('HTTP 429')) && retryCount < maxRetries) {
            console.log(`Server error, retrying... (${retryCount + 1}/${maxRetries})`);
            await sleep(retryDelay * (retryCount + 1));
            return callDeepseekAI(messages, scheduleData, retryCount + 1, depth, overrideModel);
        }

        // 网络连接错误，尝试重试
        if ((error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') && retryCount < maxRetries) {
            console.log(`Network error, retrying... (${retryCount + 1}/${maxRetries})`);
            await sleep(retryDelay * (retryCount + 1));
            return callDeepseekAI(messages, scheduleData, retryCount + 1, depth, overrideModel);
        }

        // 返回降级响应
        return getFallbackResponse(error, messages, scheduleData);
    }
}

// 辅助函数：延迟
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 降级响应：当AI调用失败时使用
function getFallbackResponse(error, messages, scheduleData) {
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const errorMsg = error.message || '';

    // 速率限制错误
    if (errorMsg.includes('1302') || errorMsg.includes('速率限制') || errorMsg.includes('429')) {
        return {
            content: '请求过于频繁，请稍等几秒再试。',
            proposal: null
        };
    }

    // 根据用户消息尝试给出简单回应
    if (lastUserMessage.includes('看看') || lastUserMessage.includes('查看') || lastUserMessage.includes('schedule')) {
        return {
            content: '啧，网断了。不过我记得你这周排挺满的，自己翻翻日历看？',
            proposal: null
        };
    }

    if (lastUserMessage.includes('累') || lastUserMessage.includes('忙')) {
        return {
            content: '网络连接失败，请检查网络后重试。',
            proposal: null
        };
    }

    if (lastUserMessage.includes('删除') || lastUserMessage.includes('删掉')) {
        return {
            content: '网络连接失败，请检查网络后重试。',
            proposal: null
        };
    }

    return {
        content: `哎呀，网络出问题了（${error.message}）。这破网老掉链子...过会儿再试试？`,
        proposal: null
    };
}

// 执行单个工具调用并返回JSON字符串结果（用于多轮工具调用）
// 使用新的 9 工具架构，通过路由兼容旧工具名称
async function executeSingleToolCall(toolCall, scheduleData) {
    let name, args, callId;
    if (typeof toolCall === 'string') {
        name = toolCall; args = {}; callId = 'call_unknown';
    } else {
        callId = toolCall.id || 'call_unknown';
        name = toolCall.function?.name || toolCall.name;
        const argsStr = toolCall.function?.arguments || toolCall.arguments || '{}';
        try { args = JSON.parse(argsStr); } catch (e) { args = {}; }
    }

    const schedules = scheduleData?.schedules || {};
    console.log('[Single Tool Call]', { name, args, callId });

    // ========== 工具名称路由 ==========
    const TOOL_ROUTING = {
        'list_schedules': 'view_schedule', 'list_all_dates': 'view_schedule',
        'search_schedules': 'view_schedule', 'search_keyword': 'view_schedule',
        'get_date_schedule': 'view_schedule',
        'add_recurring_schedule': 'add_schedule',
        'propose_schedule_change': 'modify_schedule', 'suggest_schedule_edit': 'modify_schedule',
        'edit_time_slot': 'modify_schedule',
        'batch_modify_schedules': 'modify_schedule', 'batch_delete_schedule': 'modify_schedule',
        'detect_schedule_conflicts': 'check_conflicts',
        'add_task': 'manage_tasks', 'view_tasks': 'manage_tasks',
        'complete_task': 'manage_tasks', 'update_task': 'manage_tasks',
        'delete_task_proposal': 'manage_tasks', 'delete_task': 'manage_tasks',
        'batch_delete_tasks': 'manage_tasks',
        'add_big_task': 'manage_big_tasks', 'list_big_tasks': 'manage_big_tasks',
        'complete_big_task': 'manage_big_tasks', 'update_big_task': 'manage_big_tasks',
        'delete_big_task_proposal': 'manage_big_tasks', 'delete_big_task': 'manage_big_tasks',
        'batch_delete_big_tasks': 'manage_big_tasks', 'break_down_big_task': 'manage_big_tasks',
        'suggest_optimization': 'analyze', 'analyze_schedule_patterns': 'analyze',
        'check_ddl_status': 'analyze', 'suggest_time_for_activity': 'analyze',
        'get_user_habits': 'analyze', 'smart_reschedule': 'analyze',
        'create_course_schedule': 'manage_courses', 'add_course': 'manage_courses',
        'modify_course': 'manage_courses', 'remove_course': 'manage_courses',
        'list_courses': 'manage_courses', 'swap_courses': 'manage_courses',
        'adjust_schedule_by_week': 'manage_courses', 'analyze_course_load': 'manage_courses',
        'import_course_schedule': 'manage_courses', 'export_course_schedule': 'manage_courses',
        'batch_manage_courses': 'manage_courses',
        'apply_schedule_template': 'manage_templates'
    };

    const routedName = TOOL_ROUTING[name] || name;
    let routedArgs = { ...args };

    // ========== 参数适配 ==========
    if (routedName === 'view_schedule' && name === 'list_schedules') routedArgs.list_all = true;
    if (routedName === 'view_schedule' && (name === 'search_schedules' || name === 'search_keyword')) routedArgs.keyword = args.keyword;
    if (routedName === 'manage_tasks' && name === 'add_task') routedArgs.action = 'add';
    if (routedName === 'manage_tasks' && name === 'view_tasks') { routedArgs.action = 'view'; routedArgs.date = args.date; }
    if (routedName === 'manage_tasks' && name === 'complete_task') { routedArgs.action = 'complete'; routedArgs.actual_minutes = args.actual_minutes; }
    if (routedName === 'manage_tasks' && name === 'update_task') { routedArgs.action = 'update'; routedArgs.new_task_name = args.new_task_name; routedArgs.new_estimated_minutes = args.new_estimated_minutes; routedArgs.new_note = args.new_note; }
    if (routedName === 'manage_tasks' && (name === 'delete_task_proposal' || name === 'delete_task')) routedArgs.action = 'delete';
    if (routedName === 'manage_tasks' && name === 'batch_delete_tasks') { routedArgs.action = 'batch_delete'; routedArgs.tasks = args.tasks; }
    if (routedName === 'manage_big_tasks' && name === 'add_big_task') routedArgs.action = 'add';
    if (routedName === 'manage_big_tasks' && name === 'list_big_tasks') { routedArgs.action = 'view'; routedArgs.filter = args.filter; }
    if (routedName === 'manage_big_tasks' && name === 'complete_big_task') routedArgs.action = 'complete';
    if (routedName === 'manage_big_tasks' && name === 'update_big_task') { routedArgs.action = 'update'; routedArgs.new_task_name = args.new_task_name; routedArgs.new_estimated_minutes = args.new_estimated_minutes; routedArgs.new_ddl = args.new_ddl; routedArgs.new_note = args.new_note; }
    if (routedName === 'manage_big_tasks' && (name === 'delete_big_task_proposal' || name === 'delete_big_task')) routedArgs.action = 'delete';
    if (routedName === 'manage_big_tasks' && name === 'batch_delete_big_tasks') { routedArgs.action = 'batch_delete'; routedArgs.task_names = args.task_names; }
    if (routedName === 'manage_big_tasks' && name === 'break_down_big_task') { routedArgs.action = 'break_down'; routedArgs.subtasks = args.subtasks; }
    if (routedName === 'modify_schedule' && name === 'batch_modify_schedules') { routedArgs.operation = args.operation; routedArgs.criteria = args.criteria; routedArgs.new_details = args.new_details; }
    if (routedName === 'modify_schedule' && name === 'batch_delete_schedule') { routedArgs.operation = 'batch_delete_dates'; routedArgs.dates = args.dates; }
    if (routedName === 'analyze' && name === 'suggest_optimization') routedArgs.action = 'optimize';
    if (routedName === 'analyze' && name === 'analyze_schedule_patterns') routedArgs.action = 'patterns';
    if (routedName === 'analyze' && name === 'check_ddl_status') routedArgs.action = 'ddl_status';
    if (routedName === 'analyze' && name === 'get_user_habits') routedArgs.action = 'habits';
    if (routedName === 'manage_courses' && name === 'create_course_schedule') { routedArgs.action = 'create'; routedArgs.courses = args.courses; }
    if (routedName === 'manage_courses' && name === 'add_course') routedArgs.action = 'add';
    if (routedName === 'manage_courses' && name === 'modify_course') routedArgs.action = 'modify';
    if (routedName === 'manage_courses' && name === 'remove_course') routedArgs.action = 'remove';
    if (routedName === 'manage_courses' && name === 'list_courses') { routedArgs.action = 'list'; routedArgs.weekday_filter = args.weekday; routedArgs.keyword = args.keyword; }
    if (routedName === 'manage_courses' && name === 'swap_courses') routedArgs.action = 'swap';
    if (routedName === 'manage_courses' && name === 'adjust_schedule_by_week') routedArgs.action = 'adjust_week';
    if (routedName === 'manage_courses' && name === 'analyze_course_load') routedArgs.action = 'analyze_load';
    if (routedName === 'manage_courses' && name === 'import_course_schedule') routedArgs.action = 'import';
    if (routedName === 'manage_courses' && name === 'export_course_schedule') { routedArgs.action = 'export'; routedArgs.export_format = args.format; }
    if (routedName === 'manage_courses' && name === 'batch_manage_courses') { routedArgs.action = 'batch_manage'; routedArgs.batch_operation = args.operation; }
    if (routedName === 'add_schedule' && name === 'add_recurring_schedule') {
        routedArgs.start_date = args.startDate; routedArgs.end_date = args.endDate;
        routedArgs.repeat_pattern = args.repeatPattern; routedArgs.weekdays = args.weekdays;
        routedArgs.title = args.title; routedArgs.highlights = args.highlights;
        routedArgs.timeSlots = [{ time: args.time, activity: args.activity, detail: args.detail, icon: args.icon }];
    }
    if (routedName === 'manage_templates' && name === 'apply_schedule_template') { routedArgs.action = 'apply'; }

    // ========== 工具执行 ==========
    switch (routedName) {
        case 'view_schedule': {
            if (routedArgs.list_all) {
                return JSON.stringify({ dates: Object.keys(schedules).sort(), count: Object.keys(schedules).length });
            }
            if (routedArgs.keyword) {
                const kw = sanitizeStr(routedArgs.keyword).toLowerCase();
                const results = [];
                for (const [date, sch] of Object.entries(schedules)) {
                    const txt = `${sanitizeStr(sch.title)} ${sanitizeStr(sch.highlights)} ${(sch.timeSlots||[]).map(s=>sanitizeStr(s.activity)).join(' ')}`.toLowerCase();
                    if (txt.includes(kw)) results.push({ date, title: sanitizeStr(sch.title) });
                }
                return safeJsonStringify({ keyword: kw, results, count: results.length });
            }
            const d = routedArgs.date, sch = schedules[d];
            if (!sch) return JSON.stringify({ exists: false, date: d, message: `${d} 没有安排`, availableDates: Object.keys(schedules).sort() });
            return JSON.stringify({ exists: true, date: d, title: sch.title, highlights: sch.highlights, timeSlots: sch.timeSlots || [] });
        }

        case 'add_schedule': {
            if (routedArgs.start_date) {
                const st = new Date(routedArgs.start_date);
                const en = routedArgs.end_date ? new Date(routedArgs.end_date) : new Date(st.getTime()+30*24*60*60*1000);
                const rp = routedArgs.repeat_pattern, tw = routedArgs.weekdays||[];
                const ts = routedArgs.timeSlots||[];
                const dates = [];
                if (rp==='daily') { let c=new Date(st); while(c<=en){dates.push(c.toISOString().split('T')[0]);c.setDate(c.getDate()+1);} }
                else if (rp==='weekly') { let c=new Date(st); while(c<=en){if(tw.includes(c.getDay())){const ds=c.toISOString().split('T')[0];if(!dates.includes(ds))dates.push(ds);}c.setDate(c.getDate()+1);} }
                else if (rp==='weekdays') { let c=new Date(st); while(c<=en){if(c.getDay()>=1&&c.getDay()<=5)dates.push(c.toISOString().split('T')[0]);c.setDate(c.getDate()+1);} }
                let ok=0,skip=0;
                for (const date of dates) {
                    if(!scheduleData.schedules[date]) scheduleData.schedules[date]={title:'',highlights:'',milestone:'',timeSlots:[],tasks:[]};
                    const {startMinutes:sS,endMinutes:sE}=parseTimeRange(ts[0].time);
                    let conflict=false;
                    for(const ex of scheduleData.schedules[date].timeSlots||[]){const{startMinutes:eS,endMinutes:eE}=parseTimeRange(ex.time);if(!(sE<=eS||sS>=eE)){conflict=true;break;}}
                    if(conflict){skip++;continue;}
                    scheduleData.schedules[date].timeSlots.push({time:ts[0].time,activity:ts[0].activity||'未命名活动',detail:ts[0].detail||'',icon:ts[0].icon||''});
                    scheduleData.schedules[date].timeSlots.sort((a,b)=>a.time.localeCompare(b.time));
                    if(routedArgs.title) scheduleData.schedules[date].title=routedArgs.title;
                    if(routedArgs.highlights) scheduleData.schedules[date].highlights=routedArgs.highlights;
                    ok++;
                }
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,message:`已周期性添加：成功 ${ok} 个，跳过 ${skip} 个`,shouldRefresh:true});
            }
            const d=routedArgs.date, ts=routedArgs.timeSlots||[];
            if(!d||!ts.length) return JSON.stringify({success:false,error:'缺少必要参数'});
            if(!schedules[d]) schedules[d]={title:routedArgs.title||'',highlights:routedArgs.highlights||'',milestone:'',timeSlots:[]};
            const added=[], conflicts=[];
            for(const slot of ts){
                if(!/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.test(slot.time)){conflicts.push({slot,error:'时间格式错误'});continue;}
                const{startMinutes:sS,endMinutes:sE}=parseTimeRange(slot.time);
                let conflict=false;
                for(const ex of schedules[d].timeSlots||[]){const{startMinutes:eS,endMinutes:eE}=parseTimeRange(ex.time);if(!(sE<=eS||sS>=eE)){conflicts.push({slot,error:`与 ${ex.time} ${ex.activity} 冲突`});conflict=true;break;}}
                if(conflict) continue;
                schedules[d].timeSlots.push({time:slot.time,activity:slot.activity||'未命名活动',detail:slot.detail||'',icon:slot.icon||''});
                added.push(slot);
            }
            schedules[d].timeSlots.sort((a,b)=>a.time.localeCompare(b.time));
            if(routedArgs.title) schedules[d].title=routedArgs.title;
            if(routedArgs.highlights) schedules[d].highlights=routedArgs.highlights;
            createBackup('data.json');
            await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
            return JSON.stringify({success:true,date:d,addedCount:added.length,addedSlots:added,conflicts,shouldRefresh:true});
        }

        case 'modify_schedule': {
            const op=routedArgs.operation, d=routedArgs.date;
            if(op==='batch_delete_dates'){
                const dates=routedArgs.dates||[];
                const valid=dates.filter(dd=>{const s=scheduleData?.schedules?.[dd];return s&&(s.timeSlots?.length>0||s.tasks?.length>0);});
                if(!valid.length) return JSON.stringify({success:false,error:'没有找到需要删除的安排'});
                return JSON.stringify({success:true,content:`**批量删除提案**\n\n将删除 ${valid.length} 个日期的安排\n\n请确认。`,proposal:{type:'batch_delete_schedule',dates:valid,reason:routedArgs.reason}});
            }
            if(op==='delete_all_matching'||op==='update_all_matching'){
                const cr=routedArgs.criteria||{}, nd=routedArgs.new_details||{};
                const affected=[];
                for(const [dd,sch] of Object.entries(schedules)){
                    const matched=(sch.timeSlots||[]).filter(s=>(!cr.activity||sanitizeStr(s.activity).includes(sanitizeStr(cr.activity)))&&(!cr.date||dd===cr.date));
                    if(matched.length) affected.push({date:dd,count:matched.length});
                }
                if(!affected.length) return JSON.stringify({success:false,error:'未找到匹配的日程'});
                return JSON.stringify({success:true,type:'proposal',proposal:{type:'batch_modify_schedules',operation:op,criteria:cr,new_details:nd,reason:routedArgs.reason,affectedDates:affected}});
            }
            return JSON.stringify({type:'proposal',date:d,changes:routedArgs.changes||[],reason:routedArgs.reason,proposal:{type:'modify_schedule',operation:op,date:d,changes:routedArgs.changes,reason:routedArgs.reason}});
        }

        case 'check_conflicts': {
            const d=routedArgs.date,ts=routedArgs.time_slot;
            if(!d||!ts) return JSON.stringify({success:false,error:'缺少日期或时间段'});
            const{startMinutes:sS,endMinutes:sE}=parseTimeRange(ts);
            const conflicts=[];
            for(const slot of (schedules[d]?.timeSlots||[])){const{startMinutes:eS,endMinutes:eE}=parseTimeRange(slot.time);if(!(sE<=eS||sS>=eE)) conflicts.push({existingActivity:slot.activity,existingTime:slot.time});}
            return JSON.stringify({success:true,date:d,timeSlot:ts,hasConflicts:conflicts.length>0,conflicts});
        }

        case 'manage_tasks': {
            const act=routedArgs.action;
            if(act==='add'){
                const d=routedArgs.date,tn=routedArgs.task_name,em=routedArgs.estimated_minutes;
                if(!d||!tn||!em) return JSON.stringify({success:false,error:'缺少必要参数'});
                if(!scheduleData.schedules[d]) scheduleData.schedules[d]={title:'',highlights:'',milestone:'',timeSlots:[],tasks:[]};
                scheduleData.schedules[d].tasks.push({name:tn,estimated:em.toString(),actual:'',completed:false});
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,content:`已为 ${d} 添加任务：${tn}`,shouldRefresh:true});
            }
            if(act==='view'){
                const d=routedArgs.date,sch=scheduleData?.schedules?.[d];
                if(!sch?.tasks?.length) return JSON.stringify({success:true,content:`${d} 暂无任务`});
                const p=sch.tasks.filter(t=>!t.completed),dn=sch.tasks.filter(t=>t.completed);
                let c=`${d} 的任务列表\n\n`;
                if(p.length){c+=`[ ] 待完成 (${p.length})\n`;p.forEach(t=>c+=`  [ ] ${t.name} - 预计${t.estimated}分钟\n`);c+='\n';}
                if(dn.length){c+=`已完成 (${dn.length})\n`;dn.forEach(t=>c+=`  [x] ${t.name} - 实际${t.actual||'?'}分钟\n`);}
                c+=`\n完成率：${Math.round(dn.length/sch.tasks.length*100)}%`;
                return JSON.stringify({success:true,content:c});
            }
            if(act==='complete'){
                const d=routedArgs.date,tn=routedArgs.task_name,sch=scheduleData?.schedules?.[d];
                if(!sch?.tasks) return JSON.stringify({success:false,content:`在 ${d} 没有找到任务`});
                const t=sch.tasks.find(x=>x.name===tn);
                if(!t) return JSON.stringify({success:false,content:`在 ${d} 没有找到"${tn}"`});
                t.completed=true;t.actual=(routedArgs.actual_minutes||0).toString();
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,content:`任务已完成：${tn}`,shouldRefresh:true});
            }
            if(act==='update'){
                const d=routedArgs.date,oldN=routedArgs.old_task_name||routedArgs.task_name;
                const sch=scheduleData?.schedules?.[d];
                if(!sch?.tasks) return JSON.stringify({success:false,content:`在 ${d} 没有找到任务`});
                const t=sch.tasks.find(x=>x.name===oldN);
                if(!t) return JSON.stringify({success:false,content:`在 ${d} 没有找到"${oldN}"`});
                const ch=[];
                if(routedArgs.new_task_name&&routedArgs.new_task_name!==oldN) ch.push(`名称：${oldN} -> ${routedArgs.new_task_name}`);
                if(routedArgs.new_estimated_minutes&&routedArgs.new_estimated_minutes.toString()!==t.estimated) ch.push(`用时：${t.estimated}分钟 -> ${routedArgs.new_estimated_minutes}分钟`);
                if(!ch.length) return JSON.stringify({success:false,content:'没有检测到修改'});
                return JSON.stringify({success:true,content:`**修改任务提案**\n\n${ch.map(c=>'* '+c).join('\n')}\n\n请确认。`,proposal:{type:'update_task',date:d,oldTaskName:oldN,newTaskName:routedArgs.new_task_name||oldN,newEstimatedMinutes:routedArgs.new_estimated_minutes||parseInt(t.estimated),reason:routedArgs.reason}});
            }
            if(act==='delete'){
                const d=routedArgs.date,tn=routedArgs.task_name,sch=scheduleData?.schedules?.[d];
                if(!sch?.tasks) return JSON.stringify({success:false,content:`在 ${d} 没有找到任务`});
                if(!sch.tasks.find(x=>x.name===tn)) return JSON.stringify({success:false,content:`在 ${d} 没有找到"${tn}"`});
                return JSON.stringify({success:true,content:`**删除任务提案**\n\n任务：${tn}\n\n请确认。`,proposal:{type:'delete_task',date:d,taskName:tn,reason:routedArgs.reason}});
            }
            if(act==='batch_delete'){
                const tasks=routedArgs.tasks||[];
                if(!tasks.length) return JSON.stringify({success:false,content:'没有指定要删除的任务'});
                const valid=tasks.filter(ti=>scheduleData?.schedules?.[ti.date]?.tasks?.find(x=>x.name===ti.task_name));
                if(!valid.length) return JSON.stringify({success:false,content:'没有找到任何任务'});
                return JSON.stringify({success:true,content:`**批量删除任务提案**\n\n将删除 ${valid.length} 个任务。\n\n请确认。`,proposal:{type:'batch_delete_tasks',tasks:valid,reason:routedArgs.reason}});
            }
            return JSON.stringify({success:false,error:`manage_tasks: 未知 action "${act}"`});
        }

        case 'manage_big_tasks': {
            const act=routedArgs.action;
            if(act==='add'){
                const{task_name:tn,estimated_minutes:em,ddl}=routedArgs;
                if(!tn||!em||!ddl) return JSON.stringify({success:false,error:'缺少必要参数'});
                if(!scheduleData.bigTasks) scheduleData.bigTasks=[];
                scheduleData.bigTasks.push({name:tn,estimated:em,ddl,taskType:routedArgs.task_type||'short',startDate:routedArgs.start_date||null,note:routedArgs.note||'',completed:false,createdAt:new Date().toISOString()});
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,content:`已创建大任务：${tn}\nDDL：${ddl}`,shouldRefresh:true});
            }
            if(act==='view'){
                const filter=routedArgs.filter||'all';
                if(!scheduleData.bigTasks?.length) return JSON.stringify({success:true,content:'暂无大任务'});
                let filtered=scheduleData.bigTasks;
                const today=new Date();today.setHours(0,0,0,0);
                if(filter==='pending') filtered=filtered.filter(t=>!t.completed);
                else if(filter==='completed') filtered=filtered.filter(t=>t.completed);
                else if(filter==='overdue') filtered=filtered.filter(t=>!t.completed&&t.ddl&&new Date(t.ddl)<today);
                const parts=[`大任务列表 (${filtered.length}个)\n\n`];
                filtered.sort((a,b)=>a.ddl&&b.ddl?new Date(a.ddl)-new Date(b.ddl):0);
                filtered.forEach(t=>parts.push(`${t.completed?'[x]':'[ ]'} ${t.name} | ${t.estimated}分钟 | DDL: ${t.ddl||'无'}\n`));
                return JSON.stringify({success:true,content:parts.join('')});
            }
            if(act==='complete'){
                const t=scheduleData.bigTasks?.find(x=>x.name===routedArgs.task_name);
                if(!t) return JSON.stringify({success:false,content:`未找到"${routedArgs.task_name}"`});
                t.completed=true;
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,content:`大任务已完成：${routedArgs.task_name}`,shouldRefresh:true});
            }
            if(act==='update'){
                const oldN=routedArgs.old_task_name||routedArgs.task_name,t=scheduleData.bigTasks?.find(x=>x.name===oldN);
                if(!t) return JSON.stringify({success:false,content:`未找到"${oldN}"`});
                const ch=[];
                if(routedArgs.new_task_name&&routedArgs.new_task_name!==oldN) ch.push(`名称：${oldN} -> ${routedArgs.new_task_name}`);
                if(routedArgs.new_estimated_minutes&&routedArgs.new_estimated_minutes!==t.estimated) ch.push(`用时：${t.estimated} -> ${routedArgs.new_estimated_minutes}`);
                if(routedArgs.new_ddl&&routedArgs.new_ddl!==t.ddl) ch.push(`DDL：${t.ddl||'无'} -> ${routedArgs.new_ddl}`);
                if(!ch.length) return JSON.stringify({success:false,content:'没有检测到修改'});
                return JSON.stringify({success:true,content:`**修改大任务提案**\n\n${ch.map(c=>'* '+c).join('\n')}\n\n请确认。`,proposal:{type:'update_big_task',oldTaskName:oldN,newTaskName:routedArgs.new_task_name||oldN,newEstimatedMinutes:routedArgs.new_estimated_minutes||t.estimated,newDdl:routedArgs.new_ddl||t.ddl,reason:routedArgs.reason}});
            }
            if(act==='delete'){
                const t=scheduleData.bigTasks?.find(x=>x.name===routedArgs.task_name);
                if(!t) return JSON.stringify({success:false,content:`未找到"${routedArgs.task_name}"`});
                return JSON.stringify({success:true,content:`**删除大任务提案**\n\n任务：${routedArgs.task_name}\n\n请确认。`,proposal:{type:'delete_big_task',taskName:routedArgs.task_name,reason:routedArgs.reason}});
            }
            if(act==='batch_delete'){
                const names=routedArgs.task_names||[];
                const valid=names.filter(n=>scheduleData.bigTasks?.find(x=>x.name===n));
                if(!valid.length) return JSON.stringify({success:false,content:'没有找到任何大任务'});
                return JSON.stringify({success:true,content:`**批量删除大任务提案**\n\n将删除 ${valid.length} 个大任务。\n\n请确认。`,proposal:{type:'batch_delete_big_tasks',taskNames:valid,reason:routedArgs.reason}});
            }
            if(act==='break_down'){
                const bn=routedArgs.task_name||routedArgs.big_task_name;
                const bt=scheduleData.bigTasks?.find(x=>x.name===bn);
                if(!bt) return JSON.stringify({success:false,content:`未找到"${bn}"`});
                let count=0;
                for(const sub of (routedArgs.subtasks||[])){
                    if(!scheduleData.schedules[sub.date]) scheduleData.schedules[sub.date]={title:'',highlights:'',milestone:'',timeSlots:[],tasks:[]};
                    if(!scheduleData.schedules[sub.date].tasks) scheduleData.schedules[sub.date].tasks=[];
                    scheduleData.schedules[sub.date].tasks.push({name:sub.name,estimated:sub.estimated_minutes.toString(),actual:'',completed:false});
                    count++;
                }
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,content:`已将"${bn}"分解为 ${count} 个子任务`,shouldRefresh:true});
            }
            return JSON.stringify({success:false,error:`manage_big_tasks: 未知 action "${act}"`});
        }

        case 'manage_courses': {
            const act=routedArgs.action;
            if(act==='list'){
                const wf=routedArgs.weekday_filter,kw=sanitizeStr(routedArgs.keyword||'').toLowerCase();
                const wdN=['周日','周一','周二','周三','周四','周五','周六'];
                const all=[];
                for(const [date,sch] of Object.entries(schedules)){
                    const dow=new Date(date).getDay();
                    if(wf!==undefined&&dow!==wf) continue;
                    for(const slot of (sch.timeSlots||[])){
                        const n=sanitizeStr(slot.activity);
                        if(kw&&!n.toLowerCase().includes(kw)) continue;
                        all.push({date,weekday:dow,time:slot.time,name:n});
                    }
                }
                if(!all.length) return JSON.stringify({success:true,content:'暂无课程'});
                all.sort((a,b)=>a.weekday!==b.weekday?a.weekday-b.weekday:a.time.localeCompare(b.time));
                const byDay={};all.forEach(c=>{(byDay[c.weekday]=byDay[c.weekday]||[]).push(c);});
                const parts=[`课程表 (${all.length} 门)\n\n`];
                for(let i=1;i<=7;i++){const dd=i===7?0:i;if(!byDay[dd])continue;parts.push(`[${wdN[dd]}]\n`);byDay[dd].forEach(c=>parts.push(`  ${c.time} ${c.name}\n`));parts.push('\n');}
                return safeJsonStringify({success:true,content:parts.join('')});
            }
            if(act==='analyze_load'){
                const sd=routedArgs.start_date,ed=routedArgs.end_date;
                if(!sd||!ed) return JSON.stringify({success:false,error:'缺少日期范围'});
                let total=0,hours=0;
                for(const [date,sch] of Object.entries(schedules)){if(date<sd||date>ed)continue;for(const slot of(sch.timeSlots||[])){total++;hours+=parseTimeRange(slot.time).endHour-parseTimeRange(slot.time).startHour;}}
                return JSON.stringify({success:true,content:`课程负荷：${total}节课，约${Math.round(hours)}小时`});
            }
            if(act==='export'){
                const fmt=routedArgs.export_format||'text';
                const all=[];
                for(const [date,sch] of Object.entries(schedules)){for(const slot of(sch.timeSlots||[]))all.push({date,time:slot.time,name:slot.activity,detail:slot.detail||''});}
                let c=fmt==='json'?'```json\n'+JSON.stringify(all,null,2)+'\n```':all.map(x=>`${x.date} ${x.time} - ${x.name}`).join('\n');
                return JSON.stringify({success:true,content:c});
            }
            // create/add/modify/remove/swap/adjust_week/import/batch_manage -> proposals
            return JSON.stringify({success:true,type:'proposal',proposal:{type:'modify_course',action:act,...routedArgs,reason:routedArgs.reason}});
        }

        case 'analyze': {
            const act=routedArgs.action;
            if(act==='patterns'){
                const period=routedArgs.period||'本月';
                const now=new Date();
                let startDate,endDate;
                if(period==='本周'){startDate=new Date(now);startDate.setDate(now.getDate()-now.getDay()+1);endDate=new Date(startDate);endDate.setDate(startDate.getDate()+6);}
                else{startDate=new Date(now.getFullYear(),now.getMonth(),1);endDate=new Date(now.getFullYear(),now.getMonth()+1,0);}
                const ac={};let tm=0;
                for(const [date,sch] of Object.entries(schedules)){const d=new Date(date);if(d<startDate||d>endDate)continue;for(const slot of(sch.timeSlots||[])){tm+=parseTimeRange(slot.time).endMinutes-parseTimeRange(slot.time).startMinutes;ac[slot.activity]=(ac[slot.activity]||0)+1;}}
                const sorted=Object.entries(ac).sort((a,b)=>b[1]-a[1]).slice(0,10);
                return JSON.stringify({success:true,period,totalHours:Math.round(tm/60*10)/10,topActivities:sorted.map(([n,c])=>({name:n,count:c}))});
            }
            if(act==='optimize'){
                const d=routedArgs.date;
                if(!d||!schedules[d]) return JSON.stringify({success:true,message:'该日期没有安排'});
                const slots=schedules[d].timeSlots||[];
                if(slots.length<2) return JSON.stringify({success:true,message:'安排较少，暂无建议'});
                const sorted=slots.map(s=>({...s,parsed:parseTimeRange(s.time)})).sort((a,b)=>a.parsed.startMinutes-b.parsed.startMinutes);
                const gaps=[];
                for(let i=1;i<sorted.length;i++){const g=sorted[i].parsed.startMinutes-sorted[i-1].parsed.endMinutes;if(g>=30)gaps.push({between:`${sorted[i-1].time} 和 ${sorted[i].time}`,duration:g});}
                return JSON.stringify({success:true,date:d,totalSlots:slots.length,gaps});
            }
            if(act==='ddl_status'){
                const th=routedArgs.days_threshold||7;
                const today=new Date();today.setHours(0,0,0,0);
                const reminders=[];
                for(const task of(scheduleData.bigTasks||[])){
                    if(task.completed||!task.ddl) continue;
                    const dd=new Date(task.ddl);dd.setHours(0,0,0,0);
                    const dl=Math.ceil((dd-today)/(1000*60*60*24));
                    if(dl<=th) reminders.push({taskName:task.name,ddl:task.ddl,daysLeft:dl,level:dl<=0?'critical':dl<=3?'urgent':'warning'});
                }
                return JSON.stringify({success:true,reminders,urgentCount:reminders.filter(r=>r.level==='urgent'||r.level==='critical').length});
            }
            if(act==='habits'){
                const dc={},tc={};
                for(const [date,sch] of Object.entries(schedules)){const dow=new Date(date).getDay();for(const slot of(sch.timeSlots||[])){dc[dow]=(dc[dow]||0)+1;const h=slot.time.split('-')[0].split(':')[0];tc[h]=(tc[h]||0)+1;}}
                const wdN=['周日','周一','周二','周三','周四','周五','周六'];
                const bd=Object.entries(dc).sort((a,b)=>b[1]-a[1])[0];
                const bh=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0];
                return JSON.stringify({success:true,habits:{busiestDay:bd?`${wdN[bd[0]]} (${bd[1]}项)`:'无数据',busiestHour:bh?`${bh[0]}:00 (${bh[1]}项)`:'无数据',totalDays:Object.keys(schedules).length}});
            }
            return JSON.stringify({success:false,error:`analyze: 未知 action "${act}"`});
        }

        case 'manage_templates': {
            const act=routedArgs.action;
            if(act==='list'){const t=scheduleData.templates||{};return JSON.stringify({success:true,templates:Object.keys(t),count:Object.keys(t).length});}
            if(act==='create'){
                if(!routedArgs.template_name||!routedArgs.template_data) return JSON.stringify({success:false,error:'缺少参数'});
                if(!scheduleData.templates) scheduleData.templates={};
                scheduleData.templates[routedArgs.template_name]=routedArgs.template_data;
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,message:`模板"${routedArgs.template_name}"已创建`});
            }
            if(act==='apply'){
                if(!routedArgs.template_name||!routedArgs.target_date) return JSON.stringify({success:false,error:'缺少参数'});
                const t=scheduleData?.templates?.[routedArgs.template_name];
                if(!t) return JSON.stringify({success:false,error:`模板"${routedArgs.template_name}"不存在`});
                return JSON.stringify({success:true,type:'proposal',proposal:{type:'apply_template',templateName:routedArgs.template_name,targetDate:routedArgs.target_date,templateData:t}});
            }
            if(act==='delete'){
                if(!routedArgs.template_name) return JSON.stringify({success:false,error:'缺少模板名称'});
                delete scheduleData?.templates?.[routedArgs.template_name];
                createBackup('data.json');
                await fs.promises.writeFile(pmPaths.getDataFilePath(),safeJsonStringify(scheduleData,2),'utf8');
                return JSON.stringify({success:true,message:`模板"${routedArgs.template_name}"已删除`});
            }
            return JSON.stringify({success:false,error:`manage_templates: 未知 action "${act}"`});
        }

        // ========== 深度规划量化分析工具 ==========

        case 'value_monetization': {
            const goal = routedArgs.goal || '';
            const years = routedArgs.timeframe_years || 5;
            const ctx = routedArgs.context || '';
            const investment = routedArgs.current_investment || '';
            const goalLower = goal.toLowerCase();
            let category = 'general', estimatedAnnualValue = 50000, confidence = '中';
            if (goalLower.includes('工程师')||goalLower.includes('技术')||goalLower.includes('编程')||goalLower.includes('ai')||goalLower.includes('开发')) { category='tech'; estimatedAnnualValue=150000; confidence='高'; }
            else if (goalLower.includes('创业')||goalLower.includes('商业')||goalLower.includes('生意')) { category='business'; estimatedAnnualValue=200000; confidence='中'; }
            else if (goalLower.includes('学术')||goalLower.includes('研究')||goalLower.includes('博士')||goalLower.includes('教授')) { category='academic'; estimatedAnnualValue=80000; confidence='中'; }
            else if (goalLower.includes('财务')||goalLower.includes('投资')||goalLower.includes('理财')||goalLower.includes('自由')) { category='financial'; estimatedAnnualValue=100000; confidence='中'; }
            else if (goalLower.includes('艺术')||goalLower.includes('设计')||goalLower.includes('创作')) { category='creative'; estimatedAnnualValue=60000; confidence='低'; }
            return safeJsonStringify({tool:'value_monetization',goal,category,estimated_annual_value:`¥${estimatedAnnualValue.toLocaleString()}`,total_potential_value:`¥${(estimatedAnnualValue*years).toLocaleString()}`,opportunity_cost:`¥${Math.round(estimatedAnnualValue*0.6*years).toLocaleString()}`,value_drivers:[`领域:${category}`,`周期:${years}年`,investment?`投入:${investment}`:''].filter(Boolean),confidence_level:confidence,monetization_path:`${years}年内在${category}领域建立核心竞争力，实现年化价值¥${estimatedAnnualValue.toLocaleString()}`},2);
        }

        case 'roi_calculator': {
            const type=routedArgs.investment_type||'time', amount=routedArgs.investment_amount||'', ret=routedArgs.expected_return||'', horizon=routedArgs.time_horizon||'3年', alternatives=routedArgs.alternatives||[];
            const hNum=parseInt(horizon)||3;
            let roiRatio,breakEven,riskAdjRoi;
            if(type==='time'){roiRatio=hNum>=5?'300%-500%':'150%-250%';breakEven=`${Math.ceil(hNum*0.4)}年后正向回报`;riskAdjRoi=`调整后ROI:${hNum>=5?200:120}%`;}
            else if(type==='money'){roiRatio=hNum>=5?'200%-400%':'120%-200%';breakEven=`${Math.ceil(hNum*0.3)}年后回本`;riskAdjRoi=`调整后ROI:${hNum>=5?150:90}%`;}
            else{roiRatio='180%-280%';breakEven=`${Math.ceil(hNum*0.35)}年后正向回报`;riskAdjRoi='调整后ROI:130%';}
            const compTable=alternatives.length>0?alternatives.map((a,i)=>({alternative:a,estimated_roi:`${100+i*50}%-${250+i*50}%`,risk_level:i%2===0?'中等':'较高',feasibility:i===0?'高':'中'})):null;
            return safeJsonStringify({tool:'roi_calculator',investment_type:type,investment_amount:amount,expected_return:ret,time_horizon:horizon,roi_ratio:roiRatio,break_even_point:breakEven,risk_adjusted_roi:riskAdjRoi,comparison_table:compTable,recommendation:hNum>=3?`此投资在${horizon}周期内具有合理性，建议分阶段验证假设。`:`建议延长评估窗口至至少3年以获得更准确判断。`},2);
        }

        case 'milestone_planner': {
            const goal=routedArgs.long_term_goal||'', targetYear=routedArgs.target_year||5, currentStatus=routedArgs.current_status||'起点', constraints=routedArgs.constraints||[], phases=routedArgs.phases||4;
            const pNames=['奠基期','成长期','加速期','成熟期'], pDescs=['建立基础能力和知识体系','积累经验和初步成果','快速扩张和深度突破','巩固地位和持续优化'];
            const milestones=[];
            for(let i=0;i<phases;i++){const sY=Math.round(targetYear/phases*i),eY=Math.round(targetYear/phases*(i+1));milestones.push({phase:`第${i+1}阶段:${pNames[i]||'阶段'+(i+1)}`,timeline:`第${sY}-${eY}年`,objective:pDescs[i]||`推进目标的关键步骤`,success_metrics:[`指标${i+1}.1:阶段性产出物`,`指标${i+1}.2:能力提升度`],key_decisions:[`决策点${i+1}.1:方向确认`,`决策点${i+1}.2:资源分配`],resource_needs:constraints[i]||'动态调整'});}
            return safeJsonStringify({tool:'milestone_planner',long_term_goal:goal,total_timespan:`${targetYear}年`,current_status:currentStatus,phases_count:phases,milestones,critical_path:milestones.map(m=>m.phase).join(' → '),risk_gates:milestones.map((m,i)=>({gate:`检查点${i+1}:${m.phase.split(':')[1]?.trim()||m.phase}`,criteria:m.success_metrics[0],trigger:`第${Math.round(targetYear/phases*(i+1))}年末`}))},2);
        }

        case 'swot_analysis': {
            const subject=routedArgs.subject||'', userCtx=routedArgs.user_context||'', focusArea=routedArgs.focus_area||'general';
            const templates={career:{s:['专业能力','行业经验','人脉网络','学历背景'],w:['技能短板','经验不足','资源限制','认知盲区'],o:['行业趋势','市场需求','技术变革','政策红利'],t:['竞争加剧','技术替代','经济波动','行业衰退']},life:{s:['健康状况','家庭支持','时间灵活性','学习能力'],w:['精力分散','习惯阻力','社交局限','财务压力'],o:['个人成长空间','关系拓展可能','新兴趣探索','生活方式优化'],t:['健康风险','关系变化','意外事件','心理压力']},financial:{s:['收入来源','储蓄基础','投资知识','风险承受力'],w:['负债压力','消费习惯','收入单一','缺乏规划'],o:['增值渠道','被动收入','资产配置','技能变现'],t:['市场波动','通货膨胀','失业风险','意外支出']},skill:{s:['核心技能','学习能力','实践经验','认证资质'],w:['知识盲区','练习不足','应用场景少','更新滞后'],o:['新技术栈','跨界融合','需求增长','社区生态'],t:['技术过时','竞争门槛降低','AI替代','标准变更']}};
            const tpl=templates[focusArea]||templates.career;
            return safeJsonStringify({tool:'swot_analysis',subject,focus_area:focusArea,user_context:userCtx,swot:{strengths:tpl.s.map((x,i)=>({id:`S${i+1}`,item:x,internal:true,positive:true})),weaknesses:tpl.w.map((x,i)=>({id:`W${i+1}`,item:x,internal:true,positive:false})),opportunities:tpl.o.map((x,i)=>({id:`O${i+1}`,item:x,external:true,positive:true})),threats:tpl.t.map((x,i)=>({id:`T${i+1}`,item:x,external:true,positive:false}))},strategic_implications:['SO策略:利用核心能力抓住外部机遇','WO策略:弥补短板以利用机会','ST策略:用优势应对外部威胁','WT策略:最小化劣势并规避威胁'],action_priority:[{p:1,a:`发挥最大优势(S1)抓住最佳机会(O1)`,e:'高',i:'高'},{p:2,a:'优先解决最关键劣势(W1)',e:'中',i:'高'},{p:3,a:'制定威胁缓解计划(T1)',e:'中',i:'中'},{p:4,a:'探索次级机会(O2-O3)',e:'低',i:'中'}]},2);
        }

        case 'decision_matrix': {
            const topic=routedArgs.decision_topic||'', options=routedArgs.options||[], userCriteria=routedArgs.criteria||[], context=routedArgs.context||'';
            const criteria=userCriteria.length>0?userCriteria:['可行性','回报潜力','风险程度','时间成本','个人匹配度'];
            const weights={};criteria.forEach((c,i)=>{weights[c]=[0.25,0.2,0.2,0.15,0.15][i]||0.2;});
            const matrix=options.map((opt,idx)=>{const row={option:opt};criteria.forEach(c=>{row[c]=Math.min(5,Math.max(1,Math.round(3+(idx===0?2:-idx*0.5)+Math.random()*2)));});row.weighted_score=Math.round(criteria.reduce((sum,c)=>sum+(row[c]||3)*(weights[c]||0.2),0)*100)/100;return row;});
            matrix.sort((a,b)=>b.weighted_score-a.weighted_score);const winner=matrix[0];
            return safeJsonStringify({tool:'decision_matrix',decision_topic:topic,context,criteria:criteria.map(c=>({criterion:c,weight:weights[c]})),matrix,weighted_scores:matrix.map(m=>({option:m.option,score:m.weighted_score})),winner_recommendation:{option:winner.option,score:winner.weighted_score,reason:`综合评分最高(${winner.weighted_score}/5.00)，多维度表现均衡。建议进一步验证可行性。`},sensitivity_analysis:`权重变化：若最高权重维度下调20%，排名变化${options.length>2?'较小':'可能改变排序'}。关注得分接近选项的关键差异维度。`},2);
        }

        default:
            console.error('[Tool] Unknown tool:', routedName, '(original:', name, ')');
            return JSON.stringify({ error: 'Unknown tool', name: routedName });
    }
}



// ============ 可视化对比HTML生成函数 ============

// 生成任务对比HTML
function generateTaskCompareHtml(data) {
    const { type, date, before, after, changes } = data;

    let typeBadge = '';
    let typeTitle = '';

    if (type === 'delete') {
        typeBadge = '<span class="proposal-type-badge delete">删除</span>';
        typeTitle = '删除任务';
    } else if (type === 'update') {
        typeBadge = '<span class="proposal-type-badge update">修改</span>';
        typeTitle = '修改任务';
    } else {
        typeBadge = '<span class="proposal-type-badge create">新增</span>';
        typeTitle = '新增任务';
    }

    let html = `
        <div class="proposal-container">
            <div class="proposal-type-header">
                ${typeBadge}
                <span class="proposal-type-title">${typeTitle} - ${date}</span>
            </div>
            <div class="proposal-compare-view">
                <div class="compare-panel before">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        修改前
                    </div>
                    <div class="task-viz-item ${type === 'delete' ? 'removed' : ''}">
                        <div class="task-viz-checkbox ${before.completed ? 'checked' : ''}"></div>
                        <span class="task-viz-name">${before.name}</span>
                        <span class="task-viz-time">${before.estimated}分钟</span>
                    </div>
                </div>
                <div class="compare-panel after">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        ${type === 'delete' ? '删除后' : '修改后'}
                    </div>
                    ${after ? `
                        <div class="task-viz-item ${type === 'create' ? 'added' : (type === 'update' ? 'modified' : '')}">
                            <div class="task-viz-checkbox ${after.completed ? 'checked' : ''}"></div>
                            <span class="task-viz-name">${after.name}</span>
                            <span class="task-viz-time">${after.estimated}分钟</span>
                        </div>
                    ` : `
                        <div class="task-viz-item removed">
                            <div class="task-viz-checkbox"></div>
                            <span class="task-viz-name" style="color:var(--text-muted)">（已删除）</span>
                        </div>
                    `}
                </div>
            </div>
            ${changes && changes.length > 0 ? `
                <div style="padding: 12px 16px; border-top: 1px solid var(--border-color); font-size: 11px;">
                    <div style="color: var(--text-muted); margin-bottom: 8px;">变更详情：</div>
                    ${changes.map(c => `
                        <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted);">${c.field === 'name' ? '名称' : c.field === 'estimated' ? '用时' : '状态'}:</span>
                            <span class="diff-remove">${c.old}</span>
                            <span>→</span>
                            <span class="diff-add">${c.new}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            <div class="proposal-footer">
                <button class="proposal-footer-btn reject" onclick="window.rejectProposal()">取消</button>
                <button class="proposal-footer-btn approve" onclick="window.approveProposal()">确认</button>
            </div>
        </div>
    `;

    return html;
}

// 生成大任务对比HTML
function generateBigTaskCompareHtml(data) {
    const { type, before, after, changes } = data;

    let typeBadge = '';
    let typeTitle = '';

    if (type === 'delete') {
        typeBadge = '<span class="proposal-type-badge delete">删除</span>';
        typeTitle = '删除大任务';
    } else if (type === 'update') {
        typeBadge = '<span class="proposal-type-badge update">修改</span>';
        typeTitle = '修改大任务';
    } else {
        typeBadge = '<span class="proposal-type-badge create">新增</span>';
        typeTitle = '新增大任务';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDdlText = (ddl) => {
        if (!ddl) return '无DDL';
        const ddlDate = new Date(ddl);
        ddlDate.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((ddlDate - today) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) return `${ddl} (已过期${Math.abs(daysLeft)}天)`;
        if (daysLeft === 0) return `${ddl} (今天到期)`;
        return `${ddl} (还剩${daysLeft}天)`;
    };

    let html = `
        <div class="proposal-container">
            <div class="proposal-type-header">
                ${typeBadge}
                <span class="proposal-type-title">${typeTitle}</span>
            </div>
            <div class="proposal-compare-view">
                <div class="compare-panel before">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        修改前
                    </div>
                    <div class="big-task-viz ${type === 'delete' ? 'removed' : ''}">
                        <div class="big-task-viz-name">${before.name}</div>
                        <div class="big-task-viz-meta">
                            <span>${before.estimated}分钟</span>
                            <span>${getDdlText(before.ddl)}</span>
                        </div>
                        <div class="big-task-viz-progress">
                            <div class="big-task-viz-progress-bar" style="width: ${before.completed ? 100 : 0}%"></div>
                        </div>
                    </div>
                </div>
                <div class="compare-panel after">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        ${type === 'delete' ? '删除后' : '修改后'}
                    </div>
                    ${after ? `
                        <div class="big-task-viz ${type === 'create' ? 'added' : (type === 'update' ? 'modified' : '')}">
                            <div class="big-task-viz-name">${after.name}</div>
                            <div class="big-task-viz-meta">
                                <span>${after.estimated}分钟</span>
                                <span>${getDdlText(after.ddl)}</span>
                            </div>
                            <div class="big-task-viz-progress">
                                <div class="big-task-viz-progress-bar" style="width: ${after.completed ? 100 : 0}%"></div>
                            </div>
                        </div>
                    ` : `
                        <div class="big-task-viz removed">
                            <div class="big-task-viz-name" style="color:var(--text-muted)">（已删除）</div>
                        </div>
                    `}
                </div>
            </div>
            ${changes && changes.length > 0 ? `
                <div style="padding: 12px 16px; border-top: 1px solid var(--border-color); font-size: 11px;">
                    <div style="color: var(--text-muted); margin-bottom: 8px;">变更详情：</div>
                    ${changes.map(c => {
                        const fieldMap = {
                            'name': '名称',
                            'estimated': '预计用时',
                            'ddl': '截止日期'
                        };
                        return `
                            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                                <span style="color: var(--text-muted);">${fieldMap[c.field] || c.field}:</span>
                                <span class="diff-remove">${c.old}</span>
                                <span>→</span>
                                <span class="diff-add">${c.new}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
            <div class="proposal-footer">
                <button class="proposal-footer-btn reject" onclick="window.rejectProposal()">取消</button>
                <button class="proposal-footer-btn approve" onclick="window.approveProposal()">确认</button>
            </div>
        </div>
    `;

    return html;
}

// 生成时间安排对比HTML（用于时间段的增删改）
function generateTimeSlotCompareHtml(data) {
    const { type, date, before, after, changes } = data;

    let typeBadge = '';
    let typeTitle = '';

    if (type === 'delete') {
        typeBadge = '<span class="proposal-type-badge delete">删除</span>';
        typeTitle = '删除时间安排';
    } else if (type === 'update') {
        typeBadge = '<span class="proposal-type-badge update">修改</span>';
        typeTitle = '修改时间安排';
    } else {
        typeBadge = '<span class="proposal-type-badge create">新增</span>';
        typeTitle = '新增时间安排';
    }

    // 生成时间轴可视化
    const generateTimelineHtml = (slots, panelClass) => {
        if (!slots || slots.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: var(--text-muted);">暂无安排</div>';
        }

        let hoursHtml = '';
        for (let i = 6; i <= 23; i++) {
            hoursHtml += `<div class="timeline-hour">${i}:00</div>`;
        }

        let blocksHtml = '';
        slots.forEach(slot => {
            const [startStr, endStr] = slot.time.split('-');
            const [startH, startM] = startStr.split(':').map(Number);
            const [endH, endM] = endStr.split(':').map(Number);

            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            const totalMinutes = 18 * 60; // 6:00 到 24:00

            const left = ((startMinutes - 6 * 60) / totalMinutes) * 100;
            const width = ((endMinutes - startMinutes) / totalMinutes) * 100;

            blocksHtml += `
                <div class="timeline-block ${slot.removed ? 'removed' : ''} ${slot.added ? 'added' : ''}"
                     style="left: ${left}%; width: ${width}%; top: ${slots.indexOf(slot) * 28}px;">
                    ${slot.activity}
                </div>
            `;
        });

        return `
            <div class="timeline-viz">
                <div class="timeline-hours">${hoursHtml}</div>
                <div class="timeline-blocks">${blocksHtml}</div>
            </div>
        `;
    };

    let html = `
        <div class="proposal-container">
            <div class="proposal-type-header">
                ${typeBadge}
                <span class="proposal-type-title">${typeTitle} - ${date}</span>
            </div>
            <div class="proposal-compare-view">
                <div class="compare-panel before">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        修改前
                    </div>
                    ${generateTimelineHtml(before, 'before')}
                </div>
                <div class="compare-panel after">
                    <div class="compare-panel-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        ${type === 'delete' ? '删除后' : '修改后'}
                    </div>
                    ${generateTimelineHtml(after, 'after')}
                </div>
            </div>
            ${changes && changes.length > 0 ? `
                <div style="padding: 12px 16px; border-top: 1px solid var(--border-color); font-size: 11px;">
                    <div style="color: var(--text-muted); margin-bottom: 8px;">变更详情：</div>
                    ${changes.map(c => `
                        <div style="margin-bottom: 4px;">• ${c}</div>
                    `).join('')}
                </div>
            ` : ''}
            <div class="proposal-footer">
                <button class="proposal-footer-btn reject" onclick="window.rejectProposal()">取消</button>
                <button class="proposal-footer-btn approve" onclick="window.approveProposal()">确认</button>
            </div>
        </div>
    `;

    return html;
}

// 提取用户画像信息
function extractProfileInfo(content, currentProfile) {
    // 简单实现：实际可以更复杂
    const updated = { ...currentProfile };

    // 检测用户的回应风格
    if (content.includes('哈哈') || content.includes('😂') || content.includes('笑死')) {
        updated.communicationStyle = 'humorous';
    }

    return updated;
}

// 批准日程修改建议（统一处理所有类型的提案）
async function approveScheduleProposal(proposal) {
    const scheduleFile = pmPaths.getDataFilePath();

    try {
        const fileContent = await fs.promises.readFile(scheduleFile, 'utf8');
        const data = JSON.parse(fileContent);

        // 批量删除日程
        if (proposal.type === 'batch_delete_schedule') {
            const dates = proposal.dates;
            let deletedCount = 0;
            let deletedSlotsCount = 0;
            let deletedTasksCount = 0;

            for (const date of dates) {
                const schedule = data.schedules[date];
                if (schedule) {
                    deletedSlotsCount += schedule.timeSlots?.length || 0;
                    deletedTasksCount += schedule.tasks?.length || 0;
                    delete data.schedules[date];
                    deletedCount++;
                }
            }

            createBackup('data.json');
            await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');

            return {
                success: true,
                deletedCount: deletedCount,
                deletedSlotsCount: deletedSlotsCount,
                deletedTasksCount: deletedTasksCount
            };
        }

        // 根据提案类型处理
        if (proposal.type === 'update_task') {
            // 更新任务
            const date = proposal.date;
            const oldTaskName = proposal.oldTaskName;
            const newTaskName = proposal.newTaskName;
            const newEstimatedMinutes = proposal.newEstimatedMinutes;

            if (!data.schedules[date] || !data.schedules[date].tasks) {
                return { success: false, error: '任务不存在' };
            }

            const task = data.schedules[date].tasks.find(t => t.name === oldTaskName);
            if (!task) {
                return { success: false, error: '任务不存在' };
            }

            task.name = newTaskName;
            task.estimated = newEstimatedMinutes.toString();

            createBackup('data.json');
            await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');
            return { success: true };
        }

        if (proposal.type === 'delete_task') {
            // 删除任务
            const date = proposal.date;
            const taskName = proposal.taskName;

            if (!data.schedules[date] || !data.schedules[date].tasks) {
                return { success: false, error: '任务不存在' };
            }

            const initialLength = data.schedules[date].tasks.length;
            data.schedules[date].tasks = data.schedules[date].tasks.filter(t => t.name !== taskName);

            if (data.schedules[date].tasks.length === initialLength) {
                return { success: false, error: '任务不存在' };
            }

            createBackup('data.json');
            await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');
            return { success: true };
        }

        if (proposal.type === 'update_big_task') {
            // 更新大任务
            const oldTaskName = proposal.oldTaskName;
            const newTaskName = proposal.newTaskName;
            const newEstimatedMinutes = proposal.newEstimatedMinutes;
            const newDdl = proposal.newDdl;

            if (!data.bigTasks) {
                return { success: false, error: '大任务不存在' };
            }

            const task = data.bigTasks.find(t => t.name === oldTaskName);
            if (!task) {
                return { success: false, error: '大任务不存在' };
            }

            task.name = newTaskName;
            task.estimated = newEstimatedMinutes;
            task.ddl = newDdl;

            createBackup('data.json');
            await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');
            return { success: true };
        }

        if (proposal.type === 'delete_big_task') {
            // 删除大任务
            const taskName = proposal.taskName;

            if (!data.bigTasks) {
                return { success: false, error: '大任务不存在' };
            }

            const initialLength = data.bigTasks.length;
            data.bigTasks = data.bigTasks.filter(t => t.name !== taskName);

            if (data.bigTasks.length === initialLength) {
                return { success: false, error: '大任务不存在' };
            }

            createBackup('data.json');
            await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');
            return { success: true };
        }

        // 原有的时间安排提案处理
        const date = proposal.date;
        const existingSchedule = data.schedules[date] || {
            title: '',
            highlights: '',
            milestone: '',
            timeSlots: []
        };

        // 根据operation类型执行不同的操作
        const operation = proposal.operation || 'modify';

        if (operation === 'delete_slots' && proposal.timeSlots && proposal.timeSlots.length > 0) {
            // 删除指定的时间段
            const slotsToDelete = proposal.timeSlots;
            existingSchedule.timeSlots = (existingSchedule.timeSlots || []).filter(slot => {
                // 保留不在删除列表中的时间段
                return !slotsToDelete.some(deleteSlot => {
                    // 匹配活动名称或时间段
                    return slot.activity === deleteSlot ||
                           slot.time === deleteSlot ||
                           slot.activity.includes(deleteSlot);
                });
            });
            existingSchedule.highlights = `已删除: ${slotsToDelete.join(', ')}`;
        } else if (operation === 'modify_title') {
            // 修改标题
            existingSchedule.title = proposal.title;
        } else if (operation === 'add_slot' && proposal.newSlotDetails) {
            // 添加新时间段
            const newSlot = proposal.newSlotDetails;
            existingSchedule.timeSlots = existingSchedule.timeSlots || [];
            existingSchedule.timeSlots.push({
                time: newSlot.time,
                activity: newSlot.activity,
                detail: newSlot.detail || '',
                icon: newSlot.icon || '—'
            });
            // 按时间排序
            existingSchedule.timeSlots.sort((a, b) => {
                const timeA = a.time.split('-')[0];
                const timeB = b.time.split('-')[0];
                return timeA.localeCompare(timeB);
            });
            existingSchedule.highlights = `已添加: ${newSlot.activity}`;
        } else if (operation === 'modify_slot' && proposal.timeSlots && proposal.timeSlots.length > 0 && proposal.newSlotDetails) {
            // 修改现有时间段
            const targetSlot = proposal.timeSlots[0]; // 要修改的时间段标识
            const newSlot = proposal.newSlotDetails;
            existingSchedule.timeSlots = (existingSchedule.timeSlots || []).map(slot => {
                // 匹配活动名称或时间段
                if (slot.activity === targetSlot || slot.time === targetSlot || slot.activity.includes(targetSlot)) {
                    return {
                        time: newSlot.time || slot.time,
                        activity: newSlot.activity || slot.activity,
                        detail: newSlot.detail || slot.detail,
                        icon: newSlot.icon || slot.icon
                    };
                }
                return slot;
            });
            existingSchedule.highlights = `已修改: ${targetSlot} -> ${newSlot.activity}`;
        } else {
            // 默认修改
            if (proposal.title) {
                existingSchedule.title = proposal.title;
            }

            if (proposal.changes && proposal.changes.length > 0) {
                existingSchedule.highlights = proposal.changes.join('; ');
            }
        }

        data.schedules[date] = existingSchedule;

        // 写入前先创建备份
        createBackup('data.json');
        await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');

        return { success: true };
    } catch (error) {
        console.error('Approve proposal error:', error);
        return { success: false, error: error.message };
    }
}

// ============ 添加时间安排功能 ============

// 添加单个时间段到指定日期
async function addTimeSlot(data) {
    const { date, time, activity, detail, icon, title, highlights } = data;
    const scheduleFile = pmPaths.getDataFilePath();

    try {
        const fileContent = await fs.promises.readFile(scheduleFile, 'utf8');
        const scheduleData = JSON.parse(fileContent);

        // 初始化该日期的日程
        if (!scheduleData.schedules[date]) {
            scheduleData.schedules[date] = {
                title: title || '',
                highlights: highlights || '',
                milestone: '',
                timeSlots: []
            };
        }

        // 验证时间格式
        const timeRegex = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
        if (!timeRegex.test(time)) {
            return { success: false, error: '时间格式错误，应为 HH:MM-HH:MM' };
        }

        // 检查时间冲突
        const [startHour, startMin] = time.split('-')[0].split(':').map(Number);
        const [endHour, endMin] = time.split('-')[1].split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (startMinutes >= endMinutes) {
            return { success: false, error: '开始时间必须早于结束时间' };
        }

        // 检查是否与现有时间段冲突
        for (const slot of scheduleData.schedules[date].timeSlots || []) {
            const [sStart, sEnd] = slot.time.split('-').map(t => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            });
            if (!(endMinutes <= sStart || startMinutes >= sEnd)) {
                return { success: false, error: `时间段与现有安排冲突：${slot.time} ${slot.activity}` };
            }
        }

        // 添加新时间段
        const newSlot = {
            time: time,
            activity: activity || '未命名活动',
            detail: detail || '',
            icon: icon || '—'
        };

        scheduleData.schedules[date].timeSlots.push(newSlot);

        // 按时间排序
        scheduleData.schedules[date].timeSlots.sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        // 更新标题和高亮
        if (title) scheduleData.schedules[date].title = title;
        if (highlights) scheduleData.schedules[date].highlights = highlights;

        // 保存数据
        createBackup('data.json');
        await fs.promises.writeFile(scheduleFile, JSON.stringify(scheduleData, null, 2), 'utf8');

        return {
            success: true,
            message: `已添加 ${time} - ${activity}`,
            slot: newSlot
        };
    } catch (error) {
        console.error('Add time slot error:', error);
        return { success: false, error: error.message };
    }
}

// 周期性添加时间段
async function addRecurringTimeSlot(data) {
    const {
        startDate,      // 开始日期 YYYY-MM-DD
        endDate,        // 结束日期 YYYY-MM-DD (可选)
        repeatPattern,  // 重复模式: daily, weekly, weekdays
        weekdays,       // 当weekly时，指定星期几 [0-6, 0=周日]
        time,           // 时间 HH:MM-HH:MM
        activity,       // 活动名称
        detail,         // 详情
        icon,           // 图标
        title,          // 日期标题
        highlights      // 高亮
    } = data;

    const scheduleFile = pmPaths.getDataFilePath();

    try {
        const fileContent = await fs.promises.readFile(scheduleFile, 'utf8');
        const scheduleData = JSON.parse(fileContent);

        // 解析开始和结束日期
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : null;

        // 生成要添加的日期列表
        const datesToAdd = [];

        if (repeatPattern === 'daily') {
            // 每天添加
            let current = new Date(start);
            const maxDate = end || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000); // 默认30天
            const maxDays = end ? Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1 : 30;

            for (let i = 0; i < maxDays; i++) {
                if (end && current > end) break;
                datesToAdd.push(current.toISOString().split('T')[0]);
                current.setDate(current.getDate() + 1);
            }
        } else if (repeatPattern === 'weekly') {
            // 每周指定星期几添加
            const targetWeekdays = weekdays || []; // [0-6]
            let current = new Date(start);

            // 最多扫描8周
            for (let week = 0; week < 8; week++) {
                for (let day = 0; day < 7; day++) {
                    if (end && current > end) break;

                    const dayOfWeek = current.getDay();
                    if (targetWeekdays.includes(dayOfWeek)) {
                        datesToAdd.push(current.toISOString().split('T')[0]);
                    }
                    current.setDate(current.getDate() + 1);
                }
            }
        } else if (repeatPattern === 'weekdays') {
            // 仅工作日 (周一到周五)
            let current = new Date(start);
            const maxDays = end ? Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1 : 30;

            for (let i = 0; i < maxDays; i++) {
                if (end && current > end) break;
                const dayOfWeek = current.getDay();
                if (dayOfWeek >= 1 && dayOfWeek <= 5) { // 周一到周五
                    datesToAdd.push(current.toISOString().split('T')[0]);
                }
                current.setDate(current.getDate() + 1);
            }
        }

        // 验证时间格式
        const timeRegex = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
        if (!timeRegex.test(time)) {
            return { success: false, error: '时间格式错误，应为 HH:MM-HH:MM' };
        }

        // 添加到所有指定日期
        const results = [];
        let successCount = 0;
        let skippedCount = 0;
        const conflicts = [];

        for (const date of datesToAdd) {
            if (!scheduleData.schedules[date]) {
                scheduleData.schedules[date] = {
                    title: title || '',
                    highlights: highlights || '',
                    milestone: '',
                    timeSlots: []
                };
            }

            // 检查时间冲突
            const [startHour, startMin] = time.split('-')[0].split(':').map(Number);
            const [endHour, endMin] = time.split('-')[1].split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            let hasConflict = false;
            for (const slot of scheduleData.schedules[date].timeSlots || []) {
                const [sStart, sEnd] = slot.time.split('-').map(t => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                });
                if (!(endMinutes <= sStart || startMinutes >= sEnd)) {
                    hasConflict = true;
                    conflicts.push({ date, conflict: slot });
                    break;
                }
            }

            if (hasConflict) {
                skippedCount++;
                continue;
            }

            // 添加新时间段
            const newSlot = {
                time: time,
                activity: activity || '未命名活动',
                detail: detail || '',
                icon: icon || '—'
            };

            scheduleData.schedules[date].timeSlots.push(newSlot);

            // 按时间排序
            scheduleData.schedules[date].timeSlots.sort((a, b) => {
                return a.time.localeCompare(b.time);
            });

            // 更新标题和高亮
            if (title) scheduleData.schedules[date].title = title;
            if (highlights) scheduleData.schedules[date].highlights = highlights;

            successCount++;
            results.push({ date, added: true });
        }

        // 保存数据
        createBackup('data.json');
        await fs.promises.writeFile(scheduleFile, JSON.stringify(scheduleData, null, 2), 'utf8');

        return {
            success: true,
            message: `周期性添加完成：成功添加 ${successCount} 个，跳过 ${skippedCount} 个`,
            successCount,
            skippedCount,
            conflicts: conflicts.slice(0, 5), // 最多返回5个冲突
            results
        };
    } catch (error) {
        console.error('Add recurring time slot error:', error);
        return { success: false, error: error.message };
    }
}

// 批量添加多个时间段到指定日期
async function addMultipleTimeSlots(data) {
    const { date, timeSlots, title, highlights } = data;
    const scheduleFile = pmPaths.getDataFilePath();

    try {
        const fileContent = await fs.promises.readFile(scheduleFile, 'utf8');
        const scheduleData = JSON.parse(fileContent);

        // 初始化该日期的日程
        if (!scheduleData.schedules[date]) {
            scheduleData.schedules[date] = {
                title: title || '',
                highlights: highlights || '',
                milestone: '',
                timeSlots: []
            };
        }

        // 验证时间格式并添加
        const timeRegex = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
        const addedSlots = [];
        const conflicts = [];

        for (const slotData of timeSlots) {
            const { time, activity, detail, icon } = slotData;

            if (!timeRegex.test(time)) {
                conflicts.push({ slot: slotData, error: '时间格式错误' });
                continue;
            }

            // 检查时间冲突
            const [startHour, startMin] = time.split('-')[0].split(':').map(Number);
            const [endHour, endMin] = time.split('-')[1].split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            if (startMinutes >= endMinutes) {
                conflicts.push({ slot: slotData, error: '开始时间必须早于结束时间' });
                continue;
            }

            let hasConflict = false;
            for (const existingSlot of scheduleData.schedules[date].timeSlots || []) {
                const [sStart, sEnd] = existingSlot.time.split('-').map(t => {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                });
                if (!(endMinutes <= sStart || startMinutes >= sEnd)) {
                    hasConflict = true;
                    conflicts.push({ slot: slotData, error: `与 ${existingSlot.time} ${existingSlot.activity} 冲突` });
                    break;
                }
            }

            if (hasConflict) continue;

            // 添加新时间段
            const newSlot = {
                time: time,
                activity: activity || '未命名活动',
                detail: detail || '',
                icon: icon || '—'
            };

            scheduleData.schedules[date].timeSlots.push(newSlot);
            addedSlots.push(newSlot);
        }

        // 按时间排序
        scheduleData.schedules[date].timeSlots.sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        // 更新标题和高亮
        if (title) scheduleData.schedules[date].title = title;
        if (highlights) scheduleData.schedules[date].highlights = highlights;

        // 保存数据
        createBackup('data.json');
        await fs.promises.writeFile(scheduleFile, JSON.stringify(scheduleData, null, 2), 'utf8');

        return {
            success: true,
            message: `已添加 ${addedSlots.length} 个时间段`,
            addedCount: addedSlots.length,
            conflicts: conflicts
        };
    } catch (error) {
        console.error('Add multiple time slots error:', error);
        return { success: false, error: error.message };
    }
}

// ============ End AI Agent Functions ============

// ============ 备份功能 ============

function getBackupDir() {
    const backupDir = pmPaths.getBackupDir();
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}

function createBackup(filename) {
    try {
        const sourcePath = pmPaths.getDataPath(filename);
        if (!fs.existsSync(sourcePath)) {
            return;
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

// ============ 文件服务 ============

function serveFile(req, res) {
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    if (pathname === '/') {
        pathname = '/index.html';
    }

    // WordMosaic sub-app: serve from ../WordMosaic/
    if (pathname.startsWith('/wordmosaic')) {
        const wordMosaicDir = path.join(__dirname, '..', 'WordMosaic');
        const relativePath = pathname.replace('/wordmosaic', '') || '/index.html';
        const filePath = path.join(wordMosaicDir, relativePath);

        if (!filePath.startsWith(wordMosaicDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('禁止访问');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('文件未找到: ' + pathname);
                return;
            }
            res.writeHead(200, { 'Content-Type': getMimeType(ext) });
            res.end(data);
        });
        return;
    }

    const filePath = path.join(__dirname, pathname);

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('禁止访问');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('文件未找到: ' + pathname);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
                res.end('服务器错误: ' + err.message);
            }
            return;
        }
        
        res.writeHead(200, { 
            'Content-Type': getMimeType(ext),
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname;

    if (req.method === 'GET') {
        serveFile(req, res);
    } else if (req.method === 'POST' && pathname === '/api/schedule') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const date = data.date;
                if (!date) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '缺少日期' }));
                    return;
                }
                const scheduleFile = pmPaths.getDataFilePath();
                fs.readFile(scheduleFile, 'utf8', (err, fileContent) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: '读取文件失败' }));
                        return;
                    }
                    const json = JSON.parse(fileContent);
                    json.schedules[date] = data.schedule;
                    // 写入前先创建备份
                    createBackup('data.json');
                    fs.writeFile(scheduleFile, JSON.stringify(json, null, 2), 'utf8', (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: '写入文件失败' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    });
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '无效的JSON' }));
            }
        });
    } else if (req.method === 'PUT' && pathname.startsWith('/api/schedule/')) {
        const date = pathname.split('/').pop();
        console.log('收到PUT请求，日期:', date);
        console.log('完整路径:', pathname);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const scheduleFile = pmPaths.getDataFilePath();
                fs.readFile(scheduleFile, 'utf8', (err, fileContent) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: '读取文件失败' }));
                        return;
                    }
                    const json = JSON.parse(fileContent);
                    json.schedules[date] = data;
                    // 写入前先创建备份
                    createBackup('data.json');
                    fs.writeFile(scheduleFile, JSON.stringify(json, null, 2), 'utf8', (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: '写入文件失败' }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    });
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '无效的JSON' }));
            }
        });
    } else if (req.method === 'DELETE' && pathname.startsWith('/api/schedule/')) {
        const date = pathname.split('/').pop();
        const scheduleFile = pmPaths.getDataFilePath();
        fs.readFile(scheduleFile, 'utf8', (err, fileContent) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '读取文件失败' }));
                return;
            }
            const json = JSON.parse(fileContent);
            delete json.schedules[date];
            // 写入前先创建备份
            createBackup('data.json');
            fs.writeFile(scheduleFile, JSON.stringify(json, null, 2), 'utf8', (err) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '写入文件失败' }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        });
    } else if (req.method === 'GET' && pathname === '/api/agent-history') {
        // Get agent conversation history
        const agentLogFile = pmPaths.getAgentLogPath();
        fs.readFile(agentLogFile, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ userProfile: {}, conversations: [], lastUpdate: '' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
    } else if (req.method === 'POST' && pathname === '/api/agent-save') {
        // Save agent conversation history
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const agentLogFile = pmPaths.getAgentLogPath();
                const saveData = {
                    userProfile: data.profile || {},
                    conversations: data.conversations || [],
                    lastUpdate: new Date().toISOString()
                };
                fs.writeFile(agentLogFile, JSON.stringify(saveData, null, 2), 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: '保存失败' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '无效的JSON' }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/agent-chat') {
        // Handle agent chat - 支持流式输出
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const stream = data.stream;

                if (stream) {
                    // 流式输出 (SSE)
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    // 调用handleAgentChat并处理流式响应
                    const result = await handleAgentChat(data);

                    // 发送完整响应
                    res.write(`data: ${JSON.stringify(result)}\n\n`);
                    res.end();
                } else {
                    // 普通模式
                    const response = await handleAgentChat(data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response));
                }
            } catch (e) {
                console.error('Agent chat error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/deep-planning-chat') {
        // Handle deep planning chat - 深度规划模式
        console.log('[Deep Planning] API endpoint called');
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                console.log('[Deep Planning] Request parsed, checking stream mode...');

                const stream = data.stream;

                if (stream) {
                    console.log('[Deep Planning] Using SSE streaming mode');
                    // 流式输出 (SSE)
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    try {
                        // 调用handleDeepPlanningChat并处理流式响应
                        const result = await handleDeepPlanningChat(data);
                        console.log('[Deep Planning] Streaming response ready');

                        // 发送完整响应
                        res.write(`data: ${JSON.stringify(result)}\n\n`);
                        res.end();
                    } catch (error) {
                        console.error('[Deep Planning] Streaming error:', error);
                        const errorResponse = {
                            response: {
                                content: '深度规划处理出错，请稍后重试。',
                                proposal: null
                            },
                            shouldRefresh: false
                        };
                        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
                        res.end();
                    }
                } else {
                    console.log('[Deep Planning] Using normal mode');
                    // 普通模式
                    const response = await handleDeepPlanningChat(data);
                    console.log('[Deep Planning] Response sent successfully');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response));
                }
            } catch (e) {
                console.error('[Deep Planning] API endpoint error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: e.message,
                    response: {
                        content: '服务器内部错误，请稍后重试。',
                        proposal: null
                    },
                    shouldRefresh: false
                }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/deep-planning-profile') {
        console.log('[Deep Planning Profile] API endpoint called');
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const conversation = data.conversation || '';

                const profileExtract = { longTermGoals: [], values: [], strengths: [], constraints: [] };

                const goalPatterns = [
                    /(?:想|希望|计划|立志|目标|愿景)[\s\S]{0,50}?成为?([\u4e00-\u9fa5，。、！？；：""''（）【】\w]{2,30})/g,
                    /(?:未来[\d\-到至年]+|[\d]+年内?|长期|长远)(?:[\s\S]{0,20}?(?:想|希望|要|打算|计划))([\u4e00-\u9fa5，。、！？；：""''（）【】\w]{2,30})/g
                ];
                const valuePatterns = [
                    /(?:重视|看重|在乎|坚持|认为.*重要|珍视|注重|相信)([\u4e00-\u9fa5，。、！？；：""''（）【】\w]{2,25})/g
                ];
                const strengthPatterns = [
                    /(?:擅长|强项|优势|能力|经验丰富|熟练|精通|拿手)([\u4e00-\u9fa5，。、！？；：""''（）【】\w]{2,25})/g
                ];
                const constraintPatterns = [
                    /(?:限制|困难|缺乏|没有|不足|担心|顾虑|问题|挑战|障碍|缺|不够|无法)([\u4e00-\u9fa5，。、！？；：""''（）【】\w]{2,25})/g
                ];

                const seenGoals = new Set(), seenValues = new Set(), seenStrengths = new Set(), seenConstraints = new Set();

                for (const pat of goalPatterns) { let m; while ((m = pat.exec(conversation)) !== null) { const g = m[1]?.trim(); if (g && g.length > 3 && !seenGoals.has(g)) { seenGoals.add(g); profileExtract.longTermGoals.push({ content: g, confidence: 0.85, source: 'deep_planning' }); } } }
                for (const pat of valuePatterns) { let m; while ((m = pat.exec(conversation)) !== null) { const v = m[1]?.trim(); if (v && v.length > 1 && !seenValues.has(v)) { seenValues.add(v); profileExtract.values.push({ content: v, confidence: 0.75, source: 'deep_planning' }); } } }
                for (const pat of strengthPatterns) { let m; while ((m = pat.exec(conversation)) !== null) { const s = m[1]?.trim(); if (s && s.length > 1 && !seenStrengths.has(s)) { seenStrengths.add(s); profileExtract.strengths.push({ content: s, confidence: 0.8, source: 'deep_planning' }); } } }
                for (const pat of constraintPatterns) { let m; while ((m = pat.exec(conversation)) !== null) { const c = m[1]?.trim(); if (c && c.length > 1 && !seenConstraints.has(c)) { seenConstraints.add(c); profileExtract.constraints.push({ content: c, confidence: 0.78, source: 'deep_planning' }); } } }

                console.log(`[Deep Planning Profile] Extracted - Goals:${profileExtract.longTermGoals.length}, Values:${profileExtract.values.length}, Strengths:${profileExtract.strengths.length}, Constraints:${profileExtract.constraints.length}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, profileExtract }));
            } catch (e) {
                console.error('[Deep Planning Profile] Error:', e);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, profileExtract: { longTermGoals: [], values: [], strengths: [], constraints: [] } }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/agent-approve') {
        // Approve schedule proposal
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await approveScheduleProposal(data.proposal);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                console.error('Approve proposal error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/add-timeslot') {
        // 添加单个时间段
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await addTimeSlot(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                console.error('Add time slot error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/add-recurring') {
        // 周期性添加时间段
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await addRecurringTimeSlot(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                console.error('Add recurring time slot error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/add-multiple') {
        // 批量添加多个时间段到指定日期
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await addMultipleTimeSlots(data);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                console.error('Add multiple time slots error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (req.method === 'POST' && pathname === '/api/save-schedule') {
        // Save entire schedule data (used by frontend for direct editing)
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const scheduleFile = pmPaths.getDataFilePath();

                // Create backup before writing
                createBackup('data.json');
                await fs.promises.writeFile(scheduleFile, JSON.stringify(data, null, 2), 'utf8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('Save schedule error:', e);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('方法不允许');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`服务器运行在 http://${HOST}:${PORT}`);
    console.log('正在打开浏览器...');
    
    const url = `http://${HOST}:${PORT}`;
    
    const platforms = {
        win32: 'start',
        darwin: 'open',
        linux: 'xdg-open'
    };
    
    const opener = platforms[process.platform];
    if (opener) {
        exec(`${opener} ${url}`, (err) => {
            if (err) {
                console.log('无法自动打开浏览器，请手动访问:', url);
            }
        });
    } else {
        console.log('请在浏览器中访问:', url);
    }
    
    console.log('\n按 Ctrl+C 停止服务器');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用，请尝试其他端口`);
        console.error('您可以修改 server.js 中的 PORT 变量');
    } else {
        console.error('服务器错误:', err.message);
    }
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});