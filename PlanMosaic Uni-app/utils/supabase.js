/**
 * PlanMosaic - Supabase Utility Module
 *
 * Direct RPC calls via uni.request (no SDK needed),
 * adapted from the desktop Electron version.
 * Storage is overridden to use uni.getStorageSync / setStorageSync.
 */

const SUPABASE_URL = 'https://nxbnognnkifiiitvbupq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Ym5vZ25ua2lmaWlpdHZidXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTkzMDAsImV4cCI6MjA4OTczNTMwMH0.ATSkFMfkPF5O7w-q8mEkBVuatN9NKsJTNgQadwqJuUM'
const SUPABASE_RPC = SUPABASE_URL + '/rest/v1/rpc/'

let _initialized = false

/**
 * Initialize Supabase - override auth storage for non-browser environments
 */
export function initSupabase() {
	if (_initialized) return
	_initialized = true
	console.log('[Supabase] Initialized (uni.request mode)')
}

/**
 * Generic Supabase RPC call via uni.request
 * @param {string} functionName - RPC function name
 * @param {object} params - Parameters object
 * @returns {Promise<object>} - RPC response data
 */
export function supabaseRPC(functionName, params) {
	return new Promise((resolve, reject) => {
		uni.request({
			url: SUPABASE_RPC + functionName,
			method: 'POST',
			header: {
				'Content-Type': 'application/json',
				'apikey': SUPABASE_ANON_KEY,
				'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
				'Prefer': 'return=representation'
			},
			data: params,
			success: (res) => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(res.data)
				} else {
					const errMsg = typeof res.data === 'string'
						? res.data
						: (res.data?.message || res.data?.error || JSON.stringify(res.data))
					reject(new Error('HTTP ' + res.statusCode + ': ' + errMsg))
				}
			},
			fail: (err) => {
				reject(new Error('Network error: ' + (err.errMsg || err.message || 'Unknown')))
			}
		})
	})
}

// ============ Auth RPCs ============

/**
 * Login user via Supabase RPC
 */
export async function loginRPC(username, password) {
	return supabaseRPC('login_user', {
		p_username: username,
		p_password: password
	})
}

/**
 * Register user via Supabase RPC
 */
export async function registerRPC(username, password) {
	return supabaseRPC('register_user', {
		p_username: username,
		p_password: password
	})
}

// ============ Data RPCs ============

/**
 * Load user data from cloud
 */
export async function getUserDataRPC(userId) {
	return supabaseRPC('get_user_data', {
		p_user_id: userId
	})
}

/**
 * Save user data to cloud
 */
export async function upsertUserDataRPC(userId, scheduleData) {
	return supabaseRPC('upsert_user_data', {
		p_user_id: userId,
		p_schedule_data: scheduleData
	})
}

// ============ AI Chat (via Electron IPC or server proxy) ============

/**
 * AI chat - requires a backend proxy (server.js)
 * In mobile, we call the local server or a cloud proxy
 */
export async function agentChatRequest(message, history, profile, scheduleData) {
	// For mobile, AI chat needs a server endpoint
	// Default: use the same config from desktop (localhost:8080 or cloud proxy)
	const serverUrl = uni.getStorageSync('mosaique-server-url') || 'http://127.0.0.1:8080'

	return new Promise((resolve, reject) => {
		uni.request({
			url: serverUrl + '/api/agent-chat',
			method: 'POST',
			header: {
				'Content-Type': 'application/json'
			},
			data: {
				message,
				history,
				profile,
				scheduleData
			},
			success: (res) => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(res.data)
				} else {
					reject(new Error('AI server error: ' + res.statusCode))
				}
			},
			fail: (err) => {
				reject(new Error('AI server unreachable: ' + (err.errMsg || '')))
			}
		})
	})
}

// ============ Storage Helpers ============
// In Uni-app, use uni.getStorageSync / setStorageSync instead of localStorage

export const storage = {
	get(key) {
		return uni.getStorageSync(key)
	},
	set(key, value) {
		uni.setStorageSync(key, value)
	},
	remove(key) {
		uni.removeStorageSync(key)
	},
	getJSON(key) {
		const raw = uni.getStorageSync(key)
		if (raw) {
			try {
				return typeof raw === 'string' ? JSON.parse(raw) : raw
			} catch {
				return null
			}
		}
		return null
	},
	setJSON(key, value) {
		uni.setStorageSync(key, JSON.stringify(value))
	}
}
