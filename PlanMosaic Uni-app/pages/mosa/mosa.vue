<template>
	<view class="page-mosa">
		<!-- Custom Header -->
		<view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
			<view class="header-inner">
				<text class="brand">Mosa</text>
			</view>
		</view>

		<!-- Chat Messages -->
		<scroll-view
			scroll-y
			class="chat-scroll"
			:style="{ height: chatHeight + 'px' }"
			:scroll-into-view="scrollToId"
			scroll-with-animation
		>
			<view class="chat-container" id="chatContainer">
				<!-- Welcome Message -->
				<view v-if="messages.length === 0" class="welcome-msg">
					<text class="welcome-title">Hi, I'm Mosa</text>
					<text class="welcome-sub">What's on your mind? I can help with scheduling, tasks, and more.</text>
				</view>

				<!-- Messages -->
				<view
					v-for="(msg, idx) in messages"
					:key="idx"
					class="msg-row"
					:class="msg.role"
				>
					<view class="msg-bubble" :class="msg.role">
						<text class="msg-text" :selectable="true">{{ msg.content }}</text>
					</view>
				</view>

				<view id="chatBottom"></view>
			</view>
		</scroll-view>

		<!-- Input Area -->
		<view class="input-area" :style="{ paddingBottom: inputSafeBottom + 'px' }">
			<view class="input-wrapper">
				<input
					class="chat-input"
					v-model="inputText"
					placeholder="Ask Mosa anything..."
					:confirm-type="'send'"
					@confirm="sendMessage"
				/>
				<view
					class="send-btn"
					:class="{ active: inputText.trim() }"
					hover-class="tap-active"
					@click="sendMessage"
				>
					<text class="send-icon">&#8593;</text>
				</view>
			</view>
		</view>
		<custom-tabbar current="/pages/mosa/mosa"></custom-tabbar>
	</view>
</template>

<script>
	import customTabbar from '@/components/custom-tabbar/custom-tabbar.vue'

	export default {
		components: { customTabbar },
		data() {
			return {
				statusBarHeight: 0,
				chatHeight: 400,
				inputSafeBottom: 0,
				scrollToId: 'chatBottom',
				inputText: '',
				messages: [],
				isStreaming: false
			}
		},
		onReady() {
			const sysInfo = uni.getSystemInfoSync()
			this.statusBarHeight = sysInfo.statusBarHeight || 0
			this.inputSafeBottom = sysInfo.safeAreaInsets?.bottom || 0
			this.chatHeight = sysInfo.windowHeight - this.statusBarHeight - 44 - 56
		},
		methods: {
			sendMessage() {
				const text = this.inputText.trim()
				if (!text || this.isStreaming) return

				this.messages.push({ role: 'user', content: text })
				this.inputText = ''
				this.scrollToBottom()

				// Placeholder assistant response
				this.isStreaming = true
				setTimeout(() => {
					this.messages.push({
						role: 'assistant',
						content: 'I received your message. AI chat requires a backend server connection. Please make sure server.js is running.'
					})
					this.isStreaming = false
					this.scrollToBottom()
				}, 800)
			},
			scrollToBottom() {
				this.$nextTick(() => {
					this.scrollToId = ''
					setTimeout(() => {
						this.scrollToId = 'chatBottom'
					}, 50)
				})
			}
		}
	}
</script>

<style lang="scss" scoped>
	.page-mosa {
		min-height: 100vh;
		background-color: $bg-base;
		display: flex;
		flex-direction: column;
	}

	.header {
		background-color: $bg-surface;
		padding-bottom: $space-3;
		border-bottom: 1px solid $border-subtle;
		flex-shrink: 0;
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: $space-4;
	}

	.brand {
		font-family: $font-display;
		font-size: 24px;
		font-weight: 300;
		letter-spacing: 3px;
		color: $text-main;
	}

	.chat-scroll {
		flex: 1;
	}

	.chat-container {
		padding: $space-4 $screen-padding;
		padding-bottom: 20px;
	}

	.welcome-msg {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 20px;
	}

	.welcome-title {
		font-family: $font-display;
		font-size: 22px;
		font-weight: 400;
		color: $text-main;
		margin-bottom: $space-3;
	}

	.welcome-sub {
		font-size: 13px;
		color: $text-secondary;
		text-align: center;
		line-height: 1.6;
	}

	.msg-row {
		display: flex;
		margin-bottom: $space-3;

		&.user {
			justify-content: flex-end;
		}

		&.assistant {
			justify-content: flex-start;
		}
	}

	.msg-bubble {
		max-width: 75%;
		padding: $space-3 $space-4;
		border-radius: $radius-lg;

		&.user {
			background-color: $text-main;
			border-bottom-right-radius: $radius-xs;
		}

		&.assistant {
			background-color: $bg-surface;
			border-bottom-left-radius: $radius-xs;
			box-shadow: $shadow-card;
		}
	}

	.msg-text {
		font-size: 14px;
		line-height: 1.6;
		word-break: break-word;
	}

	.msg-bubble.user .msg-text {
		color: $bg-surface;
	}

	.msg-bubble.assistant .msg-text {
		color: $text-main;
	}

	/* Input Area */
	.input-area {
		flex-shrink: 0;
		padding: $space-3 $screen-padding;
		background-color: $bg-surface;
		border-top: 1px solid $border-subtle;
	}

	.input-wrapper {
		display: flex;
		align-items: center;
		gap: $space-2;
		background-color: $bg-muted;
		border-radius: $radius-lg;
		padding: $space-2 $space-3;
	}

	.chat-input {
		flex: 1;
		font-size: 14px;
		color: $text-main;
		height: 36px;
	}

	.send-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background-color: $border-normal;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background-color 150ms ease;

		&.active {
			background-color: $text-main;
		}
	}

	.send-icon {
		font-size: 16px;
		color: $bg-surface;
	}
</style>
