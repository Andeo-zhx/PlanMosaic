// Mosa - AI 词典助手
// 支持流式响应、多轮对话、逐条词条提取

class MosaAgent {
    constructor() {
        this.apiKey = null;
        this.apiEndpoint = 'https://api.deepseek.com/chat/completions';
        this.isConnected = false;
        this.storageKey = 'vocab_deepseek_api_key';
        this.conversationHistory = [];
        this.maxHistory = 20;
        this.currentAbortController = null;
    }

    async init() {
        const savedKey = localStorage.getItem(this.storageKey);
        if (savedKey) {
            this.apiKey = savedKey;
            this.isConnected = true;
        }
        return this.isConnected;
    }

    saveApiKey(key) {
        this.apiKey = key;
        this.isConnected = true;
        try {
            localStorage.setItem(this.storageKey, key);
            return true;
        } catch (e) {
            console.error('保存 API Key 失败:', e);
            return false;
        }
    }

    clearApiKey() {
        this.apiKey = null;
        this.isConnected = false;
        localStorage.removeItem(this.storageKey);
    }

    getApiKey() {
        if (!this.apiKey) {
            this.apiKey = localStorage.getItem(this.storageKey);
            if (this.apiKey) this.isConnected = true;
        }
        return this.apiKey;
    }

    isConfigured() {
        return this.isConnected && !!this.apiKey;
    }

    abort() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }

    clearHistory() {
        this.conversationHistory = [];
    }

    async testConnection() {
        if (!this.apiKey) return { success: false, error: 'API Key 未设置' };
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5
                })
            });
            if (response.ok) return { success: true };
            const errorData = await response.json().catch(() => ({}));
            return { success: false, error: errorData.error?.message || `连接失败: ${response.status}` };
        } catch (error) {
            return { success: false, error: `网络错误: ${error.message}` };
        }
    }

    // 流式聊天 - 逐token返回
    async *streamChat(userMessage, fileContent = null) {
        if (!this.isConfigured()) {
            yield { type: 'error', content: '请先配置 Deepseek API Key' };
            return;
        }

        this.abort();
        this.currentAbortController = new AbortController();

        const intent = this.detectIntent(userMessage, !!fileContent);

        if (intent === 'create_vocab') {
            yield* this.streamCreateVocabulary(userMessage, fileContent);
        } else {
            yield* this.streamGeneralChat(userMessage, fileContent);
        }
    }

    // 意图检测
    detectIntent(message, hasFile) {
        const keywords = ['生成', '创建', '制作', '帮我', '词汇表', '词典', '单词表',
            '词汇', '单词', '整理', '收集', '列出', '提取', '生成词书'];
        let score = 0;
        keywords.forEach(k => { if (message.includes(k)) score++; });

        const patterns = [/关于.+的/, /.+领域的/, /.+相关/,
            /托福|雅思|GRE|四六级|考研|医学|法律|计算机|金融|商务/];
        patterns.forEach(p => { if (p.test(message)) score++; });

        // 有文件上传时也倾向创建词汇
        if (hasFile && score >= 1) return 'create_vocab';
        if (score >= 2) return 'create_vocab';
        return 'chat';
    }

    // 流式生成词汇 - 逐条处理
    async *streamCreateVocabulary(userMessage, fileContent) {
        const systemPrompt = `你是 Mosa，一个专业的英语词汇提取与词典生成助手。

核心规则：
1. 你必须逐条提取词汇，每条词汇严格使用以下 JSON 行格式输出，不要一次性输出所有词汇：
{"word":"english","phonetic":"/phonetic/","cn":"中文释义","definition":"English definition","group":"A"}

2. group 字段为单词首字母大写
3. phonetic 使用国际音标，用 /.../ 包围
4. 每条词条之间用换行分隔，不要输出任何其他格式的文本
5. 如果用户提供了文件或文本，从中提取核心学术/专业词汇
6. 每个词条的各字段都必须填写完整
7. 输出每个词条时请仔细思考，确保音标准确、释义专业
8. definition 用简洁的英文解释

处理流程：
- 先简短分析需求（1-2句话）
- 然后逐条输出词条的 JSON 行
- 最后输出一个汇总行：{"__summary__":"已提取 N 个词条"}`;

        const userContent = fileContent
            ? `用户需求：${userMessage}\n\n文件内容：\n${fileContent.substring(0, 8000)}`
            : userMessage;

        this.conversationHistory.push({ role: 'user', content: userContent });
        // 保留系统提示+最近对话
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-this.maxHistory)
        ];

        let fullResponse = '';

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages,
                    stream: true,
                    temperature: 0.3
                }),
                signal: this.currentAbortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                yield { type: 'error', content: errorData.error?.message || `API 调用失败: ${response.status}` };
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let introDone = false;
            const vocabulary = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const token = parsed.choices?.[0]?.delta?.content;
                        if (!token) continue;
                        fullResponse += token;

                        // 流式输出文本 token
                        yield { type: 'token', content: token };

                        // 尝试解析完整行
                        const lines_so_far = fullResponse.split('\n');
                        for (const line of lines_so_far) {
                            const stripped = line.trim();
                            if (!stripped) continue;

                            // 检查是否是词条 JSON 行
                            if (stripped.startsWith('{') && stripped.endsWith('}')) {
                                try {
                                    const item = JSON.parse(stripped);

                                    // 汇总行
                                    if (item.__summary__) {
                                        yield { type: 'summary', content: item.__summary__ };
                                        continue;
                                    }

                                    // 验证词条字段
                                    if (item.word && item.cn && item.phonetic) {
                                        const word = {
                                            word: item.word.trim(),
                                            phonetic: item.phonetic.trim(),
                                            cn: item.cn.trim(),
                                            definition: (item.definition || '').trim(),
                                            group: (item.group || item.word.trim().charAt(0).toUpperCase()).toUpperCase().charAt(0)
                                        };
                                        if (word.word && word.cn) {
                                            vocabulary.push(word);
                                            yield { type: 'word', word };
                                        }
                                    }
                                } catch (e) {
                                    // 不是 JSON，当作普通文本
                                }
                            }
                        }
                    } catch (e) {
                        // 解析 SSE 错误，跳过
                    }
                }
            }

            // 如果没有提取到逐条词条，尝试从完整回复中解析
            if (vocabulary.length === 0 && fullResponse) {
                const parsed = this.parseVocabularyFromText(fullResponse);
                if (parsed.length > 0) {
                    for (const word of parsed) {
                        yield { type: 'word', word };
                    }
                }
            }

            // 保存助手回复到历史
            this.conversationHistory.push({ role: 'assistant', content: fullResponse });

            yield { type: 'done', vocabulary };

        } catch (error) {
            if (error.name === 'AbortError') {
                yield { type: 'aborted' };
            } else {
                yield { type: 'error', content: `请求失败: ${error.message}` };
            }
        }
    }

    // 流式通用聊天
    async *streamGeneralChat(userMessage, fileContent) {
        const systemPrompt = `你是 Mosa，一个友好且专业的词汇学习助手。你可以：
1. 创建个性化词典 - 当用户想要创建词典时，引导他们描述主题或上传文件
2. 解答词汇问题 - 解释单词含义、用法、词源、搭配
3. 提供学习建议 - 词汇记忆技巧和学习方法
4. 日常对话 - 友好地回答各类问题

回复要简洁友好，使用中文。如果用户想要创建词典，告诉他们可以描述主题或上传文件。`;

        const userContent = fileContent
            ? `用户上传了文件「${fileContent.name || '未知文件'}」，内容如下：\n${fileContent.substring(0, 5000)}\n\n用户消息：${userMessage}`
            : userMessage;

        this.conversationHistory.push({ role: 'user', content: userContent });
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-this.maxHistory)
        ];

        let fullResponse = '';

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages,
                    stream: true,
                    temperature: 0.7
                }),
                signal: this.currentAbortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                yield { type: 'error', content: errorData.error?.message || `API 调用失败: ${response.status}` };
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const token = parsed.choices?.[0]?.delta?.content;
                        if (token) {
                            fullResponse += token;
                            yield { type: 'token', content: token };
                        }
                    } catch (e) {
                        // skip
                    }
                }
            }

            this.conversationHistory.push({ role: 'assistant', content: fullResponse });
            yield { type: 'done', vocabulary: [] };

        } catch (error) {
            if (error.name === 'AbortError') {
                yield { type: 'aborted' };
            } else {
                yield { type: 'error', content: `请求失败: ${error.message}` };
            }
        }
    }

    // 从文本中解析词汇（备用方案）
    parseVocabularyFromText(content) {
        const vocabulary = [];
        // 尝试匹配 JSON 数组
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                const arr = JSON.parse(jsonMatch[0]);
                if (Array.isArray(arr)) {
                    for (const item of arr) {
                        if (item.word && item.cn) {
                            vocabulary.push({
                                word: item.word.trim(),
                                phonetic: (item.phonetic || '').trim(),
                                cn: item.cn.trim(),
                                definition: (item.definition || '').trim(),
                                group: (item.group || item.word.trim().charAt(0)).toUpperCase().charAt(0)
                            });
                        }
                    }
                    return vocabulary;
                }
            } catch (e) { }
        }

        // 尝试逐行解析 JSON 对象
        const lines = content.split('\n');
        for (const line of lines) {
            const stripped = line.trim();
            if (stripped.startsWith('{') && stripped.endsWith('}')) {
                try {
                    const item = JSON.parse(stripped);
                    if (item.word && item.cn) {
                        vocabulary.push({
                            word: item.word.trim(),
                            phonetic: (item.phonetic || '').trim(),
                            cn: item.cn.trim(),
                            definition: (item.definition || '').trim(),
                            group: (item.group || item.word.trim().charAt(0)).toUpperCase().charAt(0)
                        });
                    }
                } catch (e) { }
            }
        }

        return vocabulary;
    }

    // 词典管理
    generateBookId() {
        return `mosa_${Date.now()}`;
    }

    saveAgentBook(bookId, name, vocabulary) {
        try {
            const agentBooks = JSON.parse(localStorage.getItem('vocab_agent_books') || '{}');
            agentBooks[bookId] = {
                id: bookId,
                name,
                vocabulary,
                createdAt: new Date().toISOString(),
                groupType: 'letter'
            };
            localStorage.setItem('vocab_agent_books', JSON.stringify(agentBooks));
            return true;
        } catch (e) {
            console.error('保存词典失败:', e);
            return false;
        }
    }

    loadAgentBooks() {
        try {
            return JSON.parse(localStorage.getItem('vocab_agent_books') || '{}');
        } catch (e) {
            return {};
        }
    }

    deleteAgentBook(bookId) {
        try {
            const agentBooks = this.loadAgentBooks();
            if (agentBooks[bookId]) {
                delete agentBooks[bookId];
                localStorage.setItem('vocab_agent_books', JSON.stringify(agentBooks));
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
}

const agentManager = new MosaAgent();
