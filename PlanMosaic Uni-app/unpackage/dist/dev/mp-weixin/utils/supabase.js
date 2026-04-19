"use strict";
const common_vendor = require("../common/vendor.js");
const SUPABASE_URL = "https://nxbnognnkifiiitvbupq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Ym5vZ25ua2lmaWlpdHZidXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTkzMDAsImV4cCI6MjA4OTczNTMwMH0.ATSkFMfkPF5O7w-q8mEkBVuatN9NKsJTNgQadwqJuUM";
const SUPABASE_RPC = SUPABASE_URL + "/rest/v1/rpc/";
let _initialized = false;
function initSupabase() {
  if (_initialized)
    return;
  _initialized = true;
  common_vendor.index.__f__("log", "at utils/supabase.js:21", "[Supabase] Initialized (uni.request mode)");
}
function supabaseRPC(functionName, params) {
  return new Promise((resolve, reject) => {
    common_vendor.index.request({
      url: SUPABASE_RPC + functionName,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Prefer": "return=representation"
      },
      data: params,
      success: (res) => {
        var _a, _b;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const errMsg = typeof res.data === "string" ? res.data : ((_a = res.data) == null ? void 0 : _a.message) || ((_b = res.data) == null ? void 0 : _b.error) || JSON.stringify(res.data);
          reject(new Error("HTTP " + res.statusCode + ": " + errMsg));
        }
      },
      fail: (err) => {
        reject(new Error("Network error: " + (err.errMsg || err.message || "Unknown")));
      }
    });
  });
}
async function loginRPC(username, password) {
  return supabaseRPC("login_user", {
    p_username: username,
    p_password: password
  });
}
async function registerRPC(username, password) {
  return supabaseRPC("register_user", {
    p_username: username,
    p_password: password
  });
}
async function getUserDataRPC(userId) {
  return supabaseRPC("get_user_data", {
    p_user_id: userId
  });
}
async function upsertUserDataRPC(userId, scheduleData) {
  return supabaseRPC("upsert_user_data", {
    p_user_id: userId,
    p_schedule_data: scheduleData
  });
}
const storage = {
  get(key) {
    return common_vendor.index.getStorageSync(key);
  },
  set(key, value) {
    common_vendor.index.setStorageSync(key, value);
  },
  remove(key) {
    common_vendor.index.removeStorageSync(key);
  },
  getJSON(key) {
    const raw = common_vendor.index.getStorageSync(key);
    if (raw) {
      try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return null;
      }
    }
    return null;
  },
  setJSON(key, value) {
    common_vendor.index.setStorageSync(key, JSON.stringify(value));
  }
};
exports.getUserDataRPC = getUserDataRPC;
exports.initSupabase = initSupabase;
exports.loginRPC = loginRPC;
exports.registerRPC = registerRPC;
exports.storage = storage;
exports.upsertUserDataRPC = upsertUserDataRPC;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/supabase.js.map
