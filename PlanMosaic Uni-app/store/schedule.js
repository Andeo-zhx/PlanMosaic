/**
 * PlanMosaic - Schedule Data Store
 *
 * Reactive state management using Vue 3 reactivity (no Pinia dependency).
 * Handles local persistence + cloud sync via Supabase RPC.
 */

import { reactive, computed } from 'vue'
import { loginRPC, registerRPC, getUserDataRPC, upsertUserDataRPC, storage } from '@/utils/supabase.js'

const LOCAL_DATA_KEY = 'mosaique-user-data'
const CREDENTIALS_KEY = 'mosaique-credentials'

const EMPTY_DATA = {
	startDate: '',
	endDate: '',
	schedules: {},
	bigTasks: [],
	bigTaskHistory: [],
	scheduleTemplates: [],
	settings: {
		theme: 'light',
		aiProvider: 'deepseek'
	},
	apiKeys: {
		deepseek: '',
		qwen: ''
	},
	userProfile: ''
}

// ============ Reactive State ============

const state = reactive({
	// User
	currentUser: null,       // { userId, username }
	isLoggedIn: false,

	// Schedule data
	startDate: '',
	endDate: '',
	schedules: {},           // { 'YYYY-MM-DD': { title, highlights, milestone, timeSlots, tasks } }
	bigTasks: [],
	bigTaskHistory: [],
	scheduleTemplates: [],

	// Settings
	theme: 'light',
	aiProvider: 'deepseek',

	// API Keys
	apiKeys: {
		deepseek: '',
		qwen: ''
	},

	// User profile (AI-extracted)
	userProfile: '',

	// UI state
	isLoading: false,
	isSyncing: false
})

// ============ Computed ============

const todayStr = computed(() => {
	const now = new Date()
	const y = now.getFullYear()
	const m = String(now.getMonth() + 1).padStart(2, '0')
	const d = String(now.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
})

// Get all dates that have schedules (sorted)
const scheduledDates = computed(() => {
	return Object.keys(state.schedules).sort()
})

// Get schedule for a specific date
function getSchedule(dateStr) {
	return state.schedules[dateStr] || null
}

// Get tasks for a specific date
function getTasks(dateStr) {
	return state.schedules[dateStr]?.tasks || []
}

// Get timeSlots for a specific date
function getTimeSlots(dateStr) {
	return state.schedules[dateStr]?.timeSlots || []
}

// ============ Actions ============

/**
 * Load data from local storage
 */
function loadLocal() {
	const data = storage.getJSON(LOCAL_DATA_KEY)
	if (data && data.schedules) {
		restoreState(data)
		console.log('[Store] Loaded from local:', Object.keys(data.schedules).length, 'schedules')
		return true
	}
	return false
}

/**
 * Save current state to local storage
 */
function saveLocal() {
	const data = collectAll()
	storage.setJSON(LOCAL_DATA_KEY, data)
	console.log('[Store] Saved to local')
}

/**
 * Collect all state data into a plain object
 */
function collectAll() {
	return {
		startDate: state.startDate,
		endDate: state.endDate,
		schedules: JSON.parse(JSON.stringify(state.schedules)),
		bigTasks: JSON.parse(JSON.stringify(state.bigTasks)),
		bigTaskHistory: JSON.parse(JSON.stringify(state.bigTaskHistory)),
		scheduleTemplates: JSON.parse(JSON.stringify(state.scheduleTemplates)),
		settings: {
			theme: state.theme,
			aiProvider: state.aiProvider
		},
		apiKeys: { ...state.apiKeys },
		userProfile: state.userProfile
	}
}

/**
 * Restore state from a data object
 */
function restoreState(data) {
	if (!data) return
	state.startDate = data.startDate || ''
	state.endDate = data.endDate || ''
	state.schedules = data.schedules || {}
	state.bigTasks = data.bigTasks || []
	state.bigTaskHistory = data.bigTaskHistory || []
	state.scheduleTemplates = data.scheduleTemplates || []

	if (data.settings) {
		state.theme = data.settings.theme || 'light'
		state.aiProvider = data.settings.aiProvider || 'deepseek'
	}
	if (data.apiKeys) {
		state.apiKeys = { ...state.apiKeys, ...data.apiKeys }
	}
	if (data.userProfile) {
		state.userProfile = data.userProfile
	}
}

// ============ Auth ============

async function login(username, password) {
	try {
		const data = await loginRPC(username, password)
		if (data && data.success) {
			state.currentUser = { userId: data.user_id, username: data.username }
			state.isLoggedIn = true
			storage.setJSON(CREDENTIALS_KEY, { username, password })
			console.log('[Store] Login success:', data.username)

			// Load cloud data after login
			await loadCloud()
			return { success: true, username: data.username }
		}
		return { success: false, error: data?.error || 'Login failed' }
	} catch (err) {
		return { success: false, error: 'Network error, please retry' }
	}
}

async function register(username, password) {
	try {
		const data = await registerRPC(username, password)
		if (data && data.success) {
			state.currentUser = { userId: data.user_id, username: data.username }
			state.isLoggedIn = true
			storage.setJSON(CREDENTIALS_KEY, { username, password })
			console.log('[Store] Register success:', data.username)
			return { success: true, username: data.username }
		}
		return { success: false, error: data?.error || 'Register failed' }
	} catch (err) {
		return { success: false, error: 'Network error, please retry' }
	}
}

function logout() {
	state.currentUser = null
	state.isLoggedIn = false
	storage.remove(CREDENTIALS_KEY)
	console.log('[Store] Logged out')
}

// ============ Cloud Sync ============

async function loadCloud() {
	if (!state.currentUser) return
	state.isSyncing = true
	try {
		const data = await getUserDataRPC(state.currentUser.userId)
		if (data && data.success && data.exists && data.schedule_data) {
			mergeCloudToLocal(data.schedule_data)
			console.log('[Store] Cloud data loaded')
		}
	} catch (e) {
		console.warn('[Store] Cloud load failed:', e.message)
	} finally {
		state.isSyncing = false
	}
}

async function saveCloud() {
	if (!state.currentUser) return false
	state.isSyncing = true
	try {
		const data = collectAll()
		await upsertUserDataRPC(state.currentUser.userId, data)
		console.log('[Store] Cloud save success')
		return true
	} catch (e) {
		console.warn('[Store] Cloud save failed:', e.message)
		return false
	} finally {
		state.isSyncing = false
	}
}

function mergeCloudToLocal(cloudData) {
	if (!cloudData || !cloudData.schedules) return

	const localKeys = Object.keys(state.schedules)
	let addedCount = 0

	for (const [date, schedule] of Object.entries(cloudData.schedules)) {
		if (!localKeys.includes(date)) {
			state.schedules[date] = schedule
			addedCount++
		}
	}

	// Merge big tasks if cloud has more
	if (cloudData.bigTasks && cloudData.bigTasks.length > state.bigTasks.length) {
		state.bigTasks = cloudData.bigTasks
	}

	// Merge templates
	if (cloudData.scheduleTemplates && cloudData.scheduleTemplates.length > state.scheduleTemplates.length) {
		state.scheduleTemplates = cloudData.scheduleTemplates
	}

	if (addedCount > 0) {
		console.log('[Store] Merged', addedCount, 'schedules from cloud')
		saveLocal()
	}
}

// ============ Schedule CRUD ============

function addTimeSlot(dateStr, slot) {
	if (!state.schedules[dateStr]) {
		state.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
	}
	state.schedules[dateStr].timeSlots.push(slot)
	saveLocal()
}

function removeTimeSlot(dateStr, index) {
	if (state.schedules[dateStr]?.timeSlots) {
		state.schedules[dateStr].timeSlots.splice(index, 1)
		saveLocal()
	}
}

function updateTimeSlot(dateStr, index, newSlot) {
	if (state.schedules[dateStr]?.timeSlots) {
		state.schedules[dateStr].timeSlots[index] = newSlot
		saveLocal()
	}
}

function addTask(dateStr, task) {
	if (!state.schedules[dateStr]) {
		state.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
	}
	state.schedules[dateStr].tasks.push(task)
	saveLocal()
}

function completeTask(dateStr, taskIndex, actualMinutes) {
	const tasks = state.schedules[dateStr]?.tasks
	if (tasks && tasks[taskIndex]) {
		tasks[taskIndex].completed = true
		tasks[taskIndex].actualMinutes = actualMinutes || tasks[taskIndex].estimatedMinutes
		saveLocal()
	}
}

function removeTask(dateStr, taskIndex) {
	if (state.schedules[dateStr]?.tasks) {
		state.schedules[dateStr].tasks.splice(taskIndex, 1)
		saveLocal()
	}
}

function setDateTitle(dateStr, title, highlights) {
	if (!state.schedules[dateStr]) {
		state.schedules[dateStr] = { title: '', highlights: '', milestone: '', timeSlots: [], tasks: [] }
	}
	if (title !== undefined) state.schedules[dateStr].title = title
	if (highlights !== undefined) state.schedules[dateStr].highlights = highlights
	saveLocal()
}

// ============ Big Tasks ============

function addBigTask(task) {
	state.bigTasks.push(task)
	saveLocal()
}

function updateBigTask(index, updates) {
	if (state.bigTasks[index]) {
		Object.assign(state.bigTasks[index], updates)
		saveLocal()
	}
}

function completeBigTask(index) {
	if (state.bigTasks[index]) {
		state.bigTasks[index].completed = true
		state.bigTaskHistory.push({
			...state.bigTasks[index],
			completedAt: new Date().toISOString()
		})
		saveLocal()
	}
}

function removeBigTask(index) {
	state.bigTasks.splice(index, 1)
	saveLocal()
}

// ============ Settings ============

function setTheme(theme) {
	state.theme = theme
	saveLocal()
}

function setAIProvider(provider) {
	state.aiProvider = provider
	saveLocal()
}

function setApiKey(provider, key) {
	state.apiKeys[provider] = key
	saveLocal()
}

function setUserProfile(profile) {
	state.userProfile = profile
	saveLocal()
}

// ============ Export Store Hook ============

export function useScheduleStore() {
	return {
		// State (readonly via spread)
		state,

		// Computed
		todayStr,
		scheduledDates,

		// Getters
		getSchedule,
		getTasks,
		getTimeSlots,

		// Auth
		login,
		register,
		logout,

		// Data persistence
		loadLocal,
		saveLocal,
		loadCloud,
		saveCloud,

		// Schedule CRUD
		addTimeSlot,
		removeTimeSlot,
		updateTimeSlot,
		addTask,
		completeTask,
		removeTask,
		setDateTitle,

		// Big Tasks
		addBigTask,
		updateBigTask,
		completeBigTask,
		removeBigTask,

		// Settings
		setTheme,
		setAIProvider,
		setApiKey,
		setUserProfile
	}
}
