// 应用状态管理
class VocabApp {
    constructor() {
        this.currentMode = 'en-to-cn';
        this.currentIndex = 0;
        this.studyList = [];
        this.isReviewMode = false;
        this.waitingContinue = false;
        this.selectedGroups = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        this.isLocked = false;
        this.isInitialized = false;
        this.uploadedFileContent = null;
        this.uploadedFileName = null;
    }

    // 初始化应用
    async init() {
        if (this.isInitialized) return;

        try {
            // 初始化词书管理器
            await bookManager.init();

            // 根据当前词书设置可用词组
            this.updateAvailableGroups();

            // 从本地存储加载数据
            this.loadProgress();

            // 渲染 UI
            this.renderBookSelector();
            this.renderGroupButtons();
            this.initStudyList();
            this.initEventListeners();
            this.updateLockButton();
            this.showQuestion();
            this.initAgentFeatures();

            this.isInitialized = true;
        } catch (error) {
            console.error('初始化失败:', error);
            // 显示错误信息
            this.showError('初始化失败，请刷新页面重试');
        }
    }

    // 显示错误信息
    showError(message) {
        const cardContent = document.getElementById('card-content');
        if (cardContent) {
            cardContent.innerHTML = `
                <div style="text-align: center; color: var(--error);">
                    <div style="font-size: 40px; margin-bottom: 16px;">⚠️</div>
                    <div style="font-size: 16px;">${message}</div>
                </div>
            `;
        }
    }

    // 更新可用词组
    updateAvailableGroups() {
        const currentBook = bookManager.getCurrentBook();
        // groups 可能是字符串（字母分组）或数组（单元分组）
        this.availableGroups = typeof currentBook.groups === 'string'
            ? currentBook.groups.split('')
            : [...currentBook.groups];
        this.selectedGroups = [...this.availableGroups];
    }

    // 渲染词书选择器
    renderBookSelector() {
        const container = document.getElementById('book-list');
        const books = bookManager.getBookList();
        const currentBookId = bookManager.currentBookId;

        container.innerHTML = books.map(book => `
            <button class="book-btn ${book.id === currentBookId ? 'active' : ''} ${this.isLocked ? 'locked' : ''}"
                    data-book="${book.id}"
                    style="--book-color: ${book.color}">
                <span class="book-icon">${book.icon}</span>
                <div class="book-info">
                    <span class="book-name">${book.name}</span>
                    <span class="book-count">${book.vocabulary.length} 词</span>
                </div>
            </button>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.book-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.isLocked) {
                    this.switchBook(btn.dataset.book);
                }
            });
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 切换词书
    switchBook(bookId) {
        if (bookId === bookManager.currentBookId) return;
        if (this.isLocked) return; // 锁定状态下不允许切换词书

        // 切换词书
        bookManager.switchBook(bookId);
        this.updateAvailableGroups();

        // 重置学习状态
        this.isReviewMode = false;
        this.currentIndex = 0;
        this.isLocked = false;

        // 重新加载进度并渲染
        this.loadProgress();
        this.renderBookSelector();
        this.renderGroupButtons();
        this.updateLockButton();
        this.initStudyList();
        this.showQuestion();
    }

    // 本地存储键名（带词书ID前缀）
    get STORAGE_KEYS() {
        const bookId = bookManager.currentBookId;
        return {
            mistakes: `vocab_mistakes_${bookId}`,
            stats: `vocab_stats_${bookId}`,
            groups: `vocab_groups_${bookId}`
        };
    }

    // 初始化统计（处理旧版本数据兼容）
    initStats() {
        if (!this.stats) {
            const currentVocab = bookManager.getCurrentVocabulary();
            this.stats = {
                total: currentVocab.length,
                learned: 0,
                correct: 0,
                wrong: 0,
                skipped: 0
            };
        } else if (this.stats.skipped === undefined) {
            // 旧版本数据，添加 skipped 字段
            this.stats.skipped = 0;
        }
    }

    // 加载进度
    loadProgress() {
        const mistakesData = localStorage.getItem(this.STORAGE_KEYS.mistakes);
        this.mistakes = mistakesData ? JSON.parse(mistakesData) : [];

        const statsData = localStorage.getItem(this.STORAGE_KEYS.stats);
        const currentVocab = bookManager.getCurrentVocabulary();
        this.stats = statsData ? JSON.parse(statsData) : {
            total: currentVocab.length,
            learned: 0,
            correct: 0,
            wrong: 0,
            skipped: 0
        };

        // 初始化统计（确保兼容旧版本数据）
        this.initStats();

        // 加载词组选择
        const groupsData = localStorage.getItem(this.STORAGE_KEYS.groups);
        if (groupsData) {
            this.selectedGroups = JSON.parse(groupsData).filter(g => this.availableGroups.includes(g));
            // 如果过滤后为空，使用所有可用组
            if (this.selectedGroups.length === 0) {
                this.selectedGroups = [...this.availableGroups];
            }
        } else {
            this.selectedGroups = [...this.availableGroups];
        }
    }

    // 保存进度
    saveProgress() {
        localStorage.setItem(this.STORAGE_KEYS.mistakes, JSON.stringify(this.mistakes));
        localStorage.setItem(this.STORAGE_KEYS.stats, JSON.stringify(this.stats));
        localStorage.setItem(this.STORAGE_KEYS.groups, JSON.stringify(this.selectedGroups));
    }

    // 渲染词组按钮
    renderGroupButtons() {
        const container = document.getElementById('group-buttons');
        const groupLabel = document.getElementById('group-label');
        const groups = this.availableGroups;
        const isUnitMode = bookManager.isUnitMode();

        // 更新标签
        const labelText = isUnitMode ? '选择单元' : '选择词组';
        groupLabel.innerHTML = `<i data-lucide="layers" class="header-icon"></i> ${labelText}`;

        // 更新容器类名
        if (isUnitMode) {
            container.classList.add('has-unit-mode');
        } else {
            container.classList.remove('has-unit-mode');
        }

        container.innerHTML = groups.map(group => `
            <button class="group-btn ${this.selectedGroups.includes(group) ? 'selected' : ''} ${this.isLocked ? 'locked' : ''}"
                    data-group="${group}">
                ${group}
            </button>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.group-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleGroup(btn.dataset.group));
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 切换词组选择
    toggleGroup(group) {
        if (this.isLocked) return; // 锁定状态下不可修改

        const index = this.selectedGroups.indexOf(group);
        if (index > -1) {
            // 至少保留一个词组
            if (this.selectedGroups.length > 1) {
                this.selectedGroups.splice(index, 1);
            }
        } else {
            this.selectedGroups.push(group);
        }

        this.updateGroupButtons();
        this.saveProgress();
        this.initStudyList();
        this.showQuestion();
    }

    // 更新词组按钮状态
    updateGroupButtons() {
        document.querySelectorAll('.group-btn').forEach(btn => {
            const group = btn.dataset.group;
            btn.classList.toggle('selected', this.selectedGroups.includes(group));
        });
    }

    // 更新锁定按钮状态
    updateLockButton() {
        const lockBtn = document.getElementById('lock-btn');
        const lockIcon = lockBtn.querySelector('.lock-icon');
        const unlockIcon = lockBtn.querySelector('.unlock-icon');
        const lockText = lockBtn.querySelector('.lock-text');

        if (this.isLocked) {
            lockBtn.classList.add('locked');
            lockIcon.style.display = 'none';
            unlockIcon.style.display = 'block';
            lockText.textContent = '解锁';
        } else {
            lockBtn.classList.remove('locked');
            lockIcon.style.display = 'block';
            unlockIcon.style.display = 'none';
            lockText.textContent = '锁定';
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // 更新词组按钮的锁定状态
        document.querySelectorAll('.group-btn').forEach(btn => {
            btn.classList.toggle('locked', this.isLocked);
        });

        // 更新词书按钮的锁定状态
        document.querySelectorAll('.book-btn').forEach(btn => {
            btn.classList.toggle('locked', this.isLocked);
        });

        // 更新全选/清空按钮的锁定状态
        document.querySelectorAll('.select-all-btn, .select-none-btn').forEach(btn => {
            btn.disabled = this.isLocked;
        });
    }

    // 切换锁定状态
    toggleLock() {
        this.isLocked = !this.isLocked;
        this.updateLockButton();
    }

    // 获取选中的词组词汇
    getFilteredVocabulary() {
        if (this.selectedGroups.length === 0) {
            return [];
        }
        const currentVocab = bookManager.getCurrentVocabulary();
        return currentVocab.filter(word => this.selectedGroups.includes(word.group));
    }

    // 初始化学习列表
    initStudyList() {
        const filteredVocab = this.getFilteredVocabulary();
        let studyList = this.isReviewMode
            ? [...this.mistakes].filter(word => this.selectedGroups.includes(word.group))
            : [...filteredVocab];

        // 随机打乱顺序 (Fisher-Yates shuffle)
        for (let i = studyList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [studyList[i], studyList[j]] = [studyList[j], studyList[i]];
        }

        this.studyList = studyList;
        this.currentIndex = 0;
    }

    // 初始化事件监听
    initEventListeners() {
        // 导航切换
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });

        // 全选按钮
        document.getElementById('select-all-groups').addEventListener('click', () => {
            if (this.isLocked) return;
            this.selectedGroups = [...this.availableGroups];
            this.updateGroupButtons();
            this.saveProgress();
            this.initStudyList();
            this.showQuestion();
        });

        // 清空按钮
        document.getElementById('select-none-groups').addEventListener('click', () => {
            if (this.isLocked) return;
            // 至少保留一个词组
            if (this.selectedGroups.length > 1) {
                this.selectedGroups = [this.selectedGroups[0]];
                this.updateGroupButtons();
                this.saveProgress();
                this.initStudyList();
                this.showQuestion();
            }
        });

        // 锁定按钮
        document.getElementById('lock-btn').addEventListener('click', () => {
            this.toggleLock();
        });

        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });

        // 继续按钮点击事件
        document.getElementById('continue-btn').addEventListener('click', (e) => {
            e.preventDefault();
            if (this.waitingContinue) {
                this.nextQuestion();
            }
        });

        // 清空错题
        document.getElementById('clear-mistakes').addEventListener('click', () => {
            if (confirm('确定要清空错题本吗？')) {
                this.mistakes = [];
                this.saveProgress();
                this.renderMistakes();
                this.updateStats();
            }
        });

        // 导出错题
        document.getElementById('export-mistakes').addEventListener('click', () => {
            this.exportMistakes();
        });

        // 复习错题
        document.getElementById('review-mistakes').addEventListener('click', () => {
            this.isReviewMode = true;
            this.initStudyList();
            // 传入 true 保持当前复习状态
            this.switchView('learn', true);
        });

        // 重置统计
        document.getElementById('reset-stats').addEventListener('click', () => {
            if (confirm('确定要重置所有学习进度吗？')) {
                localStorage.removeItem(this.STORAGE_KEYS.mistakes);
                localStorage.removeItem(this.STORAGE_KEYS.stats);
                this.mistakes = [];
                const currentVocab = bookManager.getCurrentVocabulary();
                this.stats = {
                    total: currentVocab.length,
                    learned: 0,
                    correct: 0,
                    wrong: 0,
                    skipped: 0
                };
                this.initStudyList();
                this.saveProgress();
                this.showQuestion();
                this.updateStats();
                this.renderMistakes();
            }
        });
    }

    // 切换视图
    switchView(view, keepCurrentState = false) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('active', v.id === `${view}-view`);
        });

        if (view === 'mistakes') {
            this.renderMistakes();
        } else if (view === 'stats') {
            this.updateStats();
        } else if (view === 'learn') {
            // 保存当前复习模式状态
            const wasReviewMode = this.isReviewMode;

            // 如果没有要求保持状态，说明是从错题本/统计正常返回学习界面
            // 此时保持学习列表和进度不变，只退出复习模式
            if (!keepCurrentState) {
                this.isReviewMode = false;
            }

            // 只有在学习列表为空、词组选择变化、或刚进入复习模式时才重新初始化
            // 注意：从复习模式退出时(isReviewMode从true变false)，不应该重新初始化
            const needsInit = this.studyList.length === 0 ||
                              !this.studyListMatchesSelection() ||
                              (this.isReviewMode === true && !wasReviewMode);  // 只有刚进入复习模式时才初始化

            if (needsInit) {
                this.initStudyList();
            }

            // 如果当前索引超出范围，重置为0
            if (this.currentIndex >= this.studyList.length) {
                this.currentIndex = 0;
            }

            this.showQuestion();
        }
    }

    // 检查当前学习列表是否匹配词组选择
    studyListMatchesSelection() {
        if (this.studyList.length === 0) return false;

        // 检查学习列表中的第一个词是否在当前选中的词组中
        // 如果不在，说明词组选择发生了变化
        const firstWordGroup = this.studyList[0].group;
        return this.selectedGroups.includes(firstWordGroup);
    }

    // 切换模式
    switchMode(mode) {
        this.currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        this.showQuestion();
    }

    // 显示当前题目
    showQuestion() {
        this.waitingContinue = false;

        if (this.currentIndex >= this.studyList.length) {
            this.showComplete();
            return;
        }

        const word = this.studyList[this.currentIndex];
        this.updateProgress();

        const cardContent = document.getElementById('card-content');
        const resultArea = document.getElementById('result-area');
        resultArea.style.display = 'none';

        if (this.currentMode === 'en-to-cn') {
            this.renderEnToCn(word, cardContent);
        } else {
            this.renderCnToEn(word, cardContent);
        }
    }

    // 英译中 - 选择题
    renderEnToCn(word, container) {
        const options = this.generateOptions(word);
        const optionsHtml = options.map((opt, idx) => `
            <button class="option-btn" data-index="${idx}">${opt.cn}</button>
        `).join('');

        container.innerHTML = `
            <div class="word">
                <div class="word-title">${word.word}</div>
                ${word.phonetic ? `<div class="word-phonetic">${word.phonetic}</div>` : ''}
                <div class="word-definition">${word.definition}</div>
                <div class="options" id="options-container">${optionsHtml}</div>
            </div>
        `;

        // 使用事件委托，避免重复绑定
        const optionsContainer = container.querySelector('#options-container');
        optionsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.option-btn');
            if (btn && !btn.disabled) {
                this.handleEnToCnAnswer(word, btn);
            }
        });
    }

    // 生成选择题选项
    generateOptions(correctWord) {
        const options = [correctWord];
        const currentVocab = bookManager.getCurrentVocabulary();
        const available = currentVocab.filter(w => w.word !== correctWord.word);

        while (options.length < 4 && available.length > 0) {
            const idx = Math.floor(Math.random() * available.length);
            options.push(available[idx]);
            available.splice(idx, 1);
        }

        // 打乱顺序
        return options.sort(() => Math.random() - 0.5);
    }

    // 处理英译中答案
    handleEnToCnAnswer(word, selectedBtn) {
        // 立即设置等待状态，防止事件重复触发
        if (this.waitingContinue) return;

        const isCorrect = selectedBtn.textContent.trim() === word.cn;
        const allBtns = document.querySelectorAll('.option-btn');

        allBtns.forEach(btn => {
            btn.disabled = true;
            if (btn.textContent.trim() === word.cn) {
                btn.classList.add('correct');
            } else if (btn === selectedBtn && !isCorrect) {
                btn.classList.add('wrong');
            }
        });

        this.processResult(word, isCorrect);
    }

    // 中译英 - 填空题
    renderCnToEn(word, container) {
        container.innerHTML = `
            <div class="word">
                <div class="word-cn" style="font-size: 22px;">${word.cn}</div>
                <div class="word-definition">${word.definition}</div>
                <div class="input-area">
                    <input type="text" class="input-field" id="answer-input" placeholder="输入英文单词..." autocomplete="off">
                    <div class="input-hint">按 Enter 跳过 | 输入答案后按 Enter 提交</div>
                </div>
            </div>
        `;

        const input = document.getElementById('answer-input');
        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.handleCnToEnAnswer(word, input.value.trim());
            }
        });
    }

    // 处理中译英答案
    handleCnToEnAnswer(word, answer) {
        if (!answer) {
            this.handleSkip();
            return;
        }

        const isCorrect = answer.toLowerCase() === word.word.toLowerCase();
        this.processResult(word, isCorrect, answer);
    }

    // 跳过题目
    handleSkip() {
        if (this.waitingContinue) return;

        const word = this.studyList[this.currentIndex];
        this.processResult(word, null, null, true);
    }

    // 处理结果
    processResult(word, isCorrect, userAnswer = null, skipped = false) {
        if (this.waitingContinue) return;
        this.waitingContinue = true;

        const resultArea = document.getElementById('result-area');
        const statusEl = document.getElementById('answer-status');
        const correctAnswerEl = document.getElementById('correct-answer');
        const currentVocab = bookManager.getCurrentVocabulary();

        let statusText = '';
        let statusClass = '';

        if (skipped) {
            statusText = '已跳过';
            statusClass = 'skipped';
            this.stats.skipped++;
            this.addToMistakes(word);
        } else if (isCorrect) {
            statusText = '正确！';
            statusClass = 'correct';
            this.stats.correct++;
            this.stats.learned = Math.min(this.stats.learned + 1, currentVocab.length);
            this.removeFromMistakes(word);
        } else {
            statusText = '错误';
            statusClass = 'wrong';
            this.stats.wrong++;
            this.addToMistakes(word);
        }

        this.stats.total = currentVocab.length;
        this.saveProgress();

        statusEl.textContent = statusText;
        statusEl.className = 'answer-status ' + statusClass;

        // 显示正确答案（错误或跳过时显示）
        if (!isCorrect || skipped) {
            correctAnswerEl.style.display = 'block';
            correctAnswerEl.innerHTML = `
                <div class="correct-answer-label">正确答案</div>
                <div class="correct-answer-text">
                    <span class="correct-word">${word.word}</span>
                    ${word.phonetic ? `<span class="correct-phonetic">${word.phonetic}</span>` : ''}
                    <span class="correct-cn">${word.cn}</span>
                </div>
            `;
        } else {
            correctAnswerEl.style.display = 'none';
        }

        resultArea.style.display = 'block';
        document.getElementById('continue-btn').focus();
    }

    // 添加到错题本
    addToMistakes(word) {
        if (!this.mistakes.find(m => m.word === word.word)) {
            this.mistakes.push(word);
        }
    }

    // 从错题本移除
    removeFromMistakes(word) {
        const idx = this.mistakes.findIndex(m => m.word === word.word);
        if (idx !== -1) {
            this.mistakes.splice(idx, 1);
        }
    }

    // 下一题
    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    }

    // 更新进度条
    updateProgress() {
        const progress = ((this.currentIndex) / this.studyList.length) * 100;
        document.getElementById('progress-fill').style.width = `${progress}%`;
        document.getElementById('current-index').textContent = this.currentIndex;
        document.getElementById('total-count').textContent = this.studyList.length;
    }

    // 显示完成状态
    showComplete() {
        const cardContent = document.getElementById('card-content');
        const resultArea = document.getElementById('result-area');
        resultArea.style.display = 'none';

        const title = this.isReviewMode ? '错题复习完成！' : '学习完成！';
        const message = this.isReviewMode
            ? '恭喜你完成所有错题的复习。'
            : '恭喜你完成所有词汇的学习，去错题本看看需要复习的内容吧。';

        cardContent.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 40px; margin-bottom: 16px; color: var(--primary);"></div>
                <div style="font-size: 24px; font-weight: 600; margin-bottom: 12px;">${title}</div>
                <div style="color: var(--text-secondary);">${message}</div>
            </div>
        `;

        document.getElementById('progress-fill').style.width = '100%';
        document.getElementById('current-index').textContent = this.studyList.length;
    }

    // 渲染错题本
    renderMistakes() {
        const container = document.getElementById('mistakes-list');
        const actions = document.getElementById('mistakes-actions');

        if (this.mistakes.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无错题，继续努力！</div>';
            actions.style.display = 'none';
            return;
        }

        actions.style.display = 'block';
        container.innerHTML = this.mistakes.map(word => `
            <div class="mistake-item">
                <div class="mistake-word">${word.word}</div>
                ${word.phonetic ? `<div class="mistake-phonetic">${word.phonetic}</div>` : ''}
                <div class="mistake-cn">${word.cn}</div>
                <div class="mistake-definition">${word.definition}</div>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 导出错题
    exportMistakes() {
        if (this.mistakes.length === 0) {
            alert('暂无错题可导出');
            return;
        }

        const currentBook = bookManager.getCurrentBook();
        const bookName = currentBook.name;
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

        // 生成文本内容
        let content = `错题导出 - ${bookName}\n`;
        content += `导出时间: ${now.toLocaleString('zh-CN')}\n`;
        content += `错题数量: ${this.mistakes.length}\n`;
        content += `${'='.repeat(50)}\n\n`;

        this.mistakes.forEach((word, index) => {
            content += `${index + 1}. ${word.word}\n`;
            if (word.phonetic) {
                content += `   音标: ${word.phonetic}\n`;
            }
            content += `   中文: ${word.cn}\n`;
            if (word.definition) {
                content += `   释义: ${word.definition}\n`;
            }
            content += '\n';
        });

        // 创建下载
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `错题本_${bookName}_${dateStr}_${timeStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    updateStats() {
        document.getElementById('stat-total').textContent = this.stats.total;
        document.getElementById('stat-learned').textContent = this.stats.learned;
        document.getElementById('stat-mistakes').textContent = this.mistakes.length;

        const totalAttempts = this.stats.correct + this.stats.wrong;
        const accuracy = totalAttempts > 0
            ? Math.round((this.stats.correct / totalAttempts) * 100)
            : 0;
        document.getElementById('stat-accuracy').textContent = accuracy + '%';
    }

    initAgentFeatures() {
        if (typeof agentManager === 'undefined') return;

        this.chatMessages = [];
        this.currentChatFile = null;
        this.isStreaming = false;

        agentManager.init().then(() => {
            this.updateChatStatus();
        });

        const chatInput = document.getElementById('chat-input');
        const chatSendBtn = document.getElementById('chat-send-btn');
        const chatAttachBtn = document.getElementById('chat-attach-btn');
        const chatFileInput = document.getElementById('chat-file-input');
        const chatFileRemove = document.getElementById('chat-file-remove');
        const showSettingsBtn = document.getElementById('show-settings-btn');
        const showMyBooksBtn = document.getElementById('show-my-books-btn');
        const panelCloseBtn = document.getElementById('panel-close-btn');
        const clearHistoryBtn = document.getElementById('clear-history-btn');

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendChatMessage();
                }
            });
        }

        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', () => this.sendChatMessage());
        }

        if (chatAttachBtn && chatFileInput) {
            chatAttachBtn.addEventListener('click', () => chatFileInput.click());
            chatFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleChatFileUpload(file);
            });
        }

        if (chatFileRemove) {
            chatFileRemove.addEventListener('click', () => this.clearChatFile());
        }

        if (showSettingsBtn) {
            showSettingsBtn.addEventListener('click', () => this.showPanel('settings'));
        }

        if (showMyBooksBtn) {
            showMyBooksBtn.addEventListener('click', () => this.showPanel('books'));
        }

        if (panelCloseBtn) {
            panelCloseBtn.addEventListener('click', () => this.hidePanel());
        }

        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (this.isStreaming) return;
                agentManager.clearHistory();
                this.chatMessages = [];
                const container = document.getElementById('chat-messages');
                container.innerHTML = '';
                this.showChatWelcome();
            });
        }

        // 欢迎页快捷操作
        document.querySelectorAll('.welcome-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    const chatInput = document.getElementById('chat-input');
                    chatInput.value = prompt;
                    chatInput.focus();
                    if (prompt.includes('上传文件')) {
                        document.getElementById('chat-file-input').click();
                    }
                }
            });
        });
    }

    updateChatStatus() {
        const chatStatus = document.getElementById('chat-status');
        if (!chatStatus) return;

        const dot = chatStatus.querySelector('.status-dot');
        const text = chatStatus.querySelector('span:last-child');

        if (agentManager.isConfigured()) {
            dot.classList.remove('disconnected');
            dot.classList.add('connected');
            text.textContent = '已连接';
        } else {
            dot.classList.remove('connected');
            dot.classList.add('disconnected');
            text.textContent = '未连接';
        }
    }

    handleChatFileUpload(file) {
        const allowedTypes = ['.txt', '.md', '.json'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowedTypes.includes(ext)) {
            this.addChatMessage('assistant', '抱歉，只支持 .txt, .md, .json 格式的文件。');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentChatFile = {
                name: file.name,
                content: e.target.result
            };
            this.showChatFilePreview();
        };
        reader.readAsText(file);
    }

    showChatFilePreview() {
        const preview = document.getElementById('chat-file-preview');
        const fileName = document.getElementById('chat-file-name');

        if (preview && fileName && this.currentChatFile) {
            preview.style.display = 'block';
            fileName.textContent = this.currentChatFile.name;
        }
    }

    clearChatFile() {
        this.currentChatFile = null;
        const preview = document.getElementById('chat-file-preview');
        const fileInput = document.getElementById('chat-file-input');

        if (preview) preview.style.display = 'none';
        if (fileInput) fileInput.value = '';
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('chat-input');
        const message = chatInput.value.trim();

        if (!message && !this.currentChatFile) return;
        if (this.isStreaming) return;

        if (!agentManager.isConfigured()) {
            this.addChatMessage('assistant', '请先配置 Deepseek API Key。点击右上角的设置按钮进行配置。');
            return;
        }

        // 隐藏欢迎页
        const welcome = document.getElementById('chat-welcome');
        if (welcome) welcome.style.display = 'none';

        this.addChatMessage('user', message, this.currentChatFile?.name);
        chatInput.value = '';

        const fileContent = this.currentChatFile?.content;
        const fileName = this.currentChatFile?.name;
        this.clearChatFile();

        // 创建助手消息气泡（流式更新）
        this.isStreaming = true;
        this.updateSendButton();

        const assistantDiv = this.createAssistantMessageBubble();
        const textEl = assistantDiv.querySelector('.message-text');
        const wordContainer = assistantDiv.querySelector('.word-extract-container');
        const counterEl = assistantDiv.querySelector('.word-extract-counter');
        const wordListEl = assistantDiv.querySelector('.word-extract-list');
        let rawText = '';
        let wordCount = 0;
        const collectedWords = [];

        try {
            for await (const event of agentManager.streamChat(message, fileContent)) {
                if (event.type === 'token') {
                    rawText += event.content;
                    // 清理显示：隐藏 JSON 行，只显示文本
                    const displayText = this.cleanStreamText(rawText);
                    textEl.innerHTML = this.formatMarkdown(displayText);
                    this.scrollChatToBottom();
                } else if (event.type === 'word') {
                    wordCount++;
                    collectedWords.push(event.word);
                    // 显示提取进度
                    if (counterEl) counterEl.textContent = `${wordCount}`;
                    if (wordListEl) {
                        const item = this.createWordCard(event.word, wordCount);
                        wordListEl.appendChild(item);
                    }
                    this.scrollChatToBottom();
                } else if (event.type === 'summary') {
                    // 显示汇总
                    if (counterEl) counterEl.textContent = wordCount;
                } else if (event.type === 'done') {
                    // 最终清理文本
                    const displayText = this.cleanStreamText(rawText);
                    textEl.innerHTML = this.formatMarkdown(displayText);
                    // 隐藏空文本
                    if (!displayText.trim()) {
                        textEl.style.display = 'none';
                    }
                    // 如果有词汇，显示保存按钮
                    if (collectedWords.length > 0) {
                        this.addSaveVocabButton(wordContainer, collectedWords, message);
                    }
                    if (collectedWords.length > 0 && wordContainer) {
                        wordContainer.style.display = 'block';
                    }
                } else if (event.type === 'error') {
                    textEl.textContent = '';
                    textEl.style.display = 'block';
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'chat-error';
                    errorDiv.textContent = event.content;
                    textEl.appendChild(errorDiv);
                } else if (event.type === 'aborted') {
                    if (!rawText.trim()) {
                        textEl.textContent = '';
                        const abortDiv = document.createElement('div');
                        abortDiv.className = 'chat-error';
                        abortDiv.textContent = '已取消';
                        textEl.appendChild(abortDiv);
                    }
                }
            }
        } catch (e) {
            textEl.textContent = '发生未知错误';
        }

        this.isStreaming = false;
        this.updateSendButton();
    }

    // 清理流式文本：移除 JSON 行
    cleanStreamText(raw) {
        const lines = raw.split('\n');
        const textLines = [];
        for (const line of lines) {
            const stripped = line.trim();
            if (!stripped) continue;
            // 跳过 JSON 行
            if (stripped.startsWith('{') && (stripped.endsWith('}') || stripped.endsWith(','))) {
                try {
                    const obj = JSON.parse(stripped.replace(/,$/, ''));
                    if (obj.word || obj.__summary__) continue;
                } catch (e) {
                    // 不是 JSON，保留
                }
            }
            textLines.push(stripped);
        }
        return textLines.join('\n');
    }

    // 简易 Markdown 格式化
    formatMarkdown(text) {
        if (!text) return '';
        let html = this.escapeHtml(text);
        // 粗体 **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // 行内代码 `code`
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');
        // 换行
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    // 创建助手消息气泡
    createAssistantMessageBubble() {
        const container = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message assistant';

        messageDiv.innerHTML = `
            <div class="message-avatar mosa-avatar-small">
                <span>M</span>
            </div>
            <div class="message-content">
                <div class="message-text"></div>
                <div class="word-extract-container" style="display:none;">
                    <div class="word-extract-header">
                        <span class="word-extract-label">词条提取中</span>
                        <span class="word-extract-counter">0</span>
                    </div>
                    <div class="word-extract-list"></div>
                </div>
            </div>
        `;

        container.appendChild(messageDiv);
        this.scrollChatToBottom();
        return messageDiv;
    }

    // 创建词条卡片
    createWordCard(word, index) {
        const item = document.createElement('div');
        item.className = 'word-extract-item';
        item.style.animation = `fadeUp 0.3s ease-out ${index * 0.02}s both`;
        item.innerHTML = `
            <div class="word-card-main">
                <span class="word-card-word">${this.escapeHtml(word.word)}</span>
                <span class="word-card-phonetic">${this.escapeHtml(word.phonetic)}</span>
            </div>
            <div class="word-card-cn">${this.escapeHtml(word.cn)}</div>
        `;
        return item;
    }

    // 添加保存词书按钮
    addSaveVocabButton(container, vocabulary, message) {
        const actions = document.createElement('div');
        actions.className = 'word-extract-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'word-save-btn';
        saveBtn.textContent = `保存为词书（${vocabulary.length} 词）`;
        saveBtn.addEventListener('click', () => {
            const bookId = agentManager.generateBookId();
            const bookName = this.generateBookName(message) + ' Mosa';
            agentManager.saveAgentBook(bookId, bookName, vocabulary);
            bookManager.addAgentBook(bookId, bookName, vocabulary);
            this.renderBookSelector();

            saveBtn.textContent = '已保存';
            saveBtn.disabled = true;
            saveBtn.classList.add('saved');

            const learnBtn = document.createElement('button');
            learnBtn.className = 'word-learn-btn';
            learnBtn.textContent = '开始学习';
            learnBtn.addEventListener('click', () => {
                this.switchBook(bookId);
                this.switchView('learn');
            });
            actions.appendChild(learnBtn);
        });

        actions.appendChild(saveBtn);
        container.appendChild(actions);

        // 更新header
        const label = container.querySelector('.word-extract-label');
        if (label) label.textContent = `已提取 ${vocabulary.length} 个词条`;
    }

    updateSendButton() {
        const btn = document.getElementById('chat-send-btn');
        if (!btn) return;
        if (this.isStreaming) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="square"></i>';
            btn.onclick = () => {
                agentManager.abort();
            };
            btn.disabled = false;
            btn.title = '停止生成';
        } else {
            btn.innerHTML = '<i data-lucide="arrow-up"></i>';
            btn.onclick = null;
            btn.title = '发送';
            btn.disabled = false;
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    showChatWelcome() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = `
            <div class="chat-welcome" id="chat-welcome">
                <div class="welcome-icon">
                    <span class="welcome-icon-text">M</span>
                </div>
                <div class="welcome-title">你好，我是 Mosa</div>
                <div class="welcome-subtitle">你的 AI 词典助手，帮你创建个性化词汇书</div>
                <div class="welcome-cards">
                    <button class="welcome-card" data-prompt="帮我生成一份人工智能领域的词汇表">
                        <div class="welcome-card-icon"><i data-lucide="sparkles"></i></div>
                        <div class="welcome-card-text">生成主题词汇表</div>
                    </button>
                    <button class="welcome-card" data-prompt="帮我从上传的文件中提取专业词汇">
                        <div class="welcome-card-icon"><i data-lucide="file-up"></i></div>
                        <div class="welcome-card-text">上传文件提取词汇</div>
                    </button>
                    <button class="welcome-card" data-prompt="有什么好的词汇记忆方法？">
                        <div class="welcome-card-icon"><i data-lucide="lightbulb"></i></div>
                        <div class="welcome-card-text">词汇学习建议</div>
                    </button>
                </div>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Re-bind welcome card clicks
        document.querySelectorAll('.welcome-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    const chatInput = document.getElementById('chat-input');
                    chatInput.value = prompt;
                    chatInput.focus();
                    if (prompt.includes('上传文件')) {
                        document.getElementById('chat-file-input').click();
                    }
                }
            });
        });
    }

    addChatMessage(role, text, fileName = null, vocabulary = null) {
        const container = document.getElementById('chat-messages');

        // 隐藏欢迎页
        const welcome = document.getElementById('chat-welcome');
        if (welcome) welcome.style.display = 'none';

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;

        if (role === 'user') {
            messageDiv.innerHTML = `
                <div class="message-avatar user-avatar">
                    <i data-lucide="user"></i>
                </div>
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(text)}${fileName ? `<div class="message-file-attachment"><i data-lucide="file-text" style="width:14px;height:14px;"></i> ${this.escapeHtml(fileName)}</div>` : ''}</div>
                </div>
            `;
        } else {
            let vocabHtml = '';
            if (vocabulary && vocabulary.length > 0) {
                vocabHtml = `
                    <div class="word-extract-container" style="display:block;">
                        <div class="word-extract-header">
                            <span class="word-extract-label">已提取 ${vocabulary.length} 个词条</span>
                        </div>
                        <div class="word-extract-list">
                            ${vocabulary.map((v, i) => `
                                <div class="word-extract-item" style="animation: fadeUp 0.3s ease-out ${i * 0.02}s both;">
                                    <div class="word-card-main">
                                        <span class="word-card-word">${this.escapeHtml(v.word)}</span>
                                        <span class="word-card-phonetic">${this.escapeHtml(v.phonetic)}</span>
                                    </div>
                                    <div class="word-card-cn">${this.escapeHtml(v.cn)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            messageDiv.innerHTML = `
                <div class="message-avatar mosa-avatar-small">
                    <span>M</span>
                </div>
                <div class="message-content">
                    <div class="message-text">${this.formatMarkdown(text)}</div>
                    ${vocabHtml}
                </div>
            `;
        }

        container.appendChild(messageDiv);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        this.scrollChatToBottom();
    }

    scrollChatToBottom() {
        const container = document.getElementById('chat-messages');
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    generateBookName(message) {
        let name = message.substring(0, 15);
        if (message.length > 15) {
            const lastSpace = name.lastIndexOf(' ');
            if (lastSpace > 5) {
                name = name.substring(0, lastSpace);
            }
            name += '...';
        }
        return name.trim();
    }

    showPanel(type) {
        const panel = document.getElementById('chat-panel');
        const title = document.getElementById('panel-title');
        const content = document.getElementById('chat-panel-content');

        if (!panel || !title || !content) return;

        panel.style.display = 'flex';

        if (type === 'settings') {
            title.textContent = '设置';
            content.innerHTML = `
                <div class="panel-section">
                    <div class="panel-section-title">API 配置</div>
                    <div class="panel-api-status">
                        <span class="status-dot ${agentManager.isConfigured() ? 'connected' : 'disconnected'}"></span>
                        <span>${agentManager.isConfigured() ? '已连接' : '未连接'}</span>
                    </div>
                    <div class="panel-input-group">
                        <input type="password" id="panel-api-key" class="panel-input" placeholder="输入 Deepseek API Key">
                        <button class="panel-btn" id="panel-save-api">保存</button>
                        <button class="panel-btn secondary" id="panel-test-api">测试连接</button>
                    </div>
                    <div class="panel-hint">
                        <i data-lucide="info"></i>
                        <span>获取 API Key: <a href="https://platform.deepseek.com/" target="_blank">Deepseek 开放平台</a></span>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const saveBtn = document.getElementById('panel-save-api');
                const testBtn = document.getElementById('panel-test-api');
                const apiKeyInput = document.getElementById('panel-api-key');

                if (saveBtn) {
                    saveBtn.addEventListener('click', () => {
                        const key = apiKeyInput.value.trim();
                        if (key) {
                            agentManager.saveApiKey(key);
                            this.updateChatStatus();
                            this.showPanel('settings');
                            alert('API Key 已保存');
                        }
                    });
                }

                if (testBtn) {
                    testBtn.addEventListener('click', async () => {
                        const key = apiKeyInput.value.trim() || agentManager.getApiKey();
                        if (!key) {
                            alert('请先输入 API Key');
                            return;
                        }

                        testBtn.disabled = true;
                        testBtn.textContent = '测试中...';

                        const result = await agentManager.testConnection();

                        testBtn.disabled = false;
                        testBtn.textContent = '测试连接';

                        if (result.success) {
                            alert('连接成功！');
                            if (apiKeyInput.value.trim()) {
                                agentManager.saveApiKey(apiKeyInput.value.trim());
                            }
                            this.updateChatStatus();
                            this.showPanel('settings');
                        } else {
                            alert('连接失败: ' + result.error);
                        }
                    });
                }

                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }, 100);

        } else if (type === 'books') {
            title.textContent = '我的 AI 词典';

            const agentBooks = bookManager.getAgentBooks();

            if (agentBooks.length === 0) {
                content.innerHTML = `
                    <div class="panel-section">
                        <div class="panel-section-title">AI 创建的词典</div>
                        <div style="text-align:center;padding:40px;color:var(--text-light);">
                            暂无 AI 创建的词典
                        </div>
                    </div>
                `;
            } else {
                content.innerHTML = `
                    <div class="panel-section">
                        <div class="panel-section-title">AI 创建的词典</div>
                        <div class="panel-book-list">
                            ${agentBooks.map(book => `
                                <div class="panel-book-item" data-book-id="${book.id}">
                                    <div class="panel-book-info">
                                        <div class="panel-book-name">${this.escapeHtml(book.name)}</div>
                                        <div class="panel-book-meta">
                                            <span>${book.vocabulary.length} 词</span>
                                            <span>${new Date(book.createdAt).toLocaleDateString('zh-CN')}</span>
                                        </div>
                                    </div>
                                    <div class="panel-book-actions">
                                        <button class="panel-book-btn use-btn" title="使用此词典">
                                            <i data-lucide="play"></i>
                                        </button>
                                        <button class="panel-book-btn delete" title="删除">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;

                setTimeout(() => {
                    content.querySelectorAll('.panel-book-item').forEach(item => {
                        const bookId = item.dataset.bookId;

                        item.querySelector('.use-btn').addEventListener('click', () => {
                            this.switchBook(bookId);
                            this.switchView('learn');
                            this.hidePanel();
                        });

                        item.querySelector('.delete').addEventListener('click', () => {
                            this.showDeleteConfirm(bookId, book.name);
                        });
                    });

                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }, 100);
            }
        }
    }

    showDeleteConfirm(bookId, bookName) {
        const modal = document.getElementById('delete-modal');
        const message = document.getElementById('delete-modal-message');
        const confirmText = document.getElementById('delete-confirm-text');
        const input = document.getElementById('delete-confirm-input');
        const confirmBtn = document.getElementById('delete-modal-confirm');
        const cancelBtn = document.getElementById('delete-modal-cancel');

        message.textContent = `确定要删除词典「${bookName}」吗？`;
        confirmText.textContent = 'DELETE';
        input.value = '';
        confirmBtn.disabled = true;

        modal.style.display = 'flex';
        input.focus();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        const handleInput = () => {
            confirmBtn.disabled = input.value.toUpperCase() !== confirmText.textContent;
        };

        const closeModal = () => {
            modal.style.display = 'none';
            input.value = '';
            confirmBtn.disabled = true;
            input.removeEventListener('input', handleInput);
            cancelBtn.removeEventListener('click', closeModal);
            confirmBtn.removeEventListener('click', handleConfirm);
            modal.removeEventListener('click', handleOverlayClick);
        };

        const handleConfirm = () => {
            if (!confirmBtn.disabled) {
                bookManager.removeAgentBook(bookId);
                this.renderBookSelector();
                this.hidePanel();
                closeModal();
            }
        };

        const handleOverlayClick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };

        input.addEventListener('input', handleInput);
        cancelBtn.addEventListener('click', closeModal);
        confirmBtn.addEventListener('click', handleConfirm);
        modal.addEventListener('click', handleOverlayClick);
    }

    hidePanel() {
        const panel = document.getElementById('chat-panel');
        if (panel) panel.style.display = 'none';
    }

    startLearning(bookId) {
        if (bookId) {
            this.switchBook(bookId);
        }
        this.switchView('learn');
    }
}

// 初始化应用
let app = null;

// 确保在所有资源加载完成后初始化
window.addEventListener('load', async () => {
    console.log('=== 页面加载完成，开始诊断 ===');

    // 检查所有全局变量
    console.log('全局变量检查:');
    console.log('  - bookManager:', typeof bookManager);
    console.log('  - window.api:', typeof window.api);

    if (typeof bookManager === 'undefined') {
        console.error('❌ bookManager 未定义，bookManager.js 可能未加载');
        document.getElementById('card-content').innerHTML = `
            <div style="text-align: center; color: var(--error); padding: 40px;">
                <div style="font-size: 40px; margin-bottom: 16px;">⚠️</div>
                <div style="font-size: 16px; margin-bottom: 12px;">词书管理器未加载</div>
                <div style="font-size: 13px; color: #666;">请检查 bookManager.js 是否存在</div>
            </div>
        `;
        return;
    }

    // 初始化主题（在应用初始化前立即应用，避免闪烁）
    const savedTheme = localStorage.getItem('vocab_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // 创建应用实例
    console.log('创建应用实例...');
    app = new VocabApp();

    // 异步初始化
    console.log('开始初始化应用...');
    await app.init();

    console.log('✅ 应用初始化完成');
    console.log('========================');

    // 全局键盘事件 - 只在非输入框且非等待状态下处理跳过
    document.addEventListener('keydown', (e) => {
        if (!app || !app.isInitialized) return;
        if (e.key === 'Enter') {
            const activeElement = document.activeElement;
            const isInputElement = activeElement && activeElement.tagName === 'INPUT';
            const isButton = activeElement && activeElement.tagName === 'BUTTON';

            // 如果焦点在输入框或按钮上，让元素自己的事件处理
            if (isInputElement || isButton) {
                return;
            }

            // 等待状态下按 Enter = 继续下一题
            if (app.waitingContinue) {
                e.preventDefault();
                app.nextQuestion();
            } else {
                // 非等待状态下按 Enter = 跳过当前题目
                e.preventDefault();
                app.handleSkip();
            }
        }
    });

    // 主题切换
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('vocab_theme', newTheme);
        // 更新按钮文字
        const textEl = document.querySelector('#theme-toggle .nav-text');
        if (textEl) textEl.textContent = newTheme === 'dark' ? '浅色模式' : '深色模式';
    });

    // 如果在 iframe 中嵌入，主动向父窗口请求 API Key
    if (window.parent && window.parent !== window) {
        console.log('[WordMosaic] 检测到嵌入模式，向父窗口请求 API Key...');
        window.parent.postMessage({ type: 'request-planmosaic-api-key' }, '*');
    }
});

// ============ PlanMosaic 嵌入模式：接收父窗口传递的 API Key ============
window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'planmosaic-api-key') return;

    const { provider, key } = e.data;
    if (!key || provider !== 'deepseek') return;

    console.log('[WordMosaic] 收到来自 PlanMosaic 的 API Key');

    // 注入到 agentManager
    if (typeof agentManager !== 'undefined') {
        agentManager.saveApiKey(key);
        // 如果 app 已初始化，更新聊天状态
        if (app && app.updateChatStatus) {
            app.updateChatStatus();
        }
    } else {
        // agentManager 尚未加载，先存入 localStorage
        localStorage.setItem('vocab_deepseek_api_key', key);
    }
});
