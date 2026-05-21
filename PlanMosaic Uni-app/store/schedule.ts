/**
 * PlanMosaic - Schedule Data Store (Pinia + debounced persistence)
 *
 * Reactive state management using Pinia.
 * Handles local persistence + cloud sync via Supabase RPC.
 */

import { defineStore } from 'pinia'
import { loginRPC, registerRPC, getUserDataRPC, upsertUserDataRPC, storage } from '@/utils/supabase.js'
import { USER_DATA_KEY, CREDENTIALS_KEY, AUTH_TOKEN_KEY } from '@/constants/storage-keys'

const DEBOUNCE_MS = 500

export const useScheduleStore = defineStore('schedule', {
	state: () => ({
		currentUser: null as { userId: string; username: string } | null,
		isLoggedIn: false,

		startDate: '' as string,
		endDate: '' as string,
		schedules: {} as Record<string, any>,
		bigTasks: [] as any[],
		bigTaskHistory: [] as any[],
		scheduleTemplates: [] as any[],

		theme: 'light' as string,
		aiProvider: 'deepseek' as string,

		apiKeys: {
			deepseek: '' as string,
			qwen: '' as string
		},

		userProfile: '' as string,

		isLoading: false,
		isSyncing: false,

		_saveTimer: null as ReturnType<typeof setTimeout> | null
	}),

	getters: {
		todayStr(): string {
			const now = new Date()
			const y = now.getFullYear()
			const m = String(now.getMonth() + 1).padStart(2, '0')
			const d = String(now.getDate()).padStart(2, '0')
			return `${y}-${m}-${d}`
		},

		scheduledDates(): string[] {
			return Object.keys(this.schedules).sort()
		}
	},

	actions: {
		// ====== Debounced Save ======

		_saveLocalDebounced() {
			if (this._saveTimer) clearTimeout(this._saveTimer)
			this._saveTimer = setTimeout(() => {
				this.saveLocal()
			}, DEBOUNCE_MS)
		},

		// ====== Data Helpers ======

		collectAll() {
			return {
				startDate: this.startDate,
				endDate: this.endDate,
				schedules: JSON.parse(JSON.stringify(this.schedules)),
				bigTasks: JSON.parse(JSON.stringify(this.bigTasks)),
				bigTaskHistory: JSON.parse(JSON.stringify(this.bigTaskHistory)),
				scheduleTemplates: JSON.parse(JSON.stringify(this.scheduleTemplates)),
				settings: {
					theme: this.theme,
					aiProvider: this.aiProvider
				},
				apiKeys: { ...this.apiKeys },
				userProfile: this.userProfile
			}
		},

		restoreState(data: any) {
			if (!data) return
			this.startDate = data.startDate || ''
			this.endDate = data.endDate || ''
			this.schedules = data.schedules || {}
			this.bigTasks = data.bigTasks || []
			this.bigTaskHistory = data.bigTaskHistory || []
			this.scheduleTemplates = data.scheduleTemplates || []

			if (data.settings) {
				this.theme = data.settings.theme || 'light'
				this.aiProvider = data.settings.aiProvider || 'deepseek'
			}
			if (data.apiKeys) {
				this.apiKeys = { ...this.apiKeys, ...data.apiKeys }
			}
			if (data.userProfile) {
				this.userProfile = data.userProfile
			}
		},

		// ====== Load/Save ======

		loadLocal() {
			const data = storage.getJSON(USER_DATA_KEY)
			if (data && data.schedules) {
				this.restoreState(data)
				console.log('[Store] Loaded from local:', Object.keys(data.schedules).length, 'schedules')
				return true
			}
			return false
		},

		saveLocal() {
			const data = this.collectAll()
			storage.setJSON(USER_DATA_KEY, data)
			console.log('[Store] Saved to local')
		},

		// ====== Getters (parameterized) ======

		getSchedule(dateStr: string) {
			return this.schedules[dateStr] || null
		},

		getTasks(dateStr: string) {
			return this.schedules[dateStr]?.tasks || []
		},

		getTimeSlots(dateStr: string) {
			return this.schedules[dateStr]?.timeSlots || []
		},

		// ====== Auth ======

		async login(username: string, password: string) {
			try {
				const data = await loginRPC(username, password)
				if (data && data.success) {
					this.currentUser = { userId: data.user_id, username: data.username }
					this.isLoggedIn = true
					uni.setStorageSync(AUTH_TOKEN_KEY, data.token)
					console.log('[Store] Login success:', data.username)

					await this.loadCloud()
					return { success: true, username: data.username }
				}
				return { success: false, error: data?.error || 'Login failed' }
			} catch (err) {
				return { success: false, error: 'Network error, please retry' }
			}
		},

		async register(username: string, password: string) {
			try {
				const data = await registerRPC(username, password)
				if (data && data.success) {
					this.currentUser = { userId: data.user_id, username: data.username }
					this.isLoggedIn = true
					uni.setStorageSync(AUTH_TOKEN_KEY, data.token)
					console.log('[Store] Register success:', data.username)

					await this.loadCloud()
					return { success: true, username: data.username }
				}
				return { success: false, error: data?.error || 'Register failed' }
			} catch (err) {
				return { success: false, error: 'Network error, please retry' }
			}
		},

		logout() {
			this.currentUser = null
			this.isLoggedIn = false
			uni.removeStorageSync(AUTH_TOKEN_KEY)
			uni.removeStorageSync(CREDENTIALS_KEY)
			console.log('[Store] Logged out')
		},

		async restoreSession(token: string) {
			if (!token) return false
			try {
				const data = JSON.parse(atob(token.split('.')[1]))
				if (data.sub && data.exp * 1000 > Date.now()) {
					this.currentUser = { userId: data.sub, username: data.username || data.sub }
					this.isLoggedIn = true
					return true
				}
			} catch (e) {
				console.warn('[Store] Invalid token format')
			}
			return false
		},

		// ====== Cloud Sync ======

		async loadCloud() {
			if (!this.currentUser) return
			this.isSyncing = true
			try {
				const data = await getUserDataRPC(this.currentUser.userId)
				if (data && data.success && data.exists && data.schedule_data) {
					this.mergeCloudToLocal(data.schedule_data)
					console.log('[Store] Cloud data loaded')
				}
			} catch (e: any) {
				console.warn('[Store] Cloud load failed:', e.message)
			} finally {
				this.isSyncing = false
			}
		},

		async saveCloud() {
			if (!this.currentUser) return false
			this.isSyncing = true
			try {
				const data = this.collectAll()
				await upsertUserDataRPC(this.currentUser.userId, data)
				console.log('[Store] Cloud save success')
				return true
			} catch (e: any) {
				console.warn('[Store] Cloud save failed:', e.message)
				return false
			} finally {
				this.isSyncing = false
			}
		},

		mergeCloudToLocal(cloudData: any) {
			if (!cloudData || !cloudData.schedules) return

			const localKeys = Object.keys(this.schedules)
			let addedCount = 0

			for (const [date, schedule] of Object.entries(cloudData.schedules)) {
				if (!localKeys.includes(date)) {
					this.schedules[date] = schedule as any
					addedCount++
				}
			}

			if (cloudData.bigTasks && cloudData.bigTasks.length > this.bigTasks.length) {
				this.bigTasks = cloudData.bigTasks
			}

			if (cloudData.scheduleTemplates && cloudData.scheduleTemplates.length > this.scheduleTemplates.length) {
				this.scheduleTemplates = cloudData.scheduleTemplates
			}

			if (addedCount > 0) {
				console.log('[Store] Merged', addedCount, 'schedules from cloud')
				this.saveLocal()
			}
		},

		// ====== Schedule CRUD ======

		addTimeSlot(dateStr: string, slot: any) {
			if (!this.schedules[dateStr]) {
				this.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
			}
			this.schedules[dateStr].timeSlots.push(slot)
			this._saveLocalDebounced()
		},

		removeTimeSlot(dateStr: string, index: number) {
			if (this.schedules[dateStr]?.timeSlots) {
				this.schedules[dateStr].timeSlots.splice(index, 1)
				this._saveLocalDebounced()
			}
		},

		updateTimeSlot(dateStr: string, index: number, newSlot: any) {
			if (this.schedules[dateStr]?.timeSlots) {
				this.schedules[dateStr].timeSlots[index] = newSlot
				this._saveLocalDebounced()
			}
		},

		addTask(dateStr: string, task: any) {
			if (!this.schedules[dateStr]) {
				this.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
			}
			this.schedules[dateStr].tasks.push(task)
			this._saveLocalDebounced()
		},

		completeTask(dateStr: string, taskIndex: number, actualMinutes?: number) {
			const tasks = this.schedules[dateStr]?.tasks
			if (tasks && tasks[taskIndex]) {
				tasks[taskIndex].completed = true
				tasks[taskIndex].actualMinutes = actualMinutes || tasks[taskIndex].estimatedMinutes
				this._saveLocalDebounced()
			}
		},

		removeTask(dateStr: string, taskIndex: number) {
			if (this.schedules[dateStr]?.tasks) {
				this.schedules[dateStr].tasks.splice(taskIndex, 1)
				this._saveLocalDebounced()
			}
		},

		setDateTitle(dateStr: string, title?: string, highlights?: string) {
			if (!this.schedules[dateStr]) {
				this.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
			}
			if (title !== undefined) this.schedules[dateStr].title = title
			if (highlights !== undefined) this.schedules[dateStr].highlights = highlights
			this._saveLocalDebounced()
		},

		// ====== Big Tasks ======

		addBigTask(task: any) {
			this.bigTasks.push(task)
			this._saveLocalDebounced()
		},

		updateBigTask(index: number, updates: any) {
			if (this.bigTasks[index]) {
				Object.assign(this.bigTasks[index], updates)
				this._saveLocalDebounced()
			}
		},

		completeBigTask(index: number) {
			if (this.bigTasks[index]) {
				this.bigTasks[index].completed = true
				this.bigTaskHistory.push({
					...this.bigTasks[index],
					completedAt: new Date().toISOString()
				})
				this._saveLocalDebounced()
			}
		},

		removeBigTask(index: number) {
			this.bigTasks.splice(index, 1)
			this._saveLocalDebounced()
		},

		// ====== Settings ======

		setTheme(theme: string) {
			this.theme = theme
			this._saveLocalDebounced()
		},

		setAIProvider(provider: string) {
			this.aiProvider = provider
			this._saveLocalDebounced()
		},

		setApiKey(provider: string, key: string) {
			this.apiKeys[provider] = key
			this._saveLocalDebounced()
		},

		setUserProfile(profile: string) {
			this.userProfile = profile
			this._saveLocalDebounced()
		}
	}
})