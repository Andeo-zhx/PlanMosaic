"use strict";
const common_vendor = require("../common/vendor.js");
const utils_supabase = require("../utils/supabase.js");
const LOCAL_DATA_KEY = "mosaique-user-data";
const CREDENTIALS_KEY = "mosaique-credentials";
const state = common_vendor.reactive({
  // User
  currentUser: null,
  // { userId, username }
  isLoggedIn: false,
  // Schedule data
  startDate: "",
  endDate: "",
  schedules: {},
  // { 'YYYY-MM-DD': { title, highlights, milestone, timeSlots, tasks } }
  bigTasks: [],
  bigTaskHistory: [],
  scheduleTemplates: [],
  // Settings
  theme: "light",
  aiProvider: "deepseek",
  // API Keys
  apiKeys: {
    deepseek: "",
    qwen: ""
  },
  // User profile (AI-extracted)
  userProfile: "",
  // UI state
  isLoading: false,
  isSyncing: false
});
const todayStr = common_vendor.computed(() => {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
});
const scheduledDates = common_vendor.computed(() => {
  return Object.keys(state.schedules).sort();
});
function getSchedule(dateStr) {
  return state.schedules[dateStr] || null;
}
function getTasks(dateStr) {
  var _a;
  return ((_a = state.schedules[dateStr]) == null ? void 0 : _a.tasks) || [];
}
function getTimeSlots(dateStr) {
  var _a;
  return ((_a = state.schedules[dateStr]) == null ? void 0 : _a.timeSlots) || [];
}
function loadLocal() {
  const data = utils_supabase.storage.getJSON(LOCAL_DATA_KEY);
  if (data && data.schedules) {
    restoreState(data);
    common_vendor.index.__f__("log", "at store/schedule.js:104", "[Store] Loaded from local:", Object.keys(data.schedules).length, "schedules");
    return true;
  }
  return false;
}
function saveLocal() {
  const data = collectAll();
  utils_supabase.storage.setJSON(LOCAL_DATA_KEY, data);
  common_vendor.index.__f__("log", "at store/schedule.js:116", "[Store] Saved to local");
}
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
  };
}
function restoreState(data) {
  if (!data)
    return;
  state.startDate = data.startDate || "";
  state.endDate = data.endDate || "";
  state.schedules = data.schedules || {};
  state.bigTasks = data.bigTasks || [];
  state.bigTaskHistory = data.bigTaskHistory || [];
  state.scheduleTemplates = data.scheduleTemplates || [];
  if (data.settings) {
    state.theme = data.settings.theme || "light";
    state.aiProvider = data.settings.aiProvider || "deepseek";
  }
  if (data.apiKeys) {
    state.apiKeys = { ...state.apiKeys, ...data.apiKeys };
  }
  if (data.userProfile) {
    state.userProfile = data.userProfile;
  }
}
async function login(username, password) {
  try {
    const data = await utils_supabase.loginRPC(username, password);
    if (data && data.success) {
      state.currentUser = { userId: data.user_id, username: data.username };
      state.isLoggedIn = true;
      utils_supabase.storage.setJSON(CREDENTIALS_KEY, { username, password });
      common_vendor.index.__f__("log", "at store/schedule.js:172", "[Store] Login success:", data.username);
      await loadCloud();
      return { success: true, username: data.username };
    }
    return { success: false, error: (data == null ? void 0 : data.error) || "Login failed" };
  } catch (err) {
    return { success: false, error: "Network error, please retry" };
  }
}
async function register(username, password) {
  try {
    const data = await utils_supabase.registerRPC(username, password);
    if (data && data.success) {
      state.currentUser = { userId: data.user_id, username: data.username };
      state.isLoggedIn = true;
      utils_supabase.storage.setJSON(CREDENTIALS_KEY, { username, password });
      common_vendor.index.__f__("log", "at store/schedule.js:191", "[Store] Register success:", data.username);
      return { success: true, username: data.username };
    }
    return { success: false, error: (data == null ? void 0 : data.error) || "Register failed" };
  } catch (err) {
    return { success: false, error: "Network error, please retry" };
  }
}
function logout() {
  state.currentUser = null;
  state.isLoggedIn = false;
  utils_supabase.storage.remove(CREDENTIALS_KEY);
  common_vendor.index.__f__("log", "at store/schedule.js:204", "[Store] Logged out");
}
async function loadCloud() {
  if (!state.currentUser)
    return;
  state.isSyncing = true;
  try {
    const data = await utils_supabase.getUserDataRPC(state.currentUser.userId);
    if (data && data.success && data.exists && data.schedule_data) {
      mergeCloudToLocal(data.schedule_data);
      common_vendor.index.__f__("log", "at store/schedule.js:216", "[Store] Cloud data loaded");
    }
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/schedule.js:219", "[Store] Cloud load failed:", e.message);
  } finally {
    state.isSyncing = false;
  }
}
async function saveCloud() {
  if (!state.currentUser)
    return false;
  state.isSyncing = true;
  try {
    const data = collectAll();
    await utils_supabase.upsertUserDataRPC(state.currentUser.userId, data);
    common_vendor.index.__f__("log", "at store/schedule.js:231", "[Store] Cloud save success");
    return true;
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/schedule.js:234", "[Store] Cloud save failed:", e.message);
    return false;
  } finally {
    state.isSyncing = false;
  }
}
function mergeCloudToLocal(cloudData) {
  if (!cloudData || !cloudData.schedules)
    return;
  const localKeys = Object.keys(state.schedules);
  let addedCount = 0;
  for (const [date, schedule] of Object.entries(cloudData.schedules)) {
    if (!localKeys.includes(date)) {
      state.schedules[date] = schedule;
      addedCount++;
    }
  }
  if (cloudData.bigTasks && cloudData.bigTasks.length > state.bigTasks.length) {
    state.bigTasks = cloudData.bigTasks;
  }
  if (cloudData.scheduleTemplates && cloudData.scheduleTemplates.length > state.scheduleTemplates.length) {
    state.scheduleTemplates = cloudData.scheduleTemplates;
  }
  if (addedCount > 0) {
    common_vendor.index.__f__("log", "at store/schedule.js:265", "[Store] Merged", addedCount, "schedules from cloud");
    saveLocal();
  }
}
function addTimeSlot(dateStr, slot) {
  if (!state.schedules[dateStr]) {
    state.schedules[dateStr] = { title: "", highlights: "", milestone: "", timeSlots: [], tasks: [] };
  }
  state.schedules[dateStr].timeSlots.push(slot);
  saveLocal();
}
function removeTimeSlot(dateStr, index) {
  var _a;
  if ((_a = state.schedules[dateStr]) == null ? void 0 : _a.timeSlots) {
    state.schedules[dateStr].timeSlots.splice(index, 1);
    saveLocal();
  }
}
function updateTimeSlot(dateStr, index, newSlot) {
  var _a;
  if ((_a = state.schedules[dateStr]) == null ? void 0 : _a.timeSlots) {
    state.schedules[dateStr].timeSlots[index] = newSlot;
    saveLocal();
  }
}
function addTask(dateStr, task) {
  if (!state.schedules[dateStr]) {
    state.schedules[dateStr] = { title: "", highlights: "", milestone: "", timeSlots: [], tasks: [] };
  }
  state.schedules[dateStr].tasks.push(task);
  saveLocal();
}
function completeTask(dateStr, taskIndex, actualMinutes) {
  var _a;
  const tasks = (_a = state.schedules[dateStr]) == null ? void 0 : _a.tasks;
  if (tasks && tasks[taskIndex]) {
    tasks[taskIndex].completed = true;
    tasks[taskIndex].actualMinutes = actualMinutes || tasks[taskIndex].estimatedMinutes;
    saveLocal();
  }
}
function removeTask(dateStr, taskIndex) {
  var _a;
  if ((_a = state.schedules[dateStr]) == null ? void 0 : _a.tasks) {
    state.schedules[dateStr].tasks.splice(taskIndex, 1);
    saveLocal();
  }
}
function setDateTitle(dateStr, title, highlights) {
  if (!state.schedules[dateStr]) {
    state.schedules[dateStr] = { title: "", highlights: "", milestone: "", timeSlots: [], tasks: [] };
  }
  if (title !== void 0)
    state.schedules[dateStr].title = title;
  if (highlights !== void 0)
    state.schedules[dateStr].highlights = highlights;
  saveLocal();
}
function addBigTask(task) {
  state.bigTasks.push(task);
  saveLocal();
}
function updateBigTask(index, updates) {
  if (state.bigTasks[index]) {
    Object.assign(state.bigTasks[index], updates);
    saveLocal();
  }
}
function completeBigTask(index) {
  if (state.bigTasks[index]) {
    state.bigTasks[index].completed = true;
    state.bigTaskHistory.push({
      ...state.bigTasks[index],
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    saveLocal();
  }
}
function removeBigTask(index) {
  state.bigTasks.splice(index, 1);
  saveLocal();
}
function setTheme(theme) {
  state.theme = theme;
  saveLocal();
}
function setAIProvider(provider) {
  state.aiProvider = provider;
  saveLocal();
}
function setApiKey(provider, key) {
  state.apiKeys[provider] = key;
  saveLocal();
}
function setUserProfile(profile) {
  state.userProfile = profile;
  saveLocal();
}
function useScheduleStore() {
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
  };
}
exports.useScheduleStore = useScheduleStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/schedule.js.map
