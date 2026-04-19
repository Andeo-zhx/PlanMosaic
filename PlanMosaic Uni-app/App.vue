<script>
	import { initSupabase } from '@/utils/supabase.js'
	import { useScheduleStore } from '@/store/schedule.js'

	export default {
		onLaunch: function() {
			console.log('[App] PlanMosaic Launch')

			// Initialize Supabase client
			initSupabase()

			// Initialize store and load local data
			const store = useScheduleStore()
			store.loadLocal()

			// Attempt auto-login
			this.autoLogin()
		},
		onShow: function() {
			console.log('[App] Show')
		},
		onHide: function() {
			console.log('[App] Hide')
		},
		methods: {
			async autoLogin() {
				const store = useScheduleStore()
				const saved = uni.getStorageSync('mosaique-credentials')
				if (saved) {
					try {
						const { username, password } = JSON.parse(saved)
						const result = await store.login(username, password)
						if (result.success) {
							console.log('[App] Auto-login successful:', result.username)
						} else {
							uni.removeStorageSync('mosaique-credentials')
						}
					} catch (e) {
						console.warn('[App] Auto-login failed:', e)
						uni.removeStorageSync('mosaique-credentials')
					}
				}
			}
		}
	}
</script>

<style lang="scss">
	@import '@/uni_modules/uni-scss/index.scss';
	/* #ifndef APP-NVUE */
	@import '@/static/customicons.css';
	/* #endif */

	/* ============================================
	   Global Reset & Safe Area
	   ============================================ */
	page {
		background-color: $bg-base;
		font-family: $font-body;
		font-size: 14px;
		color: $text-main;
		line-height: 1.6;
		-webkit-font-smoothing: antialiased;

		/* Safe area for status bar + gesture bar */
		padding-top: constant(safe-area-inset-top);
		padding-top: env(safe-area-inset-top);
		padding-bottom: constant(safe-area-inset-bottom);
		padding-bottom: env(safe-area-inset-bottom);
	}

	/* ============================================
	   Global Typography
	   ============================================ */
	view, text, navigator {
		box-sizing: border-box;
		font-family: $font-body;
	}

	/* ============================================
	   Interaction Feedback (hover-class for all)
	   ============================================ */
	.tap-active {
		opacity: 0.7;
		transition: opacity 100ms ease;
	}

	/* ============================================
	   Unified Card Style
	   ============================================ */
	.pm-card {
		background-color: $bg-surface;
		border-radius: $card-radius;
		padding: $card-padding;
		margin-bottom: $card-margin-bottom;
		box-shadow: $shadow-card;
	}

	/* ============================================
	   Unified Button Style
	   ============================================ */
	.pm-btn {
		height: $btn-height;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: $btn-radius;
		font-size: 14px;
		font-weight: 500;
		letter-spacing: 0.5px;
		border: none;
		padding: 0 24px;

		/* Ensure touch target */
		min-width: $touch-target;

		&-primary {
			background-color: $brand-action;
			color: $bg-surface;
		}

		&-secondary {
			background-color: transparent;
			color: $text-secondary;
		}
	}

	.pm-btn-primary-hover {
		background-color: $pm-primary !important;
	}

	.pm-btn-secondary-hover {
		background-color: $bg-hover !important;
	}

	/* ============================================
	   Bottom Sheet Drag Handle
	   ============================================ */
	.sheet-handle {
		width: $sheet-handle-width;
		height: $sheet-handle-height;
		background-color: $sheet-handle-color;
		border-radius: $radius-pill;
		margin: 12px auto 0;
	}

	/* ============================================
	   Divider
	   ============================================ */
	.pm-divider {
		height: 1px;
		background-color: $border-subtle;
		margin: $space-4 0;
	}

	/* ============================================
	   Section Title
	   ============================================ */
	.pm-section-title {
		font-size: 18px;
		font-weight: 600;
		color: $text-main;
		letter-spacing: 0.5px;
	}

	.pm-section-subtitle {
		font-size: 13px;
		color: $text-secondary;
		margin-top: $space-1;
	}

	/* ============================================
	   Status Colors (Utility Classes)
	   ============================================ */
	.text-success { color: $status-success; }
	.text-warning { color: $status-warning; }
	.text-danger  { color: $status-danger; }
	.text-info    { color: $status-info; }
	.text-muted   { color: $text-secondary; }

	.bg-success { background-color: $status-success-bg; }
	.bg-warning { background-color: $status-warning-bg; }
	.bg-danger  { background-color: $status-danger-bg; }
	.bg-info    { background-color: $status-info-bg; }

	/* ============================================
	   Loading Spinner
	   ============================================ */
	.pm-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid transparent;
		border-top-color: currentColor;
		border-radius: 50%;
		animation: pm-spin 0.6s linear infinite;
	}

	@keyframes pm-spin {
		to { transform: rotate(360deg); }
	}

	/* ============================================
	   Empty State
	   ============================================ */
	.pm-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: $text-secondary;
		font-size: 13px;

		&-text {
			margin-top: $space-4;
		}
	}
</style>
