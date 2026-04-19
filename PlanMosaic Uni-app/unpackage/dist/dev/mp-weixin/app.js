"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const common_vendor = require("./common/vendor.js");
const utils_supabase = require("./utils/supabase.js");
const store_schedule = require("./store/schedule.js");
if (!Math) {
  "./pages/schedule/schedule.js";
  "./pages/timetable/timetable.js";
  "./pages/mosa/mosa.js";
  "./pages/profile/profile.js";
}
const _sfc_main = {
  onLaunch: function() {
    common_vendor.index.__f__("log", "at App.vue:7", "[App] PlanMosaic Launch");
    utils_supabase.initSupabase();
    const store = store_schedule.useScheduleStore();
    store.loadLocal();
    this.autoLogin();
  },
  onShow: function() {
    common_vendor.index.__f__("log", "at App.vue:20", "[App] Show");
  },
  onHide: function() {
    common_vendor.index.__f__("log", "at App.vue:23", "[App] Hide");
  },
  methods: {
    async autoLogin() {
      const store = store_schedule.useScheduleStore();
      const saved = common_vendor.index.getStorageSync("mosaique-credentials");
      if (saved) {
        try {
          const { username, password } = JSON.parse(saved);
          const result = await store.login(username, password);
          if (result.success) {
            common_vendor.index.__f__("log", "at App.vue:34", "[App] Auto-login successful:", result.username);
          } else {
            common_vendor.index.removeStorageSync("mosaique-credentials");
          }
        } catch (e) {
          common_vendor.index.__f__("warn", "at App.vue:39", "[App] Auto-login failed:", e);
          common_vendor.index.removeStorageSync("mosaique-credentials");
        }
      }
    }
  }
};
function createApp() {
  const app = common_vendor.createSSRApp(_sfc_main);
  return {
    app
  };
}
createApp().app.mount("#app");
exports.createApp = createApp;
//# sourceMappingURL=../.sourcemap/mp-weixin/app.js.map
