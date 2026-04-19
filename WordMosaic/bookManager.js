// 词书管理器 - 从 Books/ 目录加载 JSON 词书

class BookManager {
    constructor() {
        this.books = {};
        this.currentBookId = 'medical';
        this.loadPromise = null;
    }

    // 初始化 - 从 Books/*.json 加载所有词书
    async init() {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            console.log('BookManager: 开始初始化...');

            const bookFiles = [
                { id: 'medical', name: '新医科学术英语', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`, color: '#2563EB' },
                { id: 'college1', name: '大学英语 Book1', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`, color: '#22C55E' },
                { id: 'college2', name: '大学英语 Book2', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`, color: '#F59E0B' },
                { id: 'college3', name: '大学英语 Book3', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`, color: '#8B5CF6' }
            ];

            for (const meta of bookFiles) {
                try {
                    const resp = await fetch(`Books/${meta.id}.json`);
                    if (!resp.ok) {
                        console.warn(`BookManager: 无法加载 ${meta.id}.json, 状态: ${resp.status}`);
                        continue;
                    }
                    const data = await resp.json();
                    const groups = data.groupType === 'letter'
                        ? this.extractLetterGroups(data.vocabulary)
                        : this.extractUnitGroups(data.vocabulary);

                    this.books[meta.id] = {
                        id: meta.id,
                        name: data.name || meta.name,
                        icon: meta.icon,
                        color: meta.color,
                        groupType: data.groupType,
                        groups: groups,
                        vocabulary: data.vocabulary
                    };
                    console.log(`BookManager: 加载 ${this.books[meta.id].name}，共 ${data.vocabulary.length} 词`);
                } catch (e) {
                    console.error(`BookManager: 加载 ${meta.id} 失败:`, e);
                }
            }

            // 从本地存储加载上次选择的词书
            const savedBookId = localStorage.getItem('vocab_current_book');
            if (savedBookId && this.books[savedBookId]) {
                this.currentBookId = savedBookId;
                console.log('BookManager: 恢复上次选择的词书:', savedBookId);
            }

            console.log('BookManager: 初始化完成，当前词书:', this.currentBookId);
            console.log('BookManager: 可用词书:', Object.keys(this.books).filter(k => this.books[k].vocabulary.length > 0));

            this.loadAgentBooks();
        })();

        return this.loadPromise;
    }

    loadAgentBooks() {
        if (typeof agentManager === 'undefined') {
            console.log('BookManager: agentManager 未定义，跳过加载 Agent 词典');
            return;
        }

        const agentBooks = agentManager.loadAgentBooks();
        console.log('BookManager: 加载 Agent 词典', Object.keys(agentBooks).length, '个');

        Object.values(agentBooks).forEach(book => {
            this.books[book.id] = {
                id: book.id,
                name: book.name,
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
                color: '#EC4899',
                groups: this.extractLetterGroups(book.vocabulary),
                groupType: 'letter',
                vocabulary: book.vocabulary,
                isAgentBook: true,
                createdAt: book.createdAt
            };
            console.log('BookManager: 加载词典', book.name, '共', book.vocabulary.length, '个词汇');
        });
    }

    addAgentBook(bookId, name, vocabulary) {
        this.books[bookId] = {
            id: bookId,
            name: name,
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
            color: '#EC4899',
            groups: this.extractLetterGroups(vocabulary),
            groupType: 'letter',
            vocabulary: vocabulary,
            isAgentBook: true,
            createdAt: new Date().toISOString()
        };
    }

    removeAgentBook(bookId) {
        if (this.books[bookId] && this.books[bookId].isAgentBook) {
            if (typeof agentManager !== 'undefined') {
                agentManager.deleteAgentBook(bookId);
            }
            delete this.books[bookId];
            if (this.currentBookId === bookId) {
                const availableBooks = this.getBookList();
                if (availableBooks.length > 0) {
                    this.switchBook(availableBooks[0].id);
                }
            }
            return true;
        }
        return false;
    }

    getAgentBooks() {
        return Object.values(this.books).filter(book => book.isAgentBook);
    }

    // 提取字母分组
    extractLetterGroups(vocabulary) {
        const groups = new Set();
        vocabulary.forEach(word => {
            if (word.group) groups.add(word.group);
        });
        return Array.from(groups).sort().join('');
    }

    // 提取单元分组
    extractUnitGroups(vocabulary) {
        const groups = new Set();
        vocabulary.forEach(word => {
            if (word.group) groups.add(word.group);
        });
        return Array.from(groups).sort((a, b) => parseInt(a) - parseInt(b));
    }

    // 获取当前词书
    getCurrentBook() {
        return this.books[this.currentBookId];
    }

    // 获取当前词书的词汇
    getCurrentVocabulary() {
        return this.getCurrentBook().vocabulary;
    }

    // 切换词书
    switchBook(bookId) {
        if (this.books[bookId]) {
            this.currentBookId = bookId;
            localStorage.setItem('vocab_current_book', bookId);
            return true;
        }
        return false;
    }

    // 获取所有词书列表
    getBookList() {
        return Object.values(this.books).filter(book => book.vocabulary.length > 0);
    }

    // 获取词书信息
    getBookInfo(bookId) {
        return this.books[bookId];
    }

    // 获取当前词书的分组类型
    getGroupType() {
        return this.getCurrentBook().groupType;
    }

    // 是否是单元分组模式
    isUnitMode() {
        return this.getGroupType() === 'unit';
    }
}

// 创建全局实例
const bookManager = new BookManager();
