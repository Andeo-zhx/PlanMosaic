// AI Agent - mosaïque Mosa
(function() {
    let conversationHistory = [];
    let uploadedImages = [];
    let isTyping = false;
    let typingTimeout = null;
    let isInitialized = false;
    let _mosaProfileText = '';
    let _profileGenPending = false;
    let _lastProfileGenCount = 0;

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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAgentModal();
        });
        setTimeout(() => {
            const modal = document.getElementById('agentModal');
            if (modal) modal.addEventListener('click', (e) => {
                if (e.target === modal) closeAgentModal();
            });
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
                window.scheduleData = await window.electronAPI.getScheduleData();
            } else {
                const [hRes, dRes] = await Promise.all([
                    fetch('/api/agent-history'),
                    fetch('data.json?' + Date.now())
                ]);
                const hist = await hRes.json();
                conversationHistory = hist.conversations || [];
                window.scheduleData = await dRes.json();
            }
        } catch (e) {
            console.error('[AI Agent] Load error:', e);
        }
    }

    window.openAgentModal = function() {
        const modal = document.getElementById('agentModal');
        const container = document.getElementById('agentChatContainer');
        const input = document.getElementById('agentInput');
        if (!modal || !container || !input) return;

        modal.classList.add('active');

        if (container.children.length === 0) {
            addMessage('assistant', '在。');
        }

        setTimeout(() => input.focus(), 100);
    };

    window.closeAgentModal = function() {
        document.getElementById('agentModal').classList.remove('active');
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        isTyping = false;
    };

    function typeText(element, text, speed = 12, callback) {
        let index = 0;
        isTyping = true;
        if (/<[^>]+>/.test(text)) {
            element.innerHTML = formatContent(text);
            document.getElementById('agentChatContainer').scrollTop = document.getElementById('agentChatContainer').scrollHeight;
            isTyping = false;
            if (callback) callback();
            return;
        }
        function type() {
            if (index < text.length) {
                element.textContent += text.charAt(index);
                index++;
                document.getElementById('agentChatContainer').scrollTop = document.getElementById('agentChatContainer').scrollHeight;
                typingTimeout = setTimeout(type, speed);
            } else {
                isTyping = false;
                if (callback) callback();
            }
        }
        type();
    }

    function addMessage(role, content, proposal = null, animate = false) {
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

        if (role !== 'assistant' || !proposal) {
            conversationHistory.push({ role, content, timestamp: new Date().toISOString() });
        }
    }

    function addProposalToMessage(messageDiv, proposal) {
        const proposalDiv = document.createElement('div');
        proposalDiv.className = 'schedule-proposal';
        proposalDiv.innerHTML = renderProposal(proposal);
        messageDiv.appendChild(proposalDiv);
    }

    function formatContent(content) {
        if (typeof content !== 'string') return content;
        return content
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
        if (isTyping) return;
        if (getIsElectron() && window.electronAPI.removeAllAgentListeners) {
            window.electronAPI.removeAllAgentListeners();
        }

        const input = document.getElementById('agentInput');
        const btn = document.getElementById('agentSendBtn');
        if (!input || !btn) return;

        const msg = input.value.trim();
        if (!msg && uploadedImages.length === 0) return;

        if (uploadedImages.length > 0) {
            uploadedImages.forEach(img => addMessage('user', `<img src="${img}" style="max-width:280px;border-radius:12px;margin:4px 0;">`));
        }
        if (msg) { addMessage('user', msg); input.value = ''; input.style.height = 'auto'; }

        btn.disabled = true;
        const typingIndicator = document.getElementById('agentTypingIndicator');
        if (typingIndicator) typingIndicator.classList.add('active');

        try {
            let data;
            const isElectron = getIsElectron();

            if (isElectron) {
                const container = document.getElementById('agentChatContainer');
                const div = document.createElement('div');
                div.className = 'agent-message assistant';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'sender-name';
                nameDiv.innerHTML = 'Mosa <span class="typing-status">思考中...</span>';
                div.appendChild(nameDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                div.appendChild(contentDiv);
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;

                let streamedContent = '';

                const streamHandler = (event, chunk) => {
                    if (chunk.type === 'content') {
                        streamedContent += chunk.content;
                        contentDiv.innerHTML = formatContent(streamedContent);
                        container.scrollTop = container.scrollHeight;
                    } else if (chunk.type === 'reasoning') {
                        // 静默丢弃
                    } else if (chunk.type === 'retry') {
                        streamedContent = '';
                        contentDiv.innerHTML = '';
                        nameDiv.innerHTML = 'Mosa <span class="typing-status">重试中...</span>';
                    }
                };

                const statusHandler = (event, status) => {
                    if (status.phase === 'thinking') {
                        nameDiv.innerHTML = `Mosa <span class="typing-status">思考中...</span>`;
                    } else if (status.phase === 'executing_tools') {
                        nameDiv.innerHTML = `Mosa <span class="typing-status">执行中...</span>`;
                    }
                };

                const doneHandler = () => {
                    nameDiv.innerHTML = 'Mosa';
                    window.electronAPI.removeListener('agent-stream-chunk', streamHandler);
                    window.electronAPI.removeListener('agent-stream-done', doneHandler);
                    window.electronAPI.removeListener('agent-stream-status', statusHandler);
                };

                window.electronAPI.onAgentStreamChunk(streamHandler);
                window.electronAPI.onAgentStreamDone(doneHandler);
                window.electronAPI.onAgentStreamStatus(statusHandler);

                data = await window.electronAPI.agentChatStream({
                    message: msg, images: uploadedImages,
                    history: conversationHistory, profile: {},
                    userProfileText: getMosaProfile()
                });

                if (typingIndicator) typingIndicator.classList.remove('active');

                if (data.response) {
                    const { content, proposal } = data.response;
                    if (proposal) addProposalToMessage(div, proposal);
                    conversationHistory.push({ role: 'assistant', content: content || streamedContent, timestamp: new Date().toISOString(), proposal });
                    saveHistory();
                    if (data.shouldRefresh) await refreshScheduleData();
                }
            } else {
                const res = await fetch('/api/agent-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg, images: uploadedImages, history: conversationHistory, profile: {}, userProfileText: getMosaProfile() })
                });
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

                    const container = document.getElementById('agentChatContainer');
                    container.appendChild(msgDiv);
                    container.scrollTop = container.scrollHeight;

                    conversationHistory.push({ role: 'assistant', content, timestamp: new Date().toISOString(), proposal });
                    saveHistory();
                    if (data.shouldRefresh) await refreshScheduleData();
                }
            }
        } catch (e) {
            if (typingIndicator) typingIndicator.classList.remove('active');
            isTyping = false;
            let errorMsg = '请求失败，请重试。';
            if (e.message?.includes('401')) errorMsg = 'API Key 无效或未配置。';
            else if (e.message?.includes('429')) errorMsg = '请求频率超限，请稍后重试。';
            addMessage('assistant', errorMsg, null, true);
        }

        uploadedImages = [];
        updatePreview();
        btn.disabled = false;
        document.getElementById('agentInput')?.focus();
    };

    function getMosaProfile() {
        if (_mosaProfileText) return _mosaProfileText;
        if (window._mosaUserProfile) { _mosaProfileText = window._mosaUserProfile; return _mosaProfileText; }
        return '';
    }

    function checkProfileGeneration() {
        if (_profileGenPending) return;
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
            }
        } catch (e) { console.error('[Profile] Error:', e); }
        finally { _profileGenPending = false; }
    }

    async function saveHistory() {
        checkProfileGeneration();
        try {
            if (getIsElectron()) {
                await window.electronAPI.saveAgentHistory({ conversations: conversationHistory });
            } else {
                await fetch('/api/agent-save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversations: conversationHistory })
                });
            }
        } catch (e) { console.error('[AI Agent] Save error:', e); }
    }

    window.handleAgentKeyPress = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); }
    };

    window.approveProposal = async function() {
        const last = conversationHistory[conversationHistory.length - 1];
        if (!last?.proposal) return;

        try {
            let result;
            if (getIsElectron()) {
                result = await window.electronAPI.agentApprove(last.proposal);
            } else {
                const res = await fetch('/api/agent-approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposal: last.proposal })
                });
                result = await res.json();
            }

            if (result.success) {
                const count = result.deletedCount || result.modifiedCount || 0;
                addMessage('assistant', `已完成。${count ? '共 ' + count + ' 项。' : ''}`, null, true);                await refreshScheduleData();
            } else {
                addMessage('assistant', `操作失败：${result.error || '未知错误'}`, null, true);
            }
        } catch (e) {
            addMessage('assistant', '操作失败，请重试。', null, true);
        }
    };

    window.rejectProposal = function() {
        addMessage('assistant', '已取消。', null, true);
    };

    window.handleImageUpload = function(e) {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) { alert('图片不能超过5MB'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => { uploadedImages.push(ev.target.result); updatePreview(); };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    function updatePreview() {
        const container = document.getElementById('agentImagePreview');
        if (!container) return;
        container.innerHTML = '';
        uploadedImages.forEach((img, i) => {
            container.innerHTML += `<div class="preview-image"><img src="${img}"><button onclick="removeUploadedImage(${i})" class="remove-btn">✕</button></div>`;
        });
    }

    window.removeUploadedImage = function(i) { uploadedImages.splice(i, 1); updatePreview(); };

    window.archiveConversations = async function() {
        if (getIsElectron()) {
            await window.electronAPI.archiveConversations();
            await loadData();
            document.getElementById('agentChatContainer').innerHTML = '';
        }
    };

    window.clearConversations = async function() {
        if (confirm('确定要清空对话吗？')) {
            if (getIsElectron()) {
                await window.electronAPI.clearConversations();
                await loadData();
                document.getElementById('agentChatContainer').innerHTML = '';
            }
        }
    };

    async function refreshScheduleData() {
        try {
            await new Promise(r => setTimeout(r, 100));
            if (getIsElectron()) {
                window.scheduleData = await window.electronAPI.getScheduleData();
            } else {
                const dRes = await fetch('data.json?' + Date.now());
                window.scheduleData = await dRes.json();
            }
            if (typeof window.renderCalendar === 'function') window.renderCalendar();
            if (typeof window.renderBigTasks === 'function') {
                window.bigTasks = window.scheduleData.bigTasks || [];
                window.renderBigTasks();
            }
        } catch (e) { console.error('[AI Agent] Refresh error:', e); }
    }

    // ============================================
    // 深度规划模式 - Deep Planning Mode
    // ============================================

    function getDPStorageKey() { return 'mosa-deep-planning-data'; }

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
            }

            session.messages = deepPlanningHistory.map(m => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || new Date().toISOString()
            }));

            if (deepPlanningHistory.length > 0 && !session.endTime) {
                session.endTime = new Date().toISOString();
            }

            localStorage.setItem(getDPStorageKey(), JSON.stringify(data));
        } catch (e) {
            console.error('[Deep Planning] Save error:', e);
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
            nameDiv.innerHTML = 'Mosa <span class="dp-typing-status">思考中...</span>';
            div.appendChild(nameDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'dp-message-content';
            div.appendChild(contentDiv);
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;

            isDpStreaming = true;
            let index = 0;

            function type() {
                if (index < text.length) {
                    contentDiv.textContent += text.charAt(index);
                    index++;
                    container.scrollTop = container.scrollHeight;
                    dpTypingTimeout = setTimeout(type, 12);
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
        setTimeout(async () => {
            try {
                if (deepPlanningHistory.length < 2) return;
                const recentMessages = deepPlanningHistory.slice(-10).map(m => `${m.role === 'user' ? '用户' : 'Mosa'}: ${(m.content || '').substring(0, 200)}`).join('\n');

                const res = await fetch('/api/deep-planning-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversation: recentMessages })
                });

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

        loadDeepPlanningHistory();

        if (container.children.length === 0) {
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
        isDeepPlanningMode = false;

        if (dpTypingTimeout) { clearTimeout(dpTypingTimeout); dpTypingTimeout = null; }
        isDpStreaming = false;

        saveDeepPlanningData();
        scheduleProfileUpdate();
    };

    window.sendDeepPlanningMessage = async function() {
        const input = document.getElementById('dpInput');
        const text = input ? input.value.trim() : '';
        if (!text || isDpStreaming) return;

        addDPMessage('user', text);
        input.value = '';

        isDpStreaming = true;
        updateDPSendButtonState();

        try {
            const response = await fetch('/api/deep-planning-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: deepPlanningHistory,
                    profile: window.mosaProfile || {}
                })
            });

            const data = await response.json();

            console.log('[Deep Planning] Raw API response:', JSON.stringify(data).substring(0, 200));

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
})();
