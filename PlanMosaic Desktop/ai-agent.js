// AI Agent - mosaïque Mosa
(function() {
    // TODO i18n: 中文硬编码字符串标记 — 未来迭代需集中管理
    let conversationHistory = [];
    let archivedConversations = [];
    let uploadedImages = [];
    let isTyping = false;
    let typingTimeout = null;
    let isInitialized = false;
    let _mosaProfileText = '';
    let _profileGenPending = false;
    let _lastProfileGenCount = 0;
    let _profileGenFailCount = 0;
    let _activeBlobUrls = [];
    let _activeDpBlobUrls = [];
    let _profileUpdateTimer = null;
    let _saveHistoryLock = Promise.resolve();
    let _cachedStartupScan = null;

    function estimateTokenCount(messages) {
        if (!messages || messages.length === 0) return 0;
        var total = 0;
        for (var i = 0; i < messages.length; i++) {
            var content = messages[i].content || '';
            for (var j = 0; j < content.length; j++) {
                var code = content.charCodeAt(j);
                if (code >= 0x4E00 && code <= 0x9FFF) {
                    total += 0.5;
                } else {
                    total += 0.25;
                }
            }
        }
        return Math.ceil(total);
    }

    async function getMaxTokens() {
        try {
            if (getIsElectron()) {
                var keys = await window.electronAPI.getApiKeys();
                var provider = keys.currentProvider || '';
                var modelName = provider === 'qwen' ? (keys.qwen && keys.qwen.model) : (keys.deepseek && keys.deepseek.model);
                if (modelName && (modelName.includes('pro') || modelName.includes('reasoner'))) {
                    return 16000;
                }
            }
        } catch (e) {
            console.warn('[Agent] Failed to get model info for token limit:', e);
        }
        return 8000;
    }

    function parseDateSafe(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        if (dateStr.trim() === '') return null;
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d;
    }

    // 深度规划模式状态
    let isDeepPlanningMode = false;
    let deepPlanningHistory = [];
    let currentDeepPlanningSession = null;
    let dpTypingTimeout = null;
    let isDpStreaming = false;

    function getIsElectron() {
        return typeof window.electronAPI !== 'undefined';
    }

    async function initialize() {
        if (isInitialized) return;
        isInitialized = true;
        await loadData();

        if (getIsElectron()) {
            window.electronAPI.onApiKeyConfigured(({ provider }) => {
                _profileGenFailCount = 0;
                console.log(`[Agent] API key configured for ${provider}, reset profile gen fail count`);
            });
        }
        setTimeout(() => {
            const modal = document.getElementById('agentModal');
            if (modal) modal.addEventListener('click', (e) => {
                if (e.target === modal) closeAgentModal();
            });
            setTimeout(() => performStartupScan(), 500);
        }, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 0);
    }

    async function loadData() {
        try {
            const isElectron = getIsElectron();
            if (isElectron) {
                const hist = await window.electronAPI.getAgentHistory();
                conversationHistory = hist.conversations || [];
                archivedConversations = hist.archivedConversations || [];
                window.scheduleData = await window.electronAPI.getScheduleData();
                if (hist._corrupted) {
                    delete hist._corrupted;
                    if (typeof showToast === 'function') { showToast('数据文件已损坏，已自动备份。部分数据可能丢失。', 'warning'); }
                }
                if (window.scheduleData && window.scheduleData._corrupted) {
                    delete window.scheduleData._corrupted;
                    if (typeof showToast === 'function') { showToast('数据文件已损坏，已自动备份。部分数据可能丢失。', 'warning'); }
                }
            } else {
                const [hRes, dRes] = await Promise.all([
                    fetch('/api/agent-history'),
                    fetch('data.json?' + Date.now())
                ]);
                const hist = await hRes.json();
                conversationHistory = hist.conversations || [];
                archivedConversations = hist.archivedConversations || [];
                window.scheduleData = await dRes.json();
                if (hist._corrupted) {
                    delete hist._corrupted;
                    if (typeof showToast === 'function') { showToast('数据文件已损坏，已自动备份。部分数据可能丢失。', 'warning'); }
                }
                if (window.scheduleData && window.scheduleData._corrupted) {
                    delete window.scheduleData._corrupted;
                    if (typeof showToast === 'function') { showToast('数据文件已损坏，已自动备份。部分数据可能丢失。', 'warning'); }
                }
            }
        } catch (e) {
            console.error('[AI Agent] Load error:', e);
            if (typeof showToast === 'function') { showToast('数据加载失败，请刷新页面', 'error'); }
        }
    }

    async function performStartupScan() {
        if (!getIsElectron() || !window.electronAPI.getStartupScan) {
            performStartupScanWeb();
            return;
        }
        try {
            const scan = await window.electronAPI.getStartupScan();
            const now = new Date();
            const hour = now.getHours();
            
            let greeting;
            if (hour >= 6 && hour < 12) greeting = '早上好呀～☀️';
            else if (hour >= 12 && hour < 17) greeting = '下午好～🌿';
            else if (hour >= 17 && hour < 22) greeting = '晚上好～🌙';
            else greeting = '夜深了呢～🌙';
            
            let content = greeting + '\n';
            
            if (scan.todaySchedule && scan.todaySchedule.timeSlots && scan.todaySchedule.timeSlots.length > 0) {
                content += '\n今天 ' + scan.today + ' 的日程是这样的：\n';
                scan.todaySchedule.timeSlots.forEach(s => {
                    content += `· ${s.time} ${s.activity}\n`;
                });
                if (scan.todaySchedule.highlights) {
                    content += `\n重点：${scan.todaySchedule.highlights}\n`;
                }
            } else {
                content += '\n今天还没有安排日程呢～要不要一起来规划一下？✨\n';
            }
            
            if (scan.yesterdayIncompleteTasks && scan.yesterdayIncompleteTasks.length > 0) {
                content += '\n对了，昨天好像还有些事情没完成哦 📋：\n';
                scan.yesterdayIncompleteTasks.forEach(t => {
                    content += `· ${t.name}` + (t.estimated ? ` (预计${t.estimated}分钟)` : '') + '\n';
                });
                content += '\n要不要今天接着做呢？💪\n';
            }
            
            content += '\n有什么需要帮忙的尽管说～';

            _cachedStartupScan = content;

            const mainContainer = document.getElementById('agentMainChatContainer');
            if (mainContainer && mainContainer.children.length === 0) {
                addMessageToContainer(mainContainer, 'assistant', content);
            }

            try {
                const keys = await window.electronAPI.getApiKeys();
                const hasAnyKey = keys.deepseek?.configured || keys.qwen?.configured;
                if (!hasAnyKey) {
                    const onboardingHtml = '<div class="onboarding-card"><p>欢迎使用 PlanMosaic！开始前请先配置 AI 服务。</p><button class="onboarding-btn" onclick="if(typeof openSettingsModal===\'function\'){openSettingsModal();setTimeout(function(){var el=document.getElementById(\'apiKeySection\');if(el)el.scrollIntoView({behavior:\'smooth\',block:\'center\'});},300);}">去设置 API Key</button></div>';
                    if (mainContainer) {
                        var card2 = document.createElement('div');
                        card2.innerHTML = onboardingHtml;
                        mainContainer.appendChild(card2);
                        mainContainer.scrollTop = mainContainer.scrollHeight;
                    }
                }
            } catch (e2) {
                console.warn('[Startup Scan] API key check failed:', e2);
            }
        } catch (e) {
            console.error('[Startup Scan] Error:', e);
            var mainContainer = document.getElementById('agentMainChatContainer');
            if (mainContainer && mainContainer.children.length === 0) {
                addMessageToContainer(mainContainer, 'assistant', '早上好呀～☀️\n\n有什么可以帮你的吗？');
            }
        }
    }

    function performStartupScanWeb() {
        var container = document.getElementById('agentChatContainer');
        if (!container || container.children.length > 0) return;

        var data = window.scheduleData;
        if (!data || !data.days) {
            addMessage('assistant', '早上好呀～☀️\n\n有什么可以帮你的吗？');
            return;
        }

        var now = new Date();
        var hour = now.getHours();

        var greeting;
        if (hour >= 6 && hour < 12) greeting = '早上好呀～☀️';
        else if (hour >= 12 && hour < 17) greeting = '下午好～🌿';
        else if (hour >= 17 && hour < 22) greeting = '晚上好～🌙';
        else greeting = '夜深了呢～🌙';

        var todayStr = now.toISOString().split('T')[0];
        var todayData = (data.days || []).find(function(d) { return d.date === todayStr; });

        var content = greeting + '\n';
        if (todayData && todayData.timeSlots && todayData.timeSlots.length > 0) {
            content += '\n今天 ' + todayStr + ' 的日程是这样的：\n';
            todayData.timeSlots.forEach(function(s) {
                content += '· ' + s.time + ' ' + s.activity + '\n';
            });
        } else {
            content += '\n今天还没有安排日程呢～要不要一起来规划一下？✨\n';
        }
        content += '\n有什么需要帮忙的尽管说～';

        addMessage('assistant', content);
    }

    window.openAgentModal = function() {
        const modal = document.getElementById('agentModal');
        const container = document.getElementById('agentChatContainer');
        const input = document.getElementById('agentInput');
        if (!modal || !container || !input) return;

        modal.classList.add('active');

        window._modalStack.push('agent');

        if (container.children.length === 0) {
            if (_cachedStartupScan) {
                addMessage('assistant', _cachedStartupScan);
            } else {
                addMessage('assistant', '在。');
            }
        }

        setTimeout(() => input.focus(), 100);
    };

    window.closeAgentModal = function() {
        if (getIsElectron() && window.electronAPI.removeAllAgentListeners) {
            window.electronAPI.removeAllAgentListeners();
        }
        if (getIsElectron() && window.electronAPI.cancelAgentStream) {
            window.electronAPI.cancelAgentStream();
        }
        if (window._agentResizeObserver) {
            window._agentResizeObserver.disconnect();
            window._agentResizeObserver = null;
        }
        document.getElementById('agentModal').classList.remove('active');
        window._modalStack = window._modalStack.filter(function(t) { return t !== 'agent'; });
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        isTyping = false;
        revokeAllBlobUrls();
    };

    function typeText(element, text, speed = 12, callback) {
        let index = 0;
        isTyping = true;
        var container = document.getElementById('agentChatContainer');
        if (/<[^>]+>/.test(text)) {
            element.innerHTML = formatContent(text);
            if (container) { container.scrollTop = container.scrollHeight; }
            isTyping = false;
            if (callback) callback();
            return;
        }
        var lastScrollTime = 0;
        function type() {
            if (index < text.length) {
                element.textContent += text.charAt(index);
                index++;
                var now = Date.now();
                if (container && now - lastScrollTime > 100) {
                    container.scrollTop = container.scrollHeight;
                    lastScrollTime = now;
                }
                typingTimeout = setTimeout(type, speed);
            } else {
                isTyping = false;
                if (callback) callback();
            }
        }
        type();
    }

    function addMessage(role, content, proposal = null, animate = false, skipSave = false) {
        const container = document.getElementById('agentChatContainer');
        const div = document.createElement('div');
        div.className = 'agent-message ' + role;

        if (role === 'assistant') {
            const nameDiv = document.createElement('div');
            nameDiv.className = 'sender-name';
            nameDiv.textContent = 'Mosa';
            div.appendChild(nameDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        if (animate && role === 'assistant') {
            div.appendChild(contentDiv);
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            typeText(contentDiv, content, 15, () => {
                if (proposal) addProposalToMessage(div, proposal);
            });
        } else {
            contentDiv.innerHTML = formatContent(content);
            div.appendChild(contentDiv);
            if (proposal) addProposalToMessage(div, proposal);
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }

        if (!skipSave) addToHistory(role, content, proposal);
    }

    function addMessageToContainer(container, role, content, proposal, skipSave) {
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'agent-message ' + role;

        if (role === 'assistant') {
            const nameDiv = document.createElement('div');
            nameDiv.className = 'sender-name';
            nameDiv.textContent = 'Mosa';
            div.appendChild(nameDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        try {
            contentDiv.innerHTML = sanitizeHtml(formatContent(content));
        } catch (e) {
            contentDiv.textContent = content;
        }
        div.appendChild(contentDiv);

        if (proposal) {
            const actions = document.createElement('div');
            actions.className = 'proposal-actions';
            actions.innerHTML = '<button class="proposal-btn approve" onclick="approveProposal()">确认执行</button><button class="proposal-btn reject" onclick="rejectProposal()">取消</button>';
            div.appendChild(actions);
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        if (!skipSave) addToHistory(role, content, proposal);
    }

    function renderThinkingChain(messageDiv, content, reasoningContent) {
        if (messageDiv.querySelector('.thinking-process')) return;

        let thinkingText = '';
        if (reasoningContent && reasoningContent.trim()) {
            thinkingText = reasoningContent.trim();
        } else if (content && typeof content === 'string') {
            const match = content.match(/【思考】([\s\S]*?)【\/思考】/);
            if (match) {
                thinkingText = match[1].trim();
            }
        }
        if (!thinkingText) return;

        const processDiv = document.createElement('div');
        processDiv.className = 'thinking-process has-thinking';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'thinking-header';
        headerDiv.onclick = function(e) {
            e.stopPropagation();
            processDiv.classList.toggle('expanded');
        };

        headerDiv.innerHTML = '<span class="thinking-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><span class="thinking-title">思考</span><span class="thinking-toggle">▼</span>';
        processDiv.appendChild(headerDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'thinking-content';
        contentDiv.textContent = thinkingText;
        processDiv.appendChild(contentDiv);

        const nameEl = messageDiv.querySelector('.sender-name');
        if (nameEl && nameEl.nextSibling) {
            messageDiv.insertBefore(processDiv, nameEl.nextSibling);
        } else {
            messageDiv.insertBefore(processDiv, messageDiv.firstChild);
        }
    }

    function addProposalToMessage(messageDiv, proposal) {
        const proposalDiv = document.createElement('div');
        proposalDiv.className = 'schedule-proposal';
        proposalDiv.innerHTML = renderProposal(proposal);
        messageDiv.appendChild(proposalDiv);
    }

    function addToHistory(role, content, proposal) {
        var entry = { role: role, content: content, timestamp: new Date().toISOString() };
        if (proposal) {
            proposal._id = 'proposal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            proposal._status = 'pending';
            entry.proposal = proposal;
        }
        conversationHistory.push(entry);

        if (conversationHistory.length >= 100) {
            var oldest = conversationHistory.splice(0, 50);
            archivedConversations = archivedConversations.concat(oldest);
            if (archivedConversations.length > 500) {
                archivedConversations = archivedConversations.slice(-500);
            }
        }
    }

    function formatContent(content) {
        if (typeof content !== 'string') return content;
        return content
            .replace(/【思考】[\s\S]*?【\/思考】/g, '')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    function renderProposal(proposal) {
        if (proposal.compareHtml) return proposal.compareHtml;

        // 批量删除
        if (proposal.type === 'batch_delete_schedule' || proposal.type === 'batch_delete_tasks' || proposal.type === 'batch_delete_big_tasks') {
            const typeName = proposal.type === 'batch_delete_schedule' ? '批量删除日程' :
                              proposal.type === 'batch_delete_tasks' ? '批量删除任务' : '批量删除大任务';
            const items = proposal.datesDetail || proposal.tasksDetail || [];
            const count = proposal.dates?.length || proposal.tasks?.length || proposal.taskNames?.length || 0;

            let html = `<div class="proposal-header">${typeName}</div>`;
            if (proposal.reason) html += `<div class="proposal-reason-bar"><strong>原因：</strong>${proposal.reason}</div>`;
            html += '<div class="proposal-compare-container"><div class="proposal-column proposal-original"><div class="proposal-column-header">将删除</div>';

            if (items.length > 0) {
                items.forEach(item => {
                    html += `<div class="proposal-date-block"><div class="proposal-date-title">${item.date || ''}</div>`;
                    const slots = item.timeSlots || (item.taskName ? [{ activity: item.taskName, time: '', estimated: item.estimated }] : []);
                    slots.forEach(s => {
                        html += `<div class="proposal-item item-deleted">`;
                        html += s.time ? `<span class="item-time">${s.time}</span>` : '';
                        html += `<span class="item-activity">${s.activity || ''}</span>`;
                        if (s.estimated) html += `<span class="task-estimated">${s.estimated}分钟</span>`;
                        html += '</div>';
                    });
                    html += '</div>';
                });
            } else {
                html += `<div class="empty-text">共 ${count} 项</div>`;
            }

            html += '</div></div>';
            html += '<div class="proposal-actions">';
            html += '<button class="proposal-btn approve" onclick="window.approveProposal()">确认</button>';
            html += '<button class="proposal-btn reject" onclick="window.rejectProposal()">取消</button>';
            html += '</div>';
            return html;
        }

        // 通用修改提案
        let html = '<div class="proposal-header">日程修改建议</div>';
        if (proposal.reason) html += `<div class="proposal-reason-bar"><strong>原因：</strong>${proposal.reason}</div>`;

        html += '<div class="proposal-compare-container">';

        // 左列：原始
        html += '<div class="proposal-column proposal-original"><div class="proposal-column-header">原始安排</div>';
        if (proposal.originalDetail) {
            const d = proposal.originalDetail;
            html += `<div class="proposal-date-title">${d.date}</div>`;
            (d.timeSlots || []).forEach(s => {
                const isDeleted = proposal.changes?.some(c => c.includes(s.time));
                html += `<div class="proposal-item${isDeleted ? ' item-deleted' : ''}">`;
                html += `<span class="item-time">${s.time}</span>`;
                html += `<span class="item-activity">${s.activity}</span>`;
                if (s.detail) html += `<span class="item-detail">${s.detail}</span>`;
                html += '</div>';
            });
            (d.tasks || []).forEach(t => {
                html += `<div class="proposal-task"><span class="task-name">${t.name}</span><span class="task-estimated">${t.estimated}分钟</span></div>`;
            });
        } else {
            html += `<div class="proposal-date-title">${proposal.date || ''}</div>`;
        }
        html += '</div>';

        // 右列：修改后
        html += '<div class="proposal-column proposal-modified"><div class="proposal-column-header">修改后</div>';
        if (proposal.modifiedPreview?.timeSlots) {
            html += `<div class="proposal-date-title">${proposal.modifiedPreview.date || proposal.date}</div>`;
            proposal.modifiedPreview.timeSlots.forEach(s => {
                html += `<div class="proposal-item item-new"><span class="item-time">${s.time}</span><span class="item-activity">${s.activity}</span></div>`;
            });
        } else if (proposal.changes?.length > 0) {
            html += '<div class="proposal-changes-list">';
            proposal.changes.forEach(c => html += `<div class="change-item">${c}</div>`);
            html += '</div>';
        } else if (proposal.additions?.length > 0) {
            proposal.additions.forEach(s => {
                html += `<div class="proposal-item item-new"><span class="item-time">${s.time}</span><span class="item-activity">${s.activity}</span></div>`;
            });
        }
        html += '</div></div>';

        html += '<div class="proposal-actions">';
        html += '<button class="proposal-btn approve" onclick="window.approveProposal()">确认</button>';
        html += '<button class="proposal-btn reject" onclick="window.rejectProposal()">取消</button>';
        html += '</div>';
        return html;
    }

    window.sendAgentMessage = async function() {
        if (window._isSending) return;
        window._isSending = true;

        var btn, input, chatContainer, typingIndicator;

        try {
            if (!navigator.onLine) {
                if (typeof showToast === 'function') showToast('该功能需要网络连接', 'warning');
                return;
            }

            const mainArea = document.getElementById('agentMainArea');
            const isMainAreaVisible = mainArea && mainArea.offsetParent !== null;

            btn = document.activeElement && (document.activeElement.id === 'agentMainSendBtn' || (document.activeElement.closest && document.activeElement.closest('#agentMainArea')))
                ? document.getElementById('agentMainSendBtn')
                : (document.getElementById('agentSendBtn') || document.querySelector('.agent-send-btn'));
            if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

            if (isTyping) {
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                return;
            }
            if (getIsElectron() && window.electronAPI.removeAllAgentListeners && !window._hasPendingStream) {
                window.electronAPI.removeAllAgentListeners();
            }

            input = isMainAreaVisible ? document.getElementById('agentMainInput') : document.getElementById('agentInput');
            if (!input || !btn) return;

            const msg = input.value.trim();
            if (!msg && uploadedImages.length === 0) {
                if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                if (input) {
                    input.classList.add('shake-input');
                    setTimeout(function() { input.classList.remove('shake-input'); }, 400);
                }
                return;
            }

            chatContainer = document.getElementById(isMainAreaVisible ? 'agentMainChatContainer' : 'agentChatContainer');
            typingIndicator = document.getElementById(isMainAreaVisible ? 'mainTypingIndicator' : 'typingIndicator');

            if (uploadedImages.length > 0) {
                uploadedImages.forEach(function(imgData) {
                    var div = document.createElement('div');
                    div.className = 'agent-message user';
                    var contentDiv = document.createElement('div');
                    contentDiv.className = 'message-content';

                    var thumbImg = document.createElement('img');
                    thumbImg.src = imgData.objectUrl;
                    thumbImg.style.cssText = 'max-width:140px;border-radius:8px;margin:2px 0;';

                    var nameSpan = document.createElement('span');
                    nameSpan.style.cssText = 'display:block;font-size:11px;color:var(--text-secondary);margin-top:2px;';
                    nameSpan.textContent = imgData.name || 'image';

                    contentDiv.appendChild(thumbImg);
                    contentDiv.appendChild(nameSpan);
                    div.appendChild(contentDiv);
                    chatContainer.appendChild(div);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                });
            }
            if (msg) { addMessageToContainer(chatContainer, 'user', msg); input.value = ''; input.style.height = 'auto'; }

            if (typingIndicator) typingIndicator.classList.add('active');

            let data;
            const isElectron = getIsElectron();
            var imageDataUrls = uploadedImages.map(function(img) { return img.dataUrl || img; });

            if (isElectron) {
                const div = document.createElement('div');
                div.className = 'agent-message assistant';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'sender-name';
                nameDiv.innerHTML = 'Mosa <span class="typing-status">thinking</span>';
                div.appendChild(nameDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                div.appendChild(contentDiv);
                chatContainer.appendChild(div);
                chatContainer.scrollTop = chatContainer.scrollHeight;

                let streamedContent = '';

                const streamHandler = (chunk) => {
                    if (chunk.type === 'content') {
                        streamedContent += chunk.content;
                        try {
                            var prevLength = contentDiv._processedLength || 0;
                            var newContent = streamedContent.substring(prevLength);
                            if (newContent.length > 0) {
                                var formatted = formatContent(newContent);
                                contentDiv.insertAdjacentHTML('beforeend', sanitizeHtml(formatted));
                                contentDiv._processedLength = streamedContent.length;
                            }
                        } catch (e) {
                            contentDiv.textContent = streamedContent;
                        }
                        var isUserScrolledUp = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight > 50;
                        if (!isUserScrolledUp) {
                            chatContainer.scrollTop = chatContainer.scrollHeight;
                        }
                    } else if (chunk.type === 'reasoning') {
                        if (!div._thinkingContent) div._thinkingContent = '';
                        div._thinkingContent += chunk.content;
                    } else if (chunk.type === 'retry') {
                        streamedContent = '';
                        contentDiv.innerHTML = '';
                        contentDiv._processedLength = 0;
                        nameDiv.innerHTML = 'Mosa <span class="typing-status">retrying</span>';
                    }
                };

                const statusHandler = (status) => {
                    if (status.phase === 'thinking') {
                        nameDiv.innerHTML = 'Mosa <span class="typing-status">thinking</span>';
                    } else if (status.phase === 'executing_tools') {
                        nameDiv.innerHTML = 'Mosa <span class="typing-status">executing</span>';
                    }
                };

                const doneHandler = () => {
                    window._hasPendingStream = false;
                    if (div._doneHandled) return;
                    div._doneHandled = true;
                    nameDiv.innerHTML = 'Mosa';
                    renderThinkingChain(div, streamedContent, div._thinkingContent);
                    window.electronAPI.removeListener('agent-stream-chunk', streamHandler);
                    window.electronAPI.removeListener('agent-stream-done', doneHandler);
                    window.electronAPI.removeListener('agent-stream-status', statusHandler);
                };

                window._hasPendingStream = true;

                window.electronAPI.onAgentStreamChunk(streamHandler);
                window.electronAPI.onAgentStreamDone(doneHandler);
                window.electronAPI.onAgentStreamStatus(statusHandler);

                var historySlice = conversationHistory.slice(-50);
                var tokenEstimate = estimateTokenCount(historySlice);
                var MAX_TOKENS = await getMaxTokens();
                if (tokenEstimate > MAX_TOKENS) {
                    var sliceSize = 50;
                    while (sliceSize > 5 && estimateTokenCount(conversationHistory.slice(-sliceSize)) > MAX_TOKENS) {
                        sliceSize -= 5;
                    }
                    historySlice = conversationHistory.slice(-sliceSize);
                    if (typeof showToast === 'function') showToast('对话历史较长，已自动截断以适配上下文窗口', 'info');
                }

                data = await window.electronAPI.agentChatStream({
                    message: msg, images: imageDataUrls,
                    history: historySlice, profile: {},
                    userProfileText: getMosaProfile()
                });

                if (typingIndicator) typingIndicator.classList.remove('active');

                if (data.response) {
                    const { content, proposal } = data.response;
                    if (proposal) addProposalToMessage(div, proposal);
                    addToHistory('assistant', content || streamedContent, proposal);
                    await saveHistory();
                }
                if (data.shouldRefresh) { console.log('[AI Agent] shouldRefresh received, refreshing schedule data'); await refreshScheduleData(); }
            } else {
                var historySlice = conversationHistory.slice(-50);
                var tokenEstimate = estimateTokenCount(historySlice);
                var MAX_TOKENS = await getMaxTokens();
                if (tokenEstimate > MAX_TOKENS) {
                    var sliceSize = 50;
                    while (sliceSize > 5 && estimateTokenCount(conversationHistory.slice(-sliceSize)) > MAX_TOKENS) {
                        sliceSize -= 5;
                    }
                    historySlice = conversationHistory.slice(-sliceSize);
                    if (typeof showToast === 'function') showToast('对话历史较长，已自动截断以适配上下文窗口', 'info');
                }

                const res = await fetch('/api/agent-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg, images: imageDataUrls, history: historySlice, profile: {}, userProfileText: getMosaProfile() })
                });
                if (!res.headers.get('content-type') || !res.headers.get('content-type').includes('application/json')) {
                    throw new Error('Invalid response format from server');
                }
                data = await res.json();
                if (typingIndicator) typingIndicator.classList.remove('active');

                if (data.response) {
                    const { content, proposal } = data.response;
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'agent-message assistant';

                    const nDiv = document.createElement('div');
                    nDiv.className = 'sender-name';
                    nDiv.textContent = 'Mosa';
                    msgDiv.appendChild(nDiv);

                    const cDiv = document.createElement('div');
                    cDiv.className = 'message-content';
                    cDiv.innerHTML = formatContent(content);
                    msgDiv.appendChild(cDiv);

                    if (proposal) addProposalToMessage(msgDiv, proposal);

                    chatContainer.appendChild(msgDiv);
                    chatContainer.scrollTop = chatContainer.scrollHeight;

                    addToHistory('assistant', content, proposal);
                    await saveHistory();
                }
                if (data.shouldRefresh) { console.log('[AI Agent] shouldRefresh received (non-streaming), refreshing schedule data'); await refreshScheduleData(); }
            }
        } catch (e) {
            if (typingIndicator) typingIndicator.classList.remove('active');
            isTyping = false;
            let errorMsg = '请求失败，请重试。';
            if (e.message?.includes('401')) errorMsg = 'API Key 无效或未配置。';
            else if (e.message?.includes('429')) errorMsg = '请求频率超限，请稍后重试。';
            addMessageToContainer(chatContainer, 'assistant', errorMsg);
        } finally {
            window._isSending = false;
            if (getIsElectron() && window.electronAPI.removeAllAgentListeners) {
                if (window._hasPendingStream) {
                    await new Promise(function(r) { setTimeout(r, 500); });
                    window._hasPendingStream = false;
                }
                window.electronAPI.removeAllAgentListeners();
            }
        }

        uploadedImages = [];
        updatePreview();
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        if (input) input.focus();
    };

    function getMosaProfile() {
        if (_mosaProfileText) return _mosaProfileText;
        if (window._mosaUserProfile) { _mosaProfileText = window._mosaUserProfile; return _mosaProfileText; }
        return '';
    }

    function checkProfileGeneration() {
        if (_profileGenPending) return;
        if (_profileGenFailCount >= 3) return;
        if (conversationHistory.length - _lastProfileGenCount >= 10) generateUserProfile();
    }

    async function generateUserProfile() {
        _profileGenPending = true;
        const prev = getMosaProfile();
        const recent = conversationHistory.slice(-30);
        const digest = recent.map(m => `${m.role === 'user' ? '用户' : 'Mosa'}: ${(m.content || '').substring(0, 150)}`).join('\n');

        const prompt = prev
            ? `根据对话更新用户画像（20字以内，纯文本）。之前：${prev}\n\n最新：\n${digest}`
            : `从对话提取用户画像（20字以内，纯文本）：\n${digest}`;

        try {
            let text = '';
            if (getIsElectron()) {
                const r = await window.electronAPI.agentChat({ message: prompt, images: [], history: [], profile: {} });
                text = r?.response?.content || '';
            } else {
                const res = await fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt, images: [], history: [], profile: {} }) });
                text = (await res.json())?.response?.content || '';
            }
            if (text) {
                text = text.replace(/\*\*/g, '').replace(/#{1,6}\s/g, '').replace(/\n/g, ' ').trim().substring(0, 20);
                _mosaProfileText = text;
                window._mosaUserProfile = text;
                _lastProfileGenCount = conversationHistory.length;
                _profileGenFailCount = 0;
            } else {
                _lastProfileGenCount = conversationHistory.length;
                _profileGenFailCount++;
            }
        } catch (e) {
            console.warn('画像生成失败:', e);
            _lastProfileGenCount = conversationHistory.length;
            _profileGenFailCount++;
        }
        finally { _profileGenPending = false; }
    }

    async function saveHistory() {
        var prevLock = _saveHistoryLock;
        var timeoutId;
        var timeoutPromise = new Promise(function(_, reject) {
            timeoutId = setTimeout(function() {
                reject(new Error('_saveHistoryLock timeout'));
            }, 30000);
        });
        var resolver;
        var newLock = new Promise(function(resolve) { resolver = resolve; });
        _saveHistoryLock = newLock;

        try {
            if (prevLock) {
                await Promise.race([prevLock, timeoutPromise]);
            }
            clearTimeout(timeoutId);
        } catch (e) {
            console.error('[History] Save lock timeout or error:', e);
            _saveHistoryLock = null;
            return;
        }
        try {
            checkProfileGeneration();
            if (getIsElectron()) {
                await window.electronAPI.saveAgentHistory({ conversations: conversationHistory, archivedConversations: archivedConversations });
            } else {
                await fetch('/api/agent-save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversations: conversationHistory, archivedConversations: archivedConversations })
                });
            }
        } catch (e) {
            if (getIsElectron() && typeof showToast === 'function') { showToast('对话保存失败', 'error'); }
            else { console.error('[AI Agent] Save error:', e); }
        } finally {
            resolver();
        }
    }

    window.handleAgentKeyPress = function(e) {
        if (e.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); }
    };

    window.approveProposal = async function() {
        if (window._isApproving) return;
        window._isApproving = true;

        var proposalBtns = document.querySelectorAll('.proposal-btn');
        proposalBtns.forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });

        var pendingEntry = null;
        for (var i = conversationHistory.length - 1; i >= 0; i--) {
            var entry = conversationHistory[i];
            if (entry.proposal && entry.proposal._status === 'pending') {
                pendingEntry = entry;
                break;
            }
        }
        if (!pendingEntry) {
            proposalBtns.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
            window._isApproving = false;
            if (typeof showToast === 'function') showToast('没有待处理的提案', 'warning');
            return;
        }
        var proposal = pendingEntry.proposal;

        try {
            let result;
            if (getIsElectron()) {
                result = await window.electronAPI.agentApprove({ proposal: proposal });
            } else {
                const res = await fetch('/api/agent-approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposal: proposal })
                });
                result = await res.json();
            }

            if (result.success) {
                proposal._status = 'approved';
                var btnContainer = document.querySelector('.proposal-actions');
                if (btnContainer) {
                    btnContainer.innerHTML = '<span style="color: var(--accent-primary); font-size: 13px;">' + (result.message || '已执行') + ' ✓</span>';
                }
                var count = result.deletedCount || result.modifiedCount || 0;
                var feedbackMsg = result.message || getProposalFeedback(proposal);
                addMessage('assistant', feedbackMsg + (count ? ' 共 ' + count + ' 项。' : ''), null, true);
                await refreshScheduleData();
            } else {
                proposalBtns.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
                addMessage('assistant', '操作失败：' + (result.error || '未知错误'), null, true);
            }
        } catch (e) {
            proposalBtns.forEach(function(b) { b.disabled = false; b.style.opacity = '1'; });
            addMessage('assistant', '操作失败，请重试。', null, true);
        } finally {
            window._isApproving = false;
        }
    };

    function getProposalFeedback(proposal) {
        switch (proposal.type) {
            case 'batch_delete_schedule': return '已批量删除日程';
            case 'batch_delete_tasks': return '已批量删除任务';
            case 'batch_delete_big_tasks': return '已批量删除大任务';
            case 'add_schedule': return '已添加日程';
            case 'modify_schedule': return '已修改日程';
            case 'delete_schedule': return '已删除日程';
            case 'add_task': return '已添加任务';
            case 'complete_task': return '已标记任务完成';
            default: return '操作已完成';
        }
    }

    window.rejectProposal = function() {
        var pendingEntry = null;
        for (var i = conversationHistory.length - 1; i >= 0; i--) {
            var entry = conversationHistory[i];
            if (entry.proposal && entry.proposal._status === 'pending') {
                pendingEntry = entry;
                break;
            }
        }
        if (!pendingEntry) {
            if (typeof showToast === 'function') showToast('没有待处理的提案', 'warning');
            return;
        }
        pendingEntry.proposal._status = 'rejected';

        var proposalBtns = document.querySelectorAll('.proposal-btn');
        proposalBtns.forEach(function(b) { b.disabled = true; b.style.opacity = '0.5'; });

        var btnContainer = document.querySelector('.proposal-actions');
        if (btnContainer) {
            btnContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">已取消</span>';
        }
    };

    window.handleImageUpload = function(e) {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) { showToast('图片过大，请选择小于 5MB 的图片', 'warning'); return; }

        var objectUrl = URL.createObjectURL(file);
        _activeBlobUrls.push(objectUrl);
        var reader = new FileReader();
        reader.onload = function(ev) {
            var dataUrl = ev.target.result;
            var img = new Image();
            img.onload = function() {
                var w = img.width;
                var h = img.height;
                var maxDim = 2048;
                if (w > maxDim || h > maxDim) {
                    var ratio = Math.min(maxDim / w, maxDim / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                var canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                if (compressedDataUrl.length > 2 * 1024 * 1024) {
                    var quality = 0.6;
                    compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                uploadedImages.push({
                    dataUrl: compressedDataUrl,
                    objectUrl: objectUrl,
                    name: file.name,
                    size: file.size,
                    type: 'image/jpeg'
                });
                updatePreview();
                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
                canvas = null;
                img.src = '';
                img = null;
            };
            img.onerror = function() {
                uploadedImages.push({
                    dataUrl: dataUrl,
                    objectUrl: objectUrl,
                    name: file.name,
                    size: file.size,
                    type: file.type
                });
                updatePreview();
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    function updatePreview() {
        const container = document.getElementById('agentImagePreview');
        if (!container) return;
        container.innerHTML = '';
        uploadedImages.forEach(function(img, i) {
            var previewDiv = document.createElement('div');
            previewDiv.className = 'preview-image';

            var imgEl = document.createElement('img');
            imgEl.src = img.objectUrl;

            var btn = document.createElement('button');
            btn.className = 'remove-btn';
            btn.textContent = '✕';
            btn.onclick = function() { window.removeUploadedImage(i); };

            previewDiv.appendChild(imgEl);
            previewDiv.appendChild(btn);
            container.appendChild(previewDiv);
        });
    }

    window.removeUploadedImage = function(i) {
        var img = uploadedImages[i];
        if (img && img.objectUrl) {
            URL.revokeObjectURL(img.objectUrl);
            _activeBlobUrls = _activeBlobUrls.filter(function(u) { return u !== img.objectUrl; });
        }
        uploadedImages.splice(i, 1);
        updatePreview();
    };

    window.archiveConversations = async function() {
        var confirmed = await showConfirmToast('确定要归档当前对话吗？');
        if (!confirmed) return;

        if (getIsElectron()) {
            try {
                await window.electronAPI.archiveConversations();
                await loadData();
            } catch (e) {
                console.warn('[Archive] Electron error:', e);
            }
            conversationHistory = [];
            archivedConversations = [];
            document.getElementById('agentChatContainer').innerHTML = '';
            revokeAllBlobUrls();
            resetConversationState();
        } else {
            try {
                var archived = localStorage.getItem('mosaique-archived-conversations');
                var archivedList = archived ? JSON.parse(archived) : [];
                archivedList.push({
                    conversations: conversationHistory,
                    archivedConversations: archivedConversations,
                    archivedAt: new Date().toISOString()
                });
                if (archivedList.length > 5) archivedList = archivedList.slice(-5);
                localStorage.setItem('mosaique-archived-conversations', JSON.stringify(archivedList));
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    if (archivedList.length > 1) {
                        archivedList = archivedList.slice(-2);
                        try {
                            localStorage.setItem('mosaique-archived-conversations', JSON.stringify(archivedList));
                        } catch (e2) {
                            console.warn('[Archive] Storage still full after cleanup:', e2);
                        }
                    }
                } else {
                    console.warn('[Archive] Save error:', e);
                }
            }
            conversationHistory = [];
            archivedConversations = [];
            document.getElementById('agentChatContainer').innerHTML = '';
            await saveHistory();
            resetConversationState();
        }
    };

    window.clearConversations = async function() {
        var confirmed = await showConfirmToast('确定要清空对话吗？');
        if (!confirmed) return;

        if (getIsElectron()) {
            try {
                await window.electronAPI.clearConversations();
                await loadData();
            } catch (e) {
                console.warn('[Clear] Electron error, falling back to local clear:', e);
            }
            conversationHistory = [];
            archivedConversations = [];
            document.getElementById('agentChatContainer').innerHTML = '';
            revokeAllBlobUrls();
            resetConversationState();
        } else {
            conversationHistory = [];
            archivedConversations = [];
            document.getElementById('agentChatContainer').innerHTML = '';
            try {
                await saveHistory();
            } catch (e) {
                console.warn('[Clear] Save error:', e);
            }
            resetConversationState();
        }
        if (typeof showToast === 'function') { showToast('对话已清空', 'info'); }
    };

    function showConfirmToast(message) {
        return new Promise(function(resolve) {
            if (typeof window.showConfirmToast === 'function') {
                window.showConfirmToast(message, function() { resolve(true); }, function() { resolve(false); });
            } else {
                resolve(confirm(message));
            }
        });
    }

    function resetConversationState() {
        isTyping = false;
        uploadedImages = [];
        revokeAllBlobUrls();
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        if (dpTypingTimeout) { clearTimeout(dpTypingTimeout); dpTypingTimeout = null; }
        if (_profileUpdateTimer) { clearTimeout(_profileUpdateTimer); _profileUpdateTimer = null; }
        if (typeof showToast === 'function') { showToast('对话已清空', 'info'); }
    }

    function revokeAllBlobUrls() {
        _activeBlobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
        _activeBlobUrls = [];
        _activeDpBlobUrls.forEach(function(url) { URL.revokeObjectURL(url); });
        _activeDpBlobUrls = [];
    }

    async function refreshScheduleData() {
        var retries = 0;
        while ((window._isSaving || window._isApproving) && retries < 3) {
            await new Promise(r => setTimeout(r, 500));
            retries++;
        }
        window._isDataWriting = true;
        try {
            await new Promise(r => setTimeout(r, 100));
            if (getIsElectron()) {
                window.scheduleData = await window.electronAPI.getScheduleData();
            } else {
                const dRes = await fetch('data.json?' + Date.now());
                window.scheduleData = await dRes.json();
            }
            if (typeof window.renderCalendar === 'function') window.renderCalendar();
            if (typeof window.renderTimeSidebar === 'function') {
                var sidebarDate = (typeof currentEditDate !== 'undefined' && currentEditDate) || (typeof getTodayDateString === 'function' ? getTodayDateString() : new Date().toISOString().split('T')[0]);
                window.renderTimeSidebar(sidebarDate);
                var sidebarSlots = window.scheduleData?.schedules?.[sidebarDate]?.timeSlots;
                console.log('[AI Agent] renderTimeSidebar called for', sidebarDate, 'slots:', sidebarSlots ? sidebarSlots.length : 0);
            }
            if (typeof window.renderBigTasks === 'function') {
                window.bigTasks = window.scheduleData.bigTasks || [];
                window.renderBigTasks();
            }
            try {
                var allData;
                var raw = localStorage.getItem('mosaique-user-data');
                if (raw) {
                    try { allData = JSON.parse(raw); } catch (_) { allData = {}; }
                }
                if (!allData) allData = {};
                allData.startDate = window.scheduleData.startDate;
                allData.endDate = window.scheduleData.endDate;
                allData.schedules = window.scheduleData.schedules;
                allData.bigTasks = window.scheduleData.bigTasks;
                allData.bigTaskHistory = window.scheduleData.bigTaskHistory;
                allData.scheduleTemplates = window.scheduleData.scheduleTemplates;
                localStorage.setItem('mosaique-user-data', JSON.stringify(allData));
                if (getIsElectron()) {
                    window.electronAPI.saveScheduleDataLocal(window.scheduleData);
                }
            } catch (saveErr) {
                console.warn('[AI Agent] Failed to persist refreshed data:', saveErr);
            }
        } catch (e) { console.warn('[AI Agent] Refresh error:', e); } finally {
            window._isDataWriting = false;
        }
    }

    // ============================================
    // 深度规划模式 - Deep Planning Mode
    // ============================================

    function getDPStorageKey() {
        var user = window._currentUsername || 'default';
        return 'mosa-deep-planning-data-' + user;
    }

    function loadDeepPlanningHistory() {
        try {
            const raw = localStorage.getItem(getDPStorageKey());
            if (!raw) { deepPlanningHistory = []; currentDeepPlanningSession = null; return; }
            const data = JSON.parse(raw);
            if (!data.currentSessionId) { deepPlanningHistory = []; currentDeepPlanningSession = null; return; }
            currentDeepPlanningSession = data.currentSessionId;
            const session = (data.sessions || []).find(s => s.id === currentDeepPlanningSession);
            deepPlanningHistory = (session?.messages || []).map(m => ({ role: m.role, content: m.content }));
        } catch (e) {
            console.error('[Deep Planning] Load history error:', e);
            deepPlanningHistory = [];
            currentDeepPlanningSession = null;
        }
    }

    function saveDeepPlanningData() {
        try {
            let data;
            const raw = localStorage.getItem(getDPStorageKey());
            if (raw) {
                try { data = JSON.parse(raw); } catch (e) { data = null; }
            }
            if (!data) {
                data = { sessions: [], currentSessionId: null, profileExtract: {} };
            }

            if (!currentDeepPlanningSession) {
                currentDeepPlanningSession = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
                data.currentSessionId = currentDeepPlanningSession;
            }

            let session = (data.sessions || []).find(s => s.id === currentDeepPlanningSession);
            if (!session) {
                session = { id: currentDeepPlanningSession, startTime: new Date().toISOString(), endTime: null, messages: [], summary: '' };
                if (!Array.isArray(data.sessions)) data.sessions = [];
                data.sessions.push(session);
                data.sessions = data.sessions.slice(-10);
            }

            session.messages = deepPlanningHistory.map(m => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || new Date().toISOString()
            }));

            if (session.messages.length > 200) {
                session.messages = session.messages.slice(-200);
            }

            if (deepPlanningHistory.length > 0 && !session.endTime) {
                session.endTime = new Date().toISOString();
            }

            localStorage.setItem(getDPStorageKey(), JSON.stringify(data));
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                if (data.sessions && data.sessions.length > 1) {
                    data.sessions = data.sessions.slice(-5);
                    try {
                        localStorage.setItem(getDPStorageKey(), JSON.stringify(data));
                    } catch (e2) {
                        console.error('[Deep Planning] Storage still full after cleanup:', e2);
                    }
                }
            } else {
                console.error('[Deep Planning] Save error:', e);
            }
        }
    }

    function addDPMessage(role, content) {
        const container = document.getElementById('dpChatContainer');
        if (!container) return;

        const div = document.createElement('div');
        div.className = 'dp-message ' + role;

        if (role === 'assistant') {
            const nameDiv = document.createElement('div');
            nameDiv.className = 'dp-sender-name';
            nameDiv.textContent = 'Mosa';
            div.appendChild(nameDiv);
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'dp-message-content';
        contentDiv.innerHTML = formatContent(content);

        div.appendChild(contentDiv);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        if (role === 'user') {
            deepPlanningHistory.push({ role: 'user', content: content, timestamp: new Date().toISOString() });
        }
    }

    function typeDPText(text) {
        return new Promise((resolve) => {
            const container = document.getElementById('dpChatContainer');
            if (!container) { resolve(); return; }

            text = String(text || '');
            if (!text.trim()) { resolve(); return; }

            const div = document.createElement('div');
            div.className = 'dp-message assistant';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'dp-sender-name';
            nameDiv.innerHTML = 'Mosa <span class="dp-typing-status">thinking</span>';
            div.appendChild(nameDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'dp-message-content';
            div.appendChild(contentDiv);
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;

            if (text.length > 300) {
                nameDiv.innerHTML = 'Mosa';
                contentDiv.innerHTML = formatContent(text);
                isDpStreaming = false;
                updateDPSendButtonState();
                resolve();
                return;
            }

            isDpStreaming = true;
            let index = 0;

            function type() {
                if (index < text.length) {
                    contentDiv.textContent += text.charAt(index);
                    index++;
                    container.scrollTop = container.scrollHeight;
                    dpTypingTimeout = setTimeout(type, 5);
                } else {
                    nameDiv.innerHTML = 'Mosa';
                    contentDiv.innerHTML = formatContent(text);
                    isDpStreaming = false;
                    dpTypingTimeout = null;
                    updateDPSendButtonState();
                    resolve();
                }
            }

            type();
        });
    }

    function updateDPSendButtonState() {
        const btn = document.querySelector('.dp-send-btn');
        if (!btn) return;
        btn.disabled = isDpStreaming;
        btn.style.opacity = isDpStreaming ? '0.5' : '1';
        btn.style.cursor = isDpStreaming ? 'not-allowed' : 'pointer';
    }

    function scheduleProfileUpdate() {
        if (_profileUpdateTimer) { clearTimeout(_profileUpdateTimer); }
        _profileUpdateTimer = setTimeout(async () => {
            try {
                if (deepPlanningHistory.length < 2) return;
                const recentMessages = deepPlanningHistory.slice(-10).map(m => `${m.role === 'user' ? '用户' : 'Mosa'}: ${(m.content || '').substring(0, 200)}`).join('\n');

                const dpProfileUrl = getIsElectron() ? 'http://localhost:8080' : '';
                const res = await fetch(dpProfileUrl + '/api/deep-planning-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversation: recentMessages })
                });

                if (!res.headers.get('content-type') || !res.headers.get('content-type').includes('application/json')) {
                    throw new Error('Invalid response format from deep planning profile');
                }
                const result = await res.json();
                if (result.profileExtract) {
                    const rawData = localStorage.getItem(getDPStorageKey());
                    if (rawData) {
                        const data = JSON.parse(rawData);
                        data.profileExtract = { ...data.profileExtract, ...result.profileExtract };
                        localStorage.setItem(getDPStorageKey(), JSON.stringify(data));
                    }
                    window.mosaProfile = result.profileExtract;
                }
            } catch (e) {
                console.error('[Deep Planning] Profile update error:', e);
            }
        }, 10000);
    }

    window.openDeepPlanningModal = async function() {
        const modal = document.getElementById('deepPlanningModal');
        const container = document.getElementById('dpChatContainer');
        if (!modal || !container) return;

        isDeepPlanningMode = true;
        modal.classList.add('open');

        window._modalStack.push('deepPlanning');

        loadDeepPlanningHistory();

        if (deepPlanningHistory.length > 0 && container.children.length === 0) {
            var confirmed = await showConfirmToast('检测到上次未完成的规划，是否恢复？');
            if (confirmed) {
                deepPlanningHistory.forEach(function(m) {
                    addDPMessage(m.role, m.content);
                });
            } else {
                deepPlanningHistory = [];
                currentDeepPlanningSession = null;
                addDPMessage('assistant', '你好。我是Mosa的战略规划模式。\n\n在这个模式下，我们可以一起探讨你的长期目标、人生方向和战略决策。不需要寒暄，直接告诉我你在思考什么。');
            }
        } else if (container.children.length === 0) {
            addDPMessage('assistant', '你好。我是Mosa的战略规划模式。\n\n在这个模式下，我们可以一起探讨你的长期目标、人生方向和战略决策。不需要寒暄，直接告诉我你在思考什么。');
        }

        setTimeout(() => {
            const input = document.getElementById('dpInput');
            if (input) input.focus();
        }, 100);
    };

    window.closeDeepPlanningModal = function() {
        const modal = document.getElementById('deepPlanningModal');
        if (!modal) return;

        modal.classList.remove('open');
        window._modalStack = window._modalStack.filter(function(t) { return t !== 'deepPlanning'; });
        isDeepPlanningMode = false;

        if (dpTypingTimeout) { clearTimeout(dpTypingTimeout); dpTypingTimeout = null; }
        isDpStreaming = false;

        if (window._dpDragCleanup) {
            window._dpDragCleanup();
            window._dpDragCleanup = null;
        }

        saveDeepPlanningData();
        if (typeof showToast === 'function') { showToast('规划已保存 ✓', 'info'); }
        scheduleProfileUpdate();
    };

    window.sendDeepPlanningMessage = async function() {
        const input = document.getElementById('dpInput');
        const text = input ? input.value.trim() : '';
        if (!text || isDpStreaming) return;

        addDPMessage('user', text);
        input.value = '';

        var container = document.getElementById('dpChatContainer');
        var loadingDiv = document.createElement('div');
        loadingDiv.className = 'dp-loading';
        loadingDiv.textContent = 'Mosa 正在深度思考... 🌿';
        if (container) { container.appendChild(loadingDiv); container.scrollTop = container.scrollHeight; }

        isDpStreaming = true;
        updateDPSendButtonState();

        try {
            const dpBaseUrl = getIsElectron() ? 'http://localhost:8080' : '';
            const response = await fetch(dpBaseUrl + '/api/deep-planning-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: deepPlanningHistory,
                    profile: window.mosaProfile || {}
                })
            });

            if (!response.headers.get('content-type') || !response.headers.get('content-type').includes('application/json')) {
                throw new Error('Invalid response format from deep planning chat');
            }
            const data = await response.json();

            if (loadingDiv && loadingDiv.parentNode) { loadingDiv.parentNode.removeChild(loadingDiv); }

            console.debug('[Deep Planning] Raw API response:', JSON.stringify(data).substring(0, 200));

            if (data.error) {
                addDPMessage('assistant', '抱歉，处理请求时出现错误：' + data.error);
            } else {
                const replyContent = data.response?.content || data.content || data.response || '（无回复）';
                console.log('[Deep Planning] Reply content length:', String(replyContent).length);
                await typeDPText(String(replyContent));
            }

            deepPlanningHistory.push({ role: 'assistant', content: data.response?.content || data.content || '', timestamp: new Date().toISOString() });
            saveDeepPlanningData();

        } catch (error) {
            if (loadingDiv && loadingDiv.parentNode) { loadingDiv.parentNode.removeChild(loadingDiv); }
            console.error('[Deep Planning] API error:', error);
            addDPMessage('assistant', '网络连接失败，请检查服务器是否运行。');
        }

        isDpStreaming = false;
        updateDPSendButtonState();
    };

    window.handleDPKeyPress = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window.sendDeepPlanningMessage();
        }
    };

    window.generateReActLog = async function() {
        if (!conversationHistory || conversationHistory.length === 0) {
            showToast('暂无对话历史，请先进行对话', 'warning');
            return;
        }

        try {
            const isElectron = getIsElectron();
            const baseUrl = isElectron ? 'http://localhost:8080' : '';

            const resp = await fetch(baseUrl + '/api/generate-react-log?full=true', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: conversationHistory })
            });

            if (!resp.ok) throw new Error('请求失败');
            if (!resp.headers.get('content-type') || !resp.headers.get('content-type').includes('application/json')) {
                throw new Error('Invalid response format from react log');
            }

            const data = await resp.json();
            if (data.success && data.react_log) {
                _currentReActLogFull = data.react_log;
                document.getElementById('reactLogText').textContent = data.react_log;
                document.getElementById('reactLogModal').style.display = 'flex';
            } else {
                showToast('生成ReAct记录失败', 'error');
            }
        } catch (e) {
            console.error('ReAct log generation error:', e);
            showToast('生成ReAct记录时出错，请检查网络连接', 'error');
        }
    };

    window.closeReActLog = function() {
        document.getElementById('reactLogModal').style.display = 'none';
    };

    window.copyReActLog = function() {
        const text = document.getElementById('reactLogText').textContent;
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('已复制到剪贴板', 'success');
            }).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    };

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            showToast('已复制到剪贴板', 'success');
        } catch (e) {
            showToast('复制失败，请手动选择文本复制', 'error');
        }
        document.body.removeChild(textarea);
    }

    document.addEventListener('click', function(e) {
        const modal = document.getElementById('reactLogModal');
        if (modal && e.target === modal) {
            closeReActLog();
        }
    });

    function reactTextToMarkdown(text) {
        if (!text) return text;
        var lines = text.split('\n');
        var result = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.startsWith('Question:')) {
                result.push('## Question');
                result.push('');
                result.push(line.replace('Question: ', ''));
                result.push('');
            } else if (line.startsWith('Thought:')) {
                result.push('### Thought');
                result.push('');
                result.push(line.replace('Thought: ', ''));
                result.push('');
            } else if (line.startsWith('Action:')) {
                result.push('### Action');
                result.push('');
                result.push('```');
                result.push(line.replace('Action: ', ''));
                result.push('```');
                result.push('');
            } else if (line.startsWith('Observation:')) {
                result.push('### Observation');
                result.push('');
                var obsContent = line.replace('Observation: ', '');
                if (obsContent.trim().startsWith('{') || obsContent.trim().startsWith('[')) {
                    result.push('```json');
                    result.push(obsContent);
                    result.push('```');
                } else {
                    result.push('> ' + obsContent);
                }
                result.push('');
            } else if (line.startsWith('Final Answer:')) {
                result.push('## Final Answer');
                result.push('');
                result.push(line.replace('Final Answer: ', ''));
                result.push('');
            } else {
                result.push(line);
            }
        }
        return result.join('\n');
    }

    window.downloadReActLog = async function(format) {
        var content = _currentReActLogFull;
        if (!content) {
            var reactText = document.getElementById('reactLogText');
            if (!reactText || !reactText.textContent) {
                if (typeof showToast === 'function') showToast('暂无日志内容', 'warning');
                return;
            }
            content = reactText.textContent;
        }

        var isElectron = getIsElectron();
        var now = new Date();
        var ts = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');

        if (format === 'md') {
            content = reactTextToMarkdown(content);
        }

        if (isElectron && window.electronAPI.saveReActFile) {
            var ext = format === 'md' ? 'md' : 'txt';
            var defaultName = 'ReAct_日志_' + ts + '.' + ext;
            var result = await window.electronAPI.saveReActFile({ content: content, defaultName: defaultName });
            if (result.success) {
                if (typeof showToast === 'function') showToast('已导出到: ' + result.filePath, 'success');
            } else if (!result.cancelled) {
                if (typeof showToast === 'function') showToast('导出失败: ' + (result.error || '未知错误'), 'error');
            }
        } else {
            var ext = format === 'md' ? 'md' : 'txt';
            var mimeType = format === 'md' ? 'text/markdown' : 'text/plain';
            var filename = 'ReAct_日志_' + ts + '.' + ext;
            var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') showToast('下载完成: ' + filename, 'success');
        }
    };

    window.clearAgentCaches = function() {
        conversationHistory = [];
        archivedConversations = [];
        deepPlanningHistory = [];
        currentDeepPlanningSession = null;
        isDeepPlanningMode = false;
        _mosaProfileText = '';
        if (window._mosaUserProfile !== undefined) {
            window._mosaUserProfile = '';
        }
        _lastProfileGenCount = 0;
        _profileGenFailCount = 0;
        revokeAllBlobUrls();
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        if (dpTypingTimeout) { clearTimeout(dpTypingTimeout); dpTypingTimeout = null; }
        isTyping = false;
        isDpStreaming = false;
    };

    window.resetAllState = async function(username) {
        window._currentUsername = username || '';
        conversationHistory = [];
        archivedConversations = [];
        deepPlanningHistory = [];
        currentDeepPlanningSession = null;
        isDeepPlanningMode = false;
        _mosaProfileText = '';
        window._mosaUserProfile = null;
        _profileGenFailCount = 0;
        _lastProfileGenCount = 0;
        _profileGenPending = false;
        revokeAllBlobUrls();
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        if (dpTypingTimeout) { clearTimeout(dpTypingTimeout); dpTypingTimeout = null; }
        isTyping = false;
        isDpStreaming = false;

        var agentChatContainer = document.getElementById('agentChatContainer');
        if (agentChatContainer) agentChatContainer.innerHTML = '';
        var agentMainChatContainer = document.getElementById('agentMainChatContainer');
        if (agentMainChatContainer) agentMainChatContainer.innerHTML = '';

        isInitialized = false;

        await loadData();
        performStartupScan();
    };
})();
