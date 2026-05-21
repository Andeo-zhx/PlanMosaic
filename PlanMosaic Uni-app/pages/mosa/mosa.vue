<template>
    <view class="mosa-page">
        <!-- 毛玻璃顶部导航栏 -->
        <view class="mosa-nav">
            <text class="nav-title">Mosa</text>
        </view>

        <!-- 会话内容区 -->
        <scroll-view
            class="chat-scroll"
            scroll-y
            :scroll-into-view="scrollToView"
            :scroll-with-animation="true"
            :refresher-enabled="true"
            :refresher-triggered="refresherTriggered"
            @refresherrefresh="onLoadHistory"
        >
            <!-- 欢迎区域 -->
            <view class="welcome-area" v-if="messages.length === 0 && !isThinking">
                <view class="welcome-icon">🧩</view>
                <text class="welcome-greeting">{{ greetingText }}</text>
                <text class="welcome-hint">我是 Mosa，你的 AI 生活规划伙伴～</text>
                <text class="welcome-sub">试试下面这些话题，开始规划你的一天吧</text>
            </view>

            <!-- 消息列表 -->
            <view class="messages-list" v-if="messages.length > 0">
                <view
                    v-for="(msg, idx) in messages"
                    :key="idx"
                    class="message-wrapper"
                    :class="msg.role === 'user' ? 'msg-user' : 'msg-agent'"
                    :id="'msg-' + idx"
                >
                    <!-- Agent 头像 -->
                    <view class="msg-avatar" v-if="msg.role === 'agent'">
                        <view class="avatar-dot">🧩</view>
                    </view>

                    <!-- 消息体 -->
                    <view class="msg-body" :class="msg.role">
                        <!-- 思路链（可选） -->
                        <view
                            class="thinking-chain"
                            v-if="msg.thinking && msg.thinking.length > 0"
                        >
                            <view
                                class="thinking-toggle"
                                @click="toggleThinking(idx)"
                            >
                                <text class="thinking-icon">💭</text>
                                <text class="thinking-label">思路过程</text>
                                <text class="thinking-arrow" :class="{ expanded: msg.thinkingOpen }">▾</text>
                            </view>
                            <view class="thinking-content" v-if="msg.thinkingOpen">
                                <text class="thinking-text">{{ msg.thinking }}</text>
                            </view>
                        </view>

                        <!-- 正文 -->
                        <view class="msg-bubble" :class="msg.role">
                            <text class="bubble-text">{{ msg.content }}</text>
                        </view>

                        <!-- 时间戳 -->
                        <text class="msg-time">{{ msg.time }}</text>
                    </view>

                    <!-- 用户头像 -->
                    <view class="msg-avatar" v-if="msg.role === 'user'">
                        <view class="avatar-dot user-avatar">U</view>
                    </view>
                </view>
            </view>

            <!-- 打字指示器 -->
            <view class="message-wrapper msg-agent" v-if="isThinking">
                <view class="msg-avatar">
                    <view class="avatar-dot">🧩</view>
                </view>
                <view class="msg-body agent">
                    <view class="msg-bubble agent typing-bubble">
                        <view class="typing-dots">
                            <view class="typing-dot"></view>
                            <view class="typing-dot"></view>
                            <view class="typing-dot"></view>
                        </view>
                        <text class="typing-text">Mosa 正在思考...</text>
                    </view>
                </view>
            </view>

            <view class="chat-bottom-pad" id="chat-bottom"></view>
        </scroll-view>

        <!-- 快捷操作 -->
        <view class="quick-actions" v-if="messages.length === 0">
            <scroll-view scroll-x class="chips-scroll">
                <view class="chips-row">
                    <view
                        v-for="(chip, ci) in quickChips"
                        :key="ci"
                        class="chip-item"
                        @click="onChipTap(chip.prompt)"
                    >
                        <text class="chip-emoji">{{ chip.emoji }}</text>
                        <text class="chip-label">{{ chip.label }}</text>
                    </view>
                </view>
            </scroll-view>
        </view>

        <!-- ReAct 记录按钮 -->
        <view class="react-btn-wrapper" v-if="messages.length > 0">
            <text class="react-btn" @tap="generateReActLog">📋 生成ReAct记录</text>
        </view>

        <!-- 毛玻璃输入底栏 -->
        <view class="input-bar">
            <view class="input-inner">
                <input
                    class="chat-input"
                    type="text"
                    v-model="inputText"
                    placeholder="告诉 Mosa 你想做什么..."
                    placeholder-style="color: #B0ADA6;"
                    :disabled="isThinking"
                    @confirm="onSend"
                    confirm-type="send"
                />
                <view class="send-btn" :class="{ disabled: !inputText.trim() || isThinking }" @click="onSend">
                    <text class="send-icon">↑</text>
                </view>
            </view>
        </view>

        <!-- ReAct 日志弹窗 -->
        <view class="react-log-overlay" v-if="showReActLog" @tap="closeReActLog">
            <view class="react-log-panel" @tap.stop>
                <view class="react-log-header">
                    <text class="react-log-title">📋 ReAct 推理记录</text>
                    <text class="react-log-close" @tap="closeReActLog">✕</text>
                </view>
                <scroll-view class="react-log-content" scroll-y>
                    <text class="react-log-text">{{ reactLogText }}</text>
                </scroll-view>
                <view class="react-log-actions">
                    <view class="react-log-copy-btn" hover-class="tap-active" @tap="copyReActLog">
                        <text class="react-log-copy-text">📋 复制到剪贴板</text>
                    </view>
                </view>
            </view>
        </view>
    </view>
</template>

<script>
export default {
    name: 'MosaPage',
    data() {
        return {
            statusBarHeight: 0,
            inputText: '',
            isThinking: false,
            refresherTriggered: false,
            scrollToView: '',
            messages: [],
            typingTimer: null,
            showReActLog: false,
            reactLogText: '',
            quickChips: [
                { emoji: '📅', label: '帮我规划明天', prompt: '帮我规划一下明天的日程安排' },
                { emoji: '🎯', label: '本周目标', prompt: '帮我梳理一下本周的重要目标' },
                { emoji: '📝', label: '整理待办', prompt: '帮我整理和优化我的待办清单' },
                { emoji: '💡', label: '学习建议', prompt: '给我一些高效学习的建议' },
                { emoji: '🌙', label: '晚间复盘', prompt: '帮我做今天的复盘总结' },
                { emoji: '⏰', label: '时间优化', prompt: '帮我分析时间分配是否合理' }
            ]
        }
    },
    computed: {
        greetingText() {
            const hour = new Date().getHours()
            if (hour < 6) return '夜深了～🌙'
            if (hour < 9) return '早上好呀～☀️'
            if (hour < 12) return '上午好～🌤️'
            if (hour < 14) return '中午好～☀️'
            if (hour < 18) return '下午好～🌿'
            if (hour < 21) return '傍晚好～🌅'
            return '晚上好～🌙'
        }
    },
    onLoad() {
        const systemInfo = uni.getSystemInfoSync()
        this.statusBarHeight = systemInfo.statusBarHeight || 44
    },
    methods: {
        onSend() {
            const text = this.inputText.trim()
            if (!text || this.isThinking) return

            const now = new Date()
            const timeStr = this.formatTime(now)

            this.messages.push({
                role: 'user',
                content: text,
                time: timeStr,
                thinking: '',
                thinkingOpen: false
            })

            this.inputText = ''
            this.isThinking = true
            this.$nextTick(() => this.scrollToBottom())

            this.simulateAgentReply(text)
        },

        simulateAgentReply(userText) {
            const delay = 800 + Math.random() * 1200
            this.typingTimer = setTimeout(() => {
                const now = new Date()
                const timeStr = this.formatTime(now)

                const { thinking, reply } = this.generateMockReply(userText)

                this.isThinking = false
                this.messages.push({
                    role: 'agent',
                    content: reply,
                    time: timeStr,
                    thinking: thinking,
                    thinkingOpen: false
                })

                this.$nextTick(() => this.scrollToBottom())
            }, delay)
        },

        generateMockReply(userText) {
            const lower = userText.toLowerCase()

            if (lower.includes('规划') || lower.includes('日程') || lower.includes('安排') || lower.includes('明天')) {
                return {
                    thinking: '用户希望我帮助规划日程安排。我需要：\n1. 先了解用户的时间偏好\n2. 根据优先级排列任务\n3. 给出合理的时段分配建议\n4. 预留缓冲时间应对突发状况',
                    reply: '好的！我来帮你梳理一下。\n\n📅 **建议日程安排**\n\n• 08:00-09:00 — 晨间仪式：回顾目标 + 轻运动\n• 09:00-11:00 — 深度工作（处理最重要的任务）\n• 11:00-12:00 — 会议/沟通时间\n• 14:00-16:00 — 创造性工作\n• 16:00-17:30 — 学习与成长\n• 17:30-18:00 — 当日复盘\n\n💡 早上预留了2小时深度工作时间，这是效率最高的时段。记得每50分钟休息5分钟哦～\n\n有什么需要调整的地方随时告诉我！'
                }
            }

            if (lower.includes('目标') || lower.includes('周')) {
                return {
                    thinking: '用户在询问本周目标梳理。我需要引导用户明确：\n1. 本周最重要的3件事\n2. 每件事的可衡量结果\n3. 分解到每天的具体动作',
                    reply: '很好的问题！让我们一起来梳理本周目标 🎯\n\n**核心方法：3-3-3 法则**\n\n🔴 本周最重要的 **3 件事**：\n1. 确定一个需要深度推进的任务\n2. 确定一个需要启动的新事项\n3. 确定一个需要收尾的遗留事项\n\n🟡 每天必做 **3 件小事**：\n• 早上用 5 分钟写下当日重点\n• 午休前检查进度\n• 晚上做 3 分钟简短复盘\n\n🟢 预留 **3 个弹性时段**：\n应对突发任务，避免计划被打乱后焦虑\n\n你可以先告诉我这周最想推进的是什么，我来帮你拆解！'
                }
            }

            if (lower.includes('待办') || lower.includes('todo') || lower.includes('清单')) {
                return {
                    thinking: '用户需要待办清单优化。根据 GTD 方法论：\n1. 收集所有待办事项\n2. 按紧急/重要矩阵分类\n3. 给出处理顺序建议',
                    reply: '没问题！整理待办的关键是 **分类 + 排序** 📝\n\n**四象限法快速梳理**：\n\n🔴 **立刻做**（紧急+重要）\n→ 今天必须完成的、有 deadline 的事\n\n🟡 **计划做**（重要不紧急）\n→ 学习提升、健康管理、深度规划\n\n🔵 **授权做**（紧急不重要）\n→ 可以委托或批量处理的杂务\n\n⚪ **少做/不做**（不紧急不重要）\n→ 无意义的刷消息、过度完美主义\n\n💡 建议你先把所有事情写下来，然后按这个框架分类。这样你会发现自己80%的焦虑其实来自于没有分类～'
                }
            }

            if (lower.includes('学习') || lower.includes('建议')) {
                return {
                    thinking: '用户询问学习建议。从认知科学角度：\n1. 间隔重复 > 集中突击\n2. 主动回忆 > 被动阅读\n3. 费曼技巧：以教代学',
                    reply: '关于高效学习，分享几个经过科学验证的方法 💡\n\n🧠 **费曼学习法**\n用最简单的语言把概念讲给别人听。讲不清楚的地方，就是你没真正理解的地方。\n\n📆 **间隔重复**\n比临时抱佛脚效果好 3 倍。建议学习后 1 天、3 天、7 天、30 天分别复习。\n\n✍️ **主动回忆**\n合上书，试着回忆关键内容。比反复阅读效率高 50%。\n\n🎯 **番茄工作法**\n25 分钟专注 + 5 分钟休息。4 个番茄后休息 15-30 分钟。\n\n你目前在学什么内容？我可以给你更针对性的建议～'
                }
            }

            if (lower.includes('复盘') || lower.includes('总结') || lower.includes('晚上')) {
                return {
                    thinking: '用户想做晚间复盘。复盘框架：\n1. 今天完成了什么？\n2. 遇到的挑战和应对\n3. 明天的改进点\n4. 感恩/收获时刻',
                    reply: '来，一起做今天的复盘吧 🌙\n\n**3-2-1 复盘法**\n\n✅ **3 件完成的事**\n写下今天实际完成的事情（哪怕很小）\n\n🔧 **2 个可以改进的点**\n不是自我批评，而是客观观察\n\n🌟 **1 个感恩/收获时刻**\n今天让你感到开心或学到东西的瞬间\n\n💡 这个小仪式只需要 3-5 分钟，但坚持 30 天你会发现自己的成长轨迹非常清晰。\n\n你也可以在 Schedule 页面建立每日复盘任务，方便追踪哦～'
                }
            }

            if (lower.includes('时间') || lower.includes('分配')) {
                return {
                    thinking: '用户需要时间分析。常用方法：\n1. 时间日志法 - 记录实际花费\n2. 80/20 法则 - 找到高产出时段\n3. 能量管理 - 匹配任务类型和精力状态',
                    reply: '时间分析是个很好的习惯 ⏰\n\n**先来看看你的时间都去哪了**\n\n📊 **建议做一次时间日志**\n明天开始，每小时记录一下自己在做什么（只需要一天）。你可能会惊讶地发现：\n• 真正高效工作的时间可能只有 3-4 小时\n• 大量时间花在了切换任务上\n• 碎片化干扰比你想象的多得多\n\n🎯 **优化策略**\n1. 保护你的「黄金时段」— 找出精力最好的 2 小时\n2. 批量处理 — 把相似任务集中在一起做\n3. 设定边界 — 微信/邮件每天固定时间查看\n\nPlanMosaic 的 Timetable 功能可以帮你可视化时间分配，去试试看？'
                }
            }

            return {
                thinking: '用户在和我聊天。我会：\n1. 理解用户的真实需求\n2. 从规划和效率角度给予回应\n3. 引导用户更清晰地表达需求',
                reply: '收到！😊\n\n我是 Mosa，专注于帮你做更好的规划和日程管理。你可以让我帮你：\n\n• 📅 规划每天的日程安排\n• 🎯 梳理和拆解目标\n• 📝 优化待办清单\n• ⏰ 分析时间使用效率\n• 🌙 做每日/每周复盘\n\n试试告诉我你想做什么，我们一起把生活安排得井井有条～'
            }
        },

        onChipTap(prompt) {
            this.inputText = prompt
            this.onSend()
        },

        toggleThinking(idx) {
            this.messages[idx].thinkingOpen = !this.messages[idx].thinkingOpen
        },

        onLoadHistory() {
            this.refresherTriggered = true
            setTimeout(() => {
                this.refresherTriggered = false
            }, 500)
        },

        scrollToBottom() {
            this.scrollToView = 'chat-bottom'
        },

        formatTime(date) {
            const h = date.getHours().toString().padStart(2, '0')
            const m = date.getMinutes().toString().padStart(2, '0')
            return `${h}:${m}`
        },

        async generateReActLog() {
            const messages = this.messages || []

            if (messages.length === 0) {
                uni.showToast({ title: '暂无对话历史', icon: 'none' })
                return
            }

            try {
                const baseUrl = 'http://localhost:3456'
                const [err, res] = await uni.request({
                    url: baseUrl + '/api/generate-react-log',
                    method: 'POST',
                    header: { 'Content-Type': 'application/json' },
                    data: { messages }
                })

                if (res && res.statusCode === 200 && res.data.success) {
                    this.reactLogText = res.data.react_log
                    this.showReActLog = true
                } else {
                    uni.showToast({ title: '生成ReAct记录失败', icon: 'error' })
                }
            } catch (e) {
                console.error('ReAct log error:', e)
                uni.showToast({ title: '网络错误，请重试', icon: 'error' })
            }
        },

        closeReActLog() {
            this.showReActLog = false
        },

        copyReActLog() {
            uni.setClipboardData({
                data: this.reactLogText,
                success: () => {
                    uni.showToast({ title: '已复制到剪贴板', icon: 'success' })
                },
                fail: () => {
                    uni.showToast({ title: '复制失败', icon: 'error' })
                }
            })
        },
    },
    beforeDestroy() {
        if (this.typingTimer) clearTimeout(this.typingTimer)
    }
}
</script>

<style lang="scss" scoped>
.mosa-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: $bg-base;
    overflow: hidden;
}

/* ========== 毛玻璃导航栏 ========== */
.mosa-nav {
    @include glass-surface(0.85, 0.10);
    padding-top: calc(10px + var(--status-bar-height, 44px));
    padding-bottom: 10px;
    padding-left: $screen-padding;
    padding-right: $screen-padding;
    z-index: 100;
    position: relative;
}

.nav-title {
    font-family: $font-display;
    font-size: 28px;
    font-weight: 600;
    color: $text-main;
    letter-spacing: 1px;
}

/* ========== 对话滚动区 ========== */
.chat-scroll {
    flex: 1;
    padding: 0 $screen-padding;
}

/* ========== 欢迎区域 ========== */
.welcome-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 60px;
    padding-bottom: 20px;
}

.welcome-icon {
    font-size: 56px;
    margin-bottom: 16px;
}

.welcome-greeting {
    font-size: 22px;
    font-weight: 600;
    color: $text-main;
    margin-bottom: $space-2;
}

.welcome-hint {
    font-size: 15px;
    color: $text-secondary;
    margin-bottom: $space-1;
}

.welcome-sub {
    font-size: 13px;
    color: $text-secondary;
    margin-top: $space-4;
}

/* ========== 消息列表 ========== */
.messages-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 8px;
}

.message-wrapper {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 100%;

    &.msg-agent {
        flex-direction: row;
    }

    &.msg-user {
        flex-direction: row-reverse;
    }
}

.msg-avatar {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    margin-top: 2px;
}

.avatar-dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: $bg-muted;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;

    &.user-avatar {
        background: $brand-action;
        color: $bg-surface;
        font-size: 13px;
        font-weight: 600;
    }
}

.msg-body {
    max-width: calc(100% - 60px);
    display: flex;
    flex-direction: column;

    &.user {
        align-items: flex-end;
    }

    &.agent {
        align-items: flex-start;
    }
}

/* ========== 聊天气泡 ========== */
.msg-bubble {
    padding: 12px 14px;
    border-radius: $radius-lg;

    &.agent {
        @include glass-surface(0.8, 0.12);
        border-radius: 4px $radius-lg $radius-lg $radius-lg;
    }

    &.user {
        background: rgba(34, 34, 34, 0.88);
        border-radius: $radius-lg 4px $radius-lg $radius-lg;
    }
}

.bubble-text {
    font-size: 14px;
    line-height: 1.7;
    color: $text-main;
    white-space: pre-wrap;
    word-break: break-word;

    .msg-bubble.user & {
        color: $bg-surface;
    }
}

.msg-time {
    font-size: 11px;
    color: $text-secondary;
    margin-top: 4px;
    opacity: 0.6;
}

/* ========== 思路链 ========== */
.thinking-chain {
    margin-bottom: 8px;
    width: 100%;
    border-top: 1px solid $border-normal;
    padding-top: 6px;
}

.thinking-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    @include glass-surface(0.55, 0.05);
    border-radius: $radius-sm;
}

.thinking-icon {
    font-size: 14px;
}

.thinking-label {
    font-size: 13px;
    font-weight: 500;
    color: $text-secondary;
    flex: 1;
}

.thinking-arrow {
    font-size: 14px;
    color: $text-secondary;
    transition: transform $duration-fast $ease-out;

    &.expanded {
        transform: rotate(180deg);
    }
}

.thinking-content {
    padding: 12px 14px;
    background: rgba(243, 241, 236, 0.5);
    border-radius: 0 0 $radius-sm $radius-sm;
    margin-top: -2px;
}

.thinking-text {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    color: $text-secondary;
    line-height: 1.55;
    white-space: pre-wrap;
}

/* ========== 打字指示器 ========== */
.typing-bubble {
    display: flex;
    align-items: center;
    gap: 10px;
}

.typing-dots {
    display: flex;
    gap: 3px;
}

.typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $text-secondary;
    animation: typingBounce 1.2s ease-in-out infinite;

    &:nth-child(1) { animation-delay: 0s; }
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
}

@keyframes typingBounce {
    0%, 60%, 100% {
        opacity: 0.3;
        transform: scale(1);
    }
    30% {
        opacity: 1;
        transform: scale(1.2);
    }
}

.typing-text {
    font-size: 12px;
    color: $text-secondary;
}

/* ========== 快捷操作 Chips ========== */
.quick-actions {
    padding: 8px 0;
    flex-shrink: 0;
}

.chips-scroll {
    white-space: nowrap;
}

.chips-row {
    display: flex;
    gap: 8px;
    padding: 0 $screen-padding;
}

.chip-item {
    @include glass-surface(0.8, 0.12);
    border-radius: $radius-pill;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    white-space: nowrap;
}

.chip-emoji {
    font-size: 14px;
}

.chip-label {
    font-size: 13px;
    color: $text-main;
}

/* ========== 毛玻璃输入底栏 ========== */
.input-bar {
    @include glass-surface(0.88, 0.10);
    padding: $space-3 $screen-padding;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 16px));
    flex-shrink: 0;
    z-index: 100;
}

.input-inner {
    display: flex;
    align-items: center;
    gap: 10px;
    background: $bg-muted;
    border-radius: $radius-xl;
    padding: 6px 6px 6px 16px;
    border: 1px solid rgba(0, 0, 0, 0.06);
}

.chat-input {
    flex: 1;
    height: 36px;
    font-size: 14px;
    color: $text-main;
    background: transparent;
    border: none;
    outline: none;
}

.send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: $brand-action;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: opacity $duration-fast $ease-out;

    &.disabled {
        background: $border-normal;
    }
}

.send-icon {
    color: $bg-surface;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
}

.chat-bottom-pad {
    height: 12px;
}

/* ========== ReAct 记录按钮 ========== */
.react-btn-wrapper {
    display: flex;
    justify-content: flex-end;
    padding: 4rpx 16rpx;
    flex-shrink: 0;
}

.react-btn {
    font-size: 22rpx;
    color: #999;
    padding: 4rpx 16rpx;
    border-radius: 20rpx;
}

.react-btn:active {
    color: $brand-action;
}

/* ========== ReAct 日志弹窗 ========== */
.react-log-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.react-log-panel {
    background: $bg-surface;
    border-radius: 24rpx;
    width: 90vw;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.react-log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24rpx 32rpx;
    border-bottom: 1px solid $border-subtle;
}

.react-log-title {
    font-size: 30rpx;
    font-weight: 600;
    color: $text-main;
}

.react-log-close {
    font-size: 36rpx;
    color: $text-secondary;
    padding: 8rpx 16rpx;
}

.react-log-content {
    flex: 1;
    padding: 24rpx;
    max-height: 50vh;
}

.react-log-text {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco', monospace;
    font-size: 24rpx;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    color: $text-main;
    background: $bg-muted;
    padding: 20rpx;
    border-radius: $radius-md;
}

.react-log-actions {
    display: flex;
    justify-content: center;
    padding: 16rpx 32rpx 24rpx;
    border-top: 1px solid $border-subtle;
}

.react-log-copy-btn {
    background: $brand-action;
    padding: 12rpx 40rpx;
    border-radius: 20rpx;
}

.react-log-copy-text {
    color: $bg-surface;
    font-size: 26rpx;
}
</style>