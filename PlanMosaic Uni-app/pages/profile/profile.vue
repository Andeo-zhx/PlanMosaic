<template>
	<view class="page-profile">
		<!-- Status Bar Spacer -->
		<view :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- ====== Not Logged In ====== -->
		<view v-if="!store.state.isLoggedIn" class="auth-area">
			<!-- Brand -->
			<view class="brand-area">
				<text class="brand-text">PlanMosaic</text>
				<text class="brand-sub">YOUR ACADEMIC COMPANION</text>
			</view>

			<!-- Login / Register Form -->
			<view class="form-area">
				<view class="form-field">
					<text class="field-label">USERNAME</text>
					<input
						class="field-input"
						v-model="form.username"
						placeholder="Enter username"
						:adjust-position="true"
					/>
				</view>

				<view class="form-divider"></view>

				<view class="form-field">
					<text class="field-label">PASSWORD</text>
					<input
						class="field-input"
						v-model="form.password"
						type="password"
						placeholder="Enter password"
						:adjust-position="true"
						@confirm="isRegisterMode ? handleRegister() : handleLogin()"
					/>
				</view>

				<view v-if="isRegisterMode" class="form-divider"></view>

				<view v-if="isRegisterMode" class="form-field">
					<text class="field-label">CONFIRM PASSWORD</text>
					<input
						class="field-input"
						v-model="form.confirm"
						type="password"
						placeholder="Confirm password"
						:adjust-position="true"
						@confirm="handleRegister()"
					/>
				</view>

				<!-- Error -->
				<view v-if="errorMsg" class="form-error">
					<text class="form-error-text">{{ errorMsg }}</text>
				</view>

				<!-- Submit -->
				<view
					class="form-submit"
					hover-class="submit-press"
					@click="isRegisterMode ? handleRegister() : handleLogin()"
				>
					<text class="form-submit-text">
						{{ isRegisterMode ? 'Create Account' : 'Sign In' }}
					</text>
				</view>

				<!-- Switch -->
				<view class="form-switch" hover-class="tap-active" @click="toggleMode">
					<text class="switch-text">
						{{ isRegisterMode ? 'Already have an account?' : "Don't have an account?" }}
					</text>
					<text class="switch-action">
						{{ isRegisterMode ? 'Sign In' : 'Sign Up' }}
					</text>
				</view>
			</view>
		</view>

		<!-- ====== Logged In ====== -->
		<view v-else class="user-area">
			<!-- User Card -->
			<view class="user-card">
				<view class="user-avatar">
					<text class="avatar-letter">{{ avatarLetter }}</text>
				</view>
				<view class="user-meta">
					<text class="user-name">{{ store.state.currentUser.username }}</text>
					<text class="user-status">Signed in</text>
				</view>
			</view>

			<!-- Sync indicator -->
			<view v-if="store.state.isSyncing" class="sync-row">
				<view class="pm-spinner"></view>
				<text class="sync-label">Syncing...</text>
			</view>

			<!-- Settings Group -->
			<view class="settings-group">
				<view
					v-for="(item, idx) in menuItems"
					:key="idx"
					class="settings-row"
					hover-class="tap-active"
					@click="handleMenu(item.action)"
				>
					<text class="settings-label">{{ item.label }}</text>
					<view class="settings-value">
						<text class="settings-value-text">{{ item.value }}</text>
						<text class="settings-chevron">&#8250;</text>
					</view>
				</view>
			</view>

			<!-- Logout -->
			<view
				class="logout-btn"
				hover-class="tap-active"
				@click="handleLogout"
			>
				<text class="logout-label">Sign Out</text>
			</view>

			<!-- Version -->
			<text class="version-label">PlanMosaic v1.0.0</text>
		</view>

		<!-- TabBar -->
		<custom-tabbar current="/pages/profile/profile"></custom-tabbar>
	</view>
</template>

<script>
	import { useScheduleStore } from '@/store/schedule.js'
	import customTabbar from '@/components/custom-tabbar/custom-tabbar.vue'

	export default {
		components: { customTabbar },
		data() {
			return {
				statusBarHeight: 0,
				isRegisterMode: false,
				errorMsg: '',
				isLoading: false,
				form: {
					username: '',
					password: '',
					confirm: ''
				}
			}
		},
		computed: {
			store() {
				return useScheduleStore()
			},
			avatarLetter() {
				const name = this.store.state.currentUser?.username || ''
				return name.charAt(0).toUpperCase()
			},
			menuItems() {
				return [
					{
						label: 'Sync to Cloud',
						action: 'sync',
						value: ''
					},
					{
						label: 'AI Provider',
						action: 'provider',
						value: this.store.state.aiProvider || 'deepseek'
					},
					{
						label: 'Theme',
						action: 'theme',
						value: this.store.state.theme || 'light'
					},
					{
						label: 'About',
						action: 'about',
						value: ''
					}
				]
			}
		},
		onReady() {
			const sysInfo = uni.getSystemInfoSync()
			this.statusBarHeight = sysInfo.statusBarHeight || 0
		},
		methods: {
			toggleMode() {
				this.isRegisterMode = !this.isRegisterMode
				this.errorMsg = ''
			},

			async handleLogin() {
				if (!this.form.username.trim() || !this.form.password.trim()) {
					this.errorMsg = 'Please enter username and password'
					return
				}
				if (this.isLoading) return
				this.isLoading = true
				this.errorMsg = ''
				const res = await this.store.login(this.form.username.trim(), this.form.password)
				this.isLoading = false
				if (!res.success) {
					this.errorMsg = res.error || 'Login failed'
				}
			},

			async handleRegister() {
				if (!this.form.username.trim() || !this.form.password.trim()) {
					this.errorMsg = 'Please enter username and password'
					return
				}
				if (this.form.password !== this.form.confirm) {
					this.errorMsg = 'Passwords do not match'
					return
				}
				if (this.form.password.length < 6) {
					this.errorMsg = 'Password must be at least 6 characters'
					return
				}
				if (this.isLoading) return
				this.isLoading = true
				this.errorMsg = ''
				const res = await this.store.register(this.form.username.trim(), this.form.password)
				this.isLoading = false
				if (!res.success) {
					this.errorMsg = res.error || 'Registration failed'
				}
			},

			handleLogout() {
				uni.showModal({
					title: 'Sign Out',
					content: 'Are you sure you want to sign out?',
					success: (res) => {
						if (res.confirm) {
							this.store.logout()
							this.form = { username: '', password: '', confirm: '' }
						}
					}
				})
			},

			handleMenu(action) {
				switch (action) {
					case 'sync':
						this.doSync()
						break
					case 'provider': {
						const next = this.store.state.aiProvider === 'deepseek' ? 'qwen' : 'deepseek'
						this.store.setAIProvider(next)
						uni.showToast({ title: 'AI: ' + next, icon: 'none' })
						break
					}
					case 'theme': {
						const next = this.store.state.theme === 'light' ? 'dark' : 'light'
						this.store.setTheme(next)
						uni.showToast({ title: next + ' mode', icon: 'none' })
						break
					}
					case 'about':
						uni.showModal({
							title: 'PlanMosaic',
							content: 'A minimal academic planning system.\nBuilt with love.',
							showCancel: false
						})
						break
				}
			},

			async doSync() {
				const ok = await this.store.saveCloud()
				uni.showToast({ title: ok ? 'Synced' : 'Sync failed', icon: ok ? 'success' : 'none' })
			}
		}
	}
</script>

<style lang="scss" scoped>
	.page-profile {
		min-height: 100vh;
		background-color: $bg-base;
	}

	/* ============ Not Logged In ============ */
	.auth-area {
		padding: $space-6 $screen-padding;
	}

	.brand-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: $space-4;
		margin-bottom: $space-7;
	}

	.brand-text {
		font-family: $font-display;
		font-size: 36px;
		font-weight: 300;
		letter-spacing: 4px;
		color: $text-main;
	}

	.brand-sub {
		font-size: 10px;
		color: $text-secondary;
		letter-spacing: 3px;
		margin-top: $space-2;
	}

	.form-area {
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.field-label {
		font-size: 10px;
		color: $text-secondary;
		letter-spacing: 1.5px;
	}

	.field-input {
		height: $input-height;
		padding: 0 $space-3;
		background-color: transparent;
		border: none;
		border-bottom: 1px solid $border-subtle;
		font-size: 15px;
		color: $text-main;
	}

	.form-divider {
		height: 1px;
		background-color: $border-subtle;
	}

	.form-error {
		padding: $space-2 $space-3;
		background-color: $status-danger-bg;
		border-radius: $radius-xs;
	}

	.form-error-text {
		font-size: 12px;
		color: $status-danger;
	}

	.form-submit {
		height: $btn-height;
		background-color: $brand-action;
		border-radius: $btn-radius;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: $space-2;
	}

	.submit-press {
		opacity: 0.7;
	}

	.form-submit-text {
		color: $bg-surface;
		font-size: 15px;
		font-weight: 500;
		letter-spacing: 0.5px;
	}

	.form-switch {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		margin-top: $space-3;
		padding: $space-3 0;
		min-height: $touch-target;
	}

	.switch-text {
		font-size: 13px;
		color: $text-secondary;
	}

	.switch-action {
		font-size: 13px;
		color: $pm-accent;
		font-weight: 500;
	}

	/* ============ Logged In ============ */
	.user-area {
		padding: $space-5 $screen-padding;
		padding-bottom: 100px;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: $space-4;
		padding: $space-5 $space-4;
		background-color: $bg-surface;
		border-radius: $card-radius;
		border: 1px solid $border-subtle;
		margin-bottom: $space-5;
	}

	.user-avatar {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background-color: $text-main;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.avatar-letter {
		font-size: 20px;
		color: $bg-surface;
		font-weight: 500;
	}

	.user-meta {
		flex: 1;
	}

	.user-name {
		font-size: 17px;
		font-weight: 600;
		color: $text-main;
		display: block;
	}

	.user-status {
		font-size: 13px;
		color: $text-secondary;
		margin-top: $space-1;
		display: block;
	}

	.sync-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		padding: $space-3 0;
		color: $text-secondary;
		font-size: 13px;
	}

	.sync-label {
		color: $text-secondary;
	}

	.settings-group {
		background-color: $bg-surface;
		border-radius: $card-radius;
		border: 1px solid $border-subtle;
		overflow: hidden;
		margin-bottom: $space-5;
	}

	.settings-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: $space-4 $card-padding;
		border-bottom: 1px solid $border-subtle;
	}

	.settings-row:last-child {
		border-bottom: none;
	}

	.settings-label {
		font-size: 15px;
		color: $text-main;
	}

	.settings-value {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.settings-value-text {
		font-size: 13px;
		color: $text-secondary;
	}

	.settings-chevron {
		font-size: 18px;
		color: $text-disabled;
	}

	.logout-btn {
		background-color: $status-danger-bg;
		border-radius: $radius-md;
		padding: $space-4;
		text-align: center;
		margin-bottom: $space-6;
	}

	.logout-label {
		font-size: 15px;
		color: $status-danger;
		font-weight: 500;
	}

	.version-label {
		text-align: center;
		font-size: 11px;
		color: $text-disabled;
		padding-bottom: $space-7;
	}
</style>
