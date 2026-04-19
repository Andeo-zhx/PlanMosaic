if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  const fontData = [
    {
      "font_class": "arrow-down",
      "unicode": ""
    },
    {
      "font_class": "arrow-left",
      "unicode": ""
    },
    {
      "font_class": "arrow-right",
      "unicode": ""
    },
    {
      "font_class": "arrow-up",
      "unicode": ""
    },
    {
      "font_class": "auth",
      "unicode": ""
    },
    {
      "font_class": "auth-filled",
      "unicode": ""
    },
    {
      "font_class": "back",
      "unicode": ""
    },
    {
      "font_class": "bars",
      "unicode": ""
    },
    {
      "font_class": "calendar",
      "unicode": ""
    },
    {
      "font_class": "calendar-filled",
      "unicode": ""
    },
    {
      "font_class": "camera",
      "unicode": ""
    },
    {
      "font_class": "camera-filled",
      "unicode": ""
    },
    {
      "font_class": "cart",
      "unicode": ""
    },
    {
      "font_class": "cart-filled",
      "unicode": ""
    },
    {
      "font_class": "chat",
      "unicode": ""
    },
    {
      "font_class": "chat-filled",
      "unicode": ""
    },
    {
      "font_class": "chatboxes",
      "unicode": ""
    },
    {
      "font_class": "chatboxes-filled",
      "unicode": ""
    },
    {
      "font_class": "chatbubble",
      "unicode": ""
    },
    {
      "font_class": "chatbubble-filled",
      "unicode": ""
    },
    {
      "font_class": "checkbox",
      "unicode": ""
    },
    {
      "font_class": "checkbox-filled",
      "unicode": ""
    },
    {
      "font_class": "checkmarkempty",
      "unicode": ""
    },
    {
      "font_class": "circle",
      "unicode": ""
    },
    {
      "font_class": "circle-filled",
      "unicode": ""
    },
    {
      "font_class": "clear",
      "unicode": ""
    },
    {
      "font_class": "close",
      "unicode": ""
    },
    {
      "font_class": "closeempty",
      "unicode": ""
    },
    {
      "font_class": "cloud-download",
      "unicode": ""
    },
    {
      "font_class": "cloud-download-filled",
      "unicode": ""
    },
    {
      "font_class": "cloud-upload",
      "unicode": ""
    },
    {
      "font_class": "cloud-upload-filled",
      "unicode": ""
    },
    {
      "font_class": "color",
      "unicode": ""
    },
    {
      "font_class": "color-filled",
      "unicode": ""
    },
    {
      "font_class": "compose",
      "unicode": ""
    },
    {
      "font_class": "contact",
      "unicode": ""
    },
    {
      "font_class": "contact-filled",
      "unicode": ""
    },
    {
      "font_class": "down",
      "unicode": ""
    },
    {
      "font_class": "bottom",
      "unicode": ""
    },
    {
      "font_class": "download",
      "unicode": ""
    },
    {
      "font_class": "download-filled",
      "unicode": ""
    },
    {
      "font_class": "email",
      "unicode": ""
    },
    {
      "font_class": "email-filled",
      "unicode": ""
    },
    {
      "font_class": "eye",
      "unicode": ""
    },
    {
      "font_class": "eye-filled",
      "unicode": ""
    },
    {
      "font_class": "eye-slash",
      "unicode": ""
    },
    {
      "font_class": "eye-slash-filled",
      "unicode": ""
    },
    {
      "font_class": "fire",
      "unicode": ""
    },
    {
      "font_class": "fire-filled",
      "unicode": ""
    },
    {
      "font_class": "flag",
      "unicode": ""
    },
    {
      "font_class": "flag-filled",
      "unicode": ""
    },
    {
      "font_class": "folder-add",
      "unicode": ""
    },
    {
      "font_class": "folder-add-filled",
      "unicode": ""
    },
    {
      "font_class": "font",
      "unicode": ""
    },
    {
      "font_class": "forward",
      "unicode": ""
    },
    {
      "font_class": "gear",
      "unicode": ""
    },
    {
      "font_class": "gear-filled",
      "unicode": ""
    },
    {
      "font_class": "gift",
      "unicode": ""
    },
    {
      "font_class": "gift-filled",
      "unicode": ""
    },
    {
      "font_class": "hand-down",
      "unicode": ""
    },
    {
      "font_class": "hand-down-filled",
      "unicode": ""
    },
    {
      "font_class": "hand-up",
      "unicode": ""
    },
    {
      "font_class": "hand-up-filled",
      "unicode": ""
    },
    {
      "font_class": "headphones",
      "unicode": ""
    },
    {
      "font_class": "heart",
      "unicode": ""
    },
    {
      "font_class": "heart-filled",
      "unicode": ""
    },
    {
      "font_class": "help",
      "unicode": ""
    },
    {
      "font_class": "help-filled",
      "unicode": ""
    },
    {
      "font_class": "home",
      "unicode": ""
    },
    {
      "font_class": "home-filled",
      "unicode": ""
    },
    {
      "font_class": "image",
      "unicode": ""
    },
    {
      "font_class": "image-filled",
      "unicode": ""
    },
    {
      "font_class": "images",
      "unicode": ""
    },
    {
      "font_class": "images-filled",
      "unicode": ""
    },
    {
      "font_class": "info",
      "unicode": ""
    },
    {
      "font_class": "info-filled",
      "unicode": ""
    },
    {
      "font_class": "left",
      "unicode": ""
    },
    {
      "font_class": "link",
      "unicode": ""
    },
    {
      "font_class": "list",
      "unicode": ""
    },
    {
      "font_class": "location",
      "unicode": ""
    },
    {
      "font_class": "location-filled",
      "unicode": ""
    },
    {
      "font_class": "locked",
      "unicode": ""
    },
    {
      "font_class": "locked-filled",
      "unicode": ""
    },
    {
      "font_class": "loop",
      "unicode": ""
    },
    {
      "font_class": "mail-open",
      "unicode": ""
    },
    {
      "font_class": "mail-open-filled",
      "unicode": ""
    },
    {
      "font_class": "map",
      "unicode": ""
    },
    {
      "font_class": "map-filled",
      "unicode": ""
    },
    {
      "font_class": "map-pin",
      "unicode": ""
    },
    {
      "font_class": "map-pin-ellipse",
      "unicode": ""
    },
    {
      "font_class": "medal",
      "unicode": ""
    },
    {
      "font_class": "medal-filled",
      "unicode": ""
    },
    {
      "font_class": "mic",
      "unicode": ""
    },
    {
      "font_class": "mic-filled",
      "unicode": ""
    },
    {
      "font_class": "micoff",
      "unicode": ""
    },
    {
      "font_class": "micoff-filled",
      "unicode": ""
    },
    {
      "font_class": "minus",
      "unicode": ""
    },
    {
      "font_class": "minus-filled",
      "unicode": ""
    },
    {
      "font_class": "more",
      "unicode": ""
    },
    {
      "font_class": "more-filled",
      "unicode": ""
    },
    {
      "font_class": "navigate",
      "unicode": ""
    },
    {
      "font_class": "navigate-filled",
      "unicode": ""
    },
    {
      "font_class": "notification",
      "unicode": ""
    },
    {
      "font_class": "notification-filled",
      "unicode": ""
    },
    {
      "font_class": "paperclip",
      "unicode": ""
    },
    {
      "font_class": "paperplane",
      "unicode": ""
    },
    {
      "font_class": "paperplane-filled",
      "unicode": ""
    },
    {
      "font_class": "person",
      "unicode": ""
    },
    {
      "font_class": "person-filled",
      "unicode": ""
    },
    {
      "font_class": "personadd",
      "unicode": ""
    },
    {
      "font_class": "personadd-filled",
      "unicode": ""
    },
    {
      "font_class": "personadd-filled-copy",
      "unicode": ""
    },
    {
      "font_class": "phone",
      "unicode": ""
    },
    {
      "font_class": "phone-filled",
      "unicode": ""
    },
    {
      "font_class": "plus",
      "unicode": ""
    },
    {
      "font_class": "plus-filled",
      "unicode": ""
    },
    {
      "font_class": "plusempty",
      "unicode": ""
    },
    {
      "font_class": "pulldown",
      "unicode": ""
    },
    {
      "font_class": "pyq",
      "unicode": ""
    },
    {
      "font_class": "qq",
      "unicode": ""
    },
    {
      "font_class": "redo",
      "unicode": ""
    },
    {
      "font_class": "redo-filled",
      "unicode": ""
    },
    {
      "font_class": "refresh",
      "unicode": ""
    },
    {
      "font_class": "refresh-filled",
      "unicode": ""
    },
    {
      "font_class": "refreshempty",
      "unicode": ""
    },
    {
      "font_class": "reload",
      "unicode": ""
    },
    {
      "font_class": "right",
      "unicode": ""
    },
    {
      "font_class": "scan",
      "unicode": ""
    },
    {
      "font_class": "search",
      "unicode": ""
    },
    {
      "font_class": "settings",
      "unicode": ""
    },
    {
      "font_class": "settings-filled",
      "unicode": ""
    },
    {
      "font_class": "shop",
      "unicode": ""
    },
    {
      "font_class": "shop-filled",
      "unicode": ""
    },
    {
      "font_class": "smallcircle",
      "unicode": ""
    },
    {
      "font_class": "smallcircle-filled",
      "unicode": ""
    },
    {
      "font_class": "sound",
      "unicode": ""
    },
    {
      "font_class": "sound-filled",
      "unicode": ""
    },
    {
      "font_class": "spinner-cycle",
      "unicode": ""
    },
    {
      "font_class": "staff",
      "unicode": ""
    },
    {
      "font_class": "staff-filled",
      "unicode": ""
    },
    {
      "font_class": "star",
      "unicode": ""
    },
    {
      "font_class": "star-filled",
      "unicode": ""
    },
    {
      "font_class": "starhalf",
      "unicode": ""
    },
    {
      "font_class": "trash",
      "unicode": ""
    },
    {
      "font_class": "trash-filled",
      "unicode": ""
    },
    {
      "font_class": "tune",
      "unicode": ""
    },
    {
      "font_class": "tune-filled",
      "unicode": ""
    },
    {
      "font_class": "undo",
      "unicode": ""
    },
    {
      "font_class": "undo-filled",
      "unicode": ""
    },
    {
      "font_class": "up",
      "unicode": ""
    },
    {
      "font_class": "top",
      "unicode": ""
    },
    {
      "font_class": "upload",
      "unicode": ""
    },
    {
      "font_class": "upload-filled",
      "unicode": ""
    },
    {
      "font_class": "videocam",
      "unicode": ""
    },
    {
      "font_class": "videocam-filled",
      "unicode": ""
    },
    {
      "font_class": "vip",
      "unicode": ""
    },
    {
      "font_class": "vip-filled",
      "unicode": ""
    },
    {
      "font_class": "wallet",
      "unicode": ""
    },
    {
      "font_class": "wallet-filled",
      "unicode": ""
    },
    {
      "font_class": "weibo",
      "unicode": ""
    },
    {
      "font_class": "weixin",
      "unicode": ""
    }
  ];
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const getVal = (val) => {
    const reg = /^[0-9]*$/g;
    return typeof val === "number" || reg.test(val) ? val + "px" : val;
  };
  const _sfc_main$6 = {
    name: "UniIcons",
    emits: ["click"],
    props: {
      type: {
        type: String,
        default: ""
      },
      color: {
        type: String,
        default: "#333333"
      },
      size: {
        type: [Number, String],
        default: 16
      },
      customPrefix: {
        type: String,
        default: ""
      },
      fontFamily: {
        type: String,
        default: ""
      }
    },
    data() {
      return {
        icons: fontData
      };
    },
    computed: {
      unicode() {
        let code = this.icons.find((v) => v.font_class === this.type);
        if (code) {
          return code.unicode;
        }
        return "";
      },
      iconSize() {
        return getVal(this.size);
      },
      styleObj() {
        if (this.fontFamily !== "") {
          return `color: ${this.color}; font-size: ${this.iconSize}; font-family: ${this.fontFamily};`;
        }
        return `color: ${this.color}; font-size: ${this.iconSize};`;
      }
    },
    methods: {
      _onClick() {
        this.$emit("click");
      }
    }
  };
  function _sfc_render$5(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock(
      "text",
      {
        style: vue.normalizeStyle($options.styleObj),
        class: vue.normalizeClass(["uni-icons", ["uniui-" + $props.type, $props.customPrefix, $props.customPrefix ? $props.type : ""]]),
        onClick: _cache[0] || (_cache[0] = (...args) => $options._onClick && $options._onClick(...args))
      },
      [
        vue.renderSlot(_ctx.$slots, "default", {}, void 0, true)
      ],
      6
      /* CLASS, STYLE */
    );
  }
  const __easycom_0$1 = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["render", _sfc_render$5], ["__scopeId", "data-v-d31e1c47"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/uni_modules/uni-icons/components/uni-icons/uni-icons.vue"]]);
  function formatAppLog(type, filename, ...args) {
    if (uni.__log__) {
      uni.__log__(type, filename, ...args);
    } else {
      console[type].apply(console, [...args, filename]);
    }
  }
  function resolveEasycom(component, easycom) {
    return typeof component === "string" ? easycom : component;
  }
  const _sfc_main$5 = {
    name: "CustomTabbar",
    props: {
      current: {
        type: String,
        default: "/pages/schedule/schedule"
      }
    },
    data() {
      return {
        tabs: [
          {
            page: "/pages/schedule/schedule",
            label: "Schedule",
            icon: "calendar"
          },
          {
            page: "/pages/timetable/timetable",
            label: "Timetable",
            icon: "bars"
          },
          {
            page: "/pages/mosa/mosa",
            label: "Mosa",
            icon: "chatbubble"
          },
          {
            page: "/pages/profile/profile",
            label: "Me",
            icon: "person"
          }
        ]
      };
    },
    methods: {
      switchTab(page) {
        if (page === this.current)
          return;
        uni.reLaunch({ url: page });
      }
    }
  };
  function _sfc_render$4(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_uni_icons = resolveEasycom(vue.resolveDynamicComponent("uni-icons"), __easycom_0$1);
    return vue.openBlock(), vue.createElementBlock("view", { class: "custom-tabbar" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($data.tabs, (tab, idx) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            key: idx,
            class: vue.normalizeClass(["tab-item", { active: $props.current === tab.page }]),
            "hover-class": "tap-active",
            onClick: ($event) => $options.switchTab(tab.page)
          }, [
            vue.createElementVNode("view", { class: "tab-icon-wrapper" }, [
              vue.createVNode(_component_uni_icons, {
                type: tab.icon,
                size: 22,
                color: $props.current === tab.page ? "#222222" : "#888888"
              }, null, 8, ["type", "color"])
            ]),
            vue.createElementVNode(
              "text",
              { class: "tab-label" },
              vue.toDisplayString(tab.label),
              1
              /* TEXT */
            )
          ], 10, ["onClick"]);
        }),
        128
        /* KEYED_FRAGMENT */
      ))
    ]);
  }
  const __easycom_0 = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$4], ["__scopeId", "data-v-51c48e3c"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/components/custom-tabbar/custom-tabbar.vue"]]);
  const SUPABASE_URL = "https://nxbnognnkifiiitvbupq.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Ym5vZ25ua2lmaWlpdHZidXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTkzMDAsImV4cCI6MjA4OTczNTMwMH0.ATSkFMfkPF5O7w-q8mEkBVuatN9NKsJTNgQadwqJuUM";
  const SUPABASE_RPC = SUPABASE_URL + "/rest/v1/rpc/";
  let _initialized = false;
  function initSupabase() {
    if (_initialized)
      return;
    _initialized = true;
    formatAppLog("log", "at utils/supabase.js:21", "[Supabase] Initialized (uni.request mode)");
  }
  function supabaseRPC(functionName, params) {
    return new Promise((resolve, reject) => {
      uni.request({
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
      return uni.getStorageSync(key);
    },
    set(key, value) {
      uni.setStorageSync(key, value);
    },
    remove(key) {
      uni.removeStorageSync(key);
    },
    getJSON(key) {
      const raw = uni.getStorageSync(key);
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
      uni.setStorageSync(key, JSON.stringify(value));
    }
  };
  const LOCAL_DATA_KEY = "mosaique-user-data";
  const CREDENTIALS_KEY = "mosaique-credentials";
  const state = vue.reactive({
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
  const todayStr$1 = vue.computed(() => {
    const now = /* @__PURE__ */ new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const scheduledDates = vue.computed(() => {
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
    const data = storage.getJSON(LOCAL_DATA_KEY);
    if (data && data.schedules) {
      restoreState(data);
      formatAppLog("log", "at store/schedule.js:104", "[Store] Loaded from local:", Object.keys(data.schedules).length, "schedules");
      return true;
    }
    return false;
  }
  function saveLocal() {
    const data = collectAll();
    storage.setJSON(LOCAL_DATA_KEY, data);
    formatAppLog("log", "at store/schedule.js:116", "[Store] Saved to local");
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
      const data = await loginRPC(username, password);
      if (data && data.success) {
        state.currentUser = { userId: data.user_id, username: data.username };
        state.isLoggedIn = true;
        storage.setJSON(CREDENTIALS_KEY, { username, password });
        formatAppLog("log", "at store/schedule.js:172", "[Store] Login success:", data.username);
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
      const data = await registerRPC(username, password);
      if (data && data.success) {
        state.currentUser = { userId: data.user_id, username: data.username };
        state.isLoggedIn = true;
        storage.setJSON(CREDENTIALS_KEY, { username, password });
        formatAppLog("log", "at store/schedule.js:191", "[Store] Register success:", data.username);
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
    storage.remove(CREDENTIALS_KEY);
    formatAppLog("log", "at store/schedule.js:204", "[Store] Logged out");
  }
  async function loadCloud() {
    if (!state.currentUser)
      return;
    state.isSyncing = true;
    try {
      const data = await getUserDataRPC(state.currentUser.userId);
      if (data && data.success && data.exists && data.schedule_data) {
        mergeCloudToLocal(data.schedule_data);
        formatAppLog("log", "at store/schedule.js:216", "[Store] Cloud data loaded");
      }
    } catch (e) {
      formatAppLog("warn", "at store/schedule.js:219", "[Store] Cloud load failed:", e.message);
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
      await upsertUserDataRPC(state.currentUser.userId, data);
      formatAppLog("log", "at store/schedule.js:231", "[Store] Cloud save success");
      return true;
    } catch (e) {
      formatAppLog("warn", "at store/schedule.js:234", "[Store] Cloud save failed:", e.message);
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
      formatAppLog("log", "at store/schedule.js:265", "[Store] Merged", addedCount, "schedules from cloud");
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
      todayStr: todayStr$1,
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
  function todayStr() {
    const n = /* @__PURE__ */ new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }
  const _sfc_main$4 = {
    components: { customTabbar: __easycom_0 },
    data() {
      return {
        statusBarHeight: 0,
        screenHeight: 0,
        safeBottom: 0,
        selectedDate: todayStr(),
        tabBarReserved: 70
        // tabbar approx height
      };
    },
    computed: {
      store() {
        return useScheduleStore();
      },
      // Scroll area height = screen - statusBar - weekStrip - tabbar
      scrollHeight() {
        const weekStripHeight = 96;
        return this.screenHeight - this.statusBarHeight - weekStripHeight - this.tabBarReserved;
      },
      // FAB bottom offset (above tabbar + safe area)
      fabBottom() {
        return this.tabBarReserved + this.safeBottom + 16;
      },
      // Scroll content bottom spacer (so last items are visible above FAB+TabBar)
      fabBottomOffset() {
        return 120;
      },
      weekDays() {
        if (!this.selectedDate)
          return [];
        return this.buildWeekDays(this.selectedDate);
      },
      schedule() {
        if (!this.selectedDate)
          return null;
        return this.store.getSchedule(this.selectedDate);
      },
      timeSlots() {
        if (!this.selectedDate)
          return [];
        return this.store.getTimeSlots(this.selectedDate);
      },
      tasks() {
        if (!this.selectedDate)
          return [];
        return this.store.getTasks(this.selectedDate);
      },
      dayTitle() {
        if (!this.selectedDate)
          return "";
        const d = /* @__PURE__ */ new Date(this.selectedDate + "T00:00:00");
        const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const isToday = this.selectedDate === this.store.todayStr;
        const prefix = isToday ? "Today  " : "";
        return prefix + (d.getMonth() + 1) + "/" + d.getDate() + "  " + weekLabels[d.getDay()];
      },
      dayHighlights() {
        var _a;
        return ((_a = this.schedule) == null ? void 0 : _a.highlights) || "";
      }
    },
    onReady() {
      var _a;
      const sysInfo = uni.getSystemInfoSync();
      this.statusBarHeight = sysInfo.statusBarHeight || 0;
      this.screenHeight = sysInfo.windowHeight || 700;
      this.safeBottom = ((_a = sysInfo.safeAreaInsets) == null ? void 0 : _a.bottom) || 0;
      this.selectedDate = this.store.todayStr;
    },
    methods: {
      /**
       * Build 7-day array (Mon-Sun) for the week containing `dateStr`
       */
      buildWeekDays(dateStr) {
        const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
        const dow = d.getDay();
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(d);
        monday.setDate(d.getDate() + mondayOffset);
        const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const days = [];
        for (let i = 0; i < 7; i++) {
          const cur = new Date(monday);
          cur.setDate(monday.getDate() + i);
          const y = cur.getFullYear();
          const m = String(cur.getMonth() + 1).padStart(2, "0");
          const dd = String(cur.getDate()).padStart(2, "0");
          const ds = y + "-" + m + "-" + dd;
          days.push({
            dayNum: cur.getDate(),
            weekdayLabel: labels[i],
            dateStr: ds,
            isToday: ds === this.store.todayStr,
            hasSchedule: !!this.store.schedules[ds]
          });
        }
        return days;
      },
      selectDate(dateStr) {
        this.selectedDate = dateStr;
      },
      toggleTask(taskIndex) {
        const task = this.tasks[taskIndex];
        if (task && !task.completed) {
          this.store.completeTask(this.selectedDate, taskIndex, task.estimatedMinutes);
        }
      },
      onFabTap() {
        uni.showToast({ title: "Add schedule (coming soon)", icon: "none" });
      }
    }
  };
  function _sfc_render$3(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_custom_tabbar = resolveEasycom(vue.resolveDynamicComponent("custom-tabbar"), __easycom_0);
    return vue.openBlock(), vue.createElementBlock("view", { class: "page-schedule" }, [
      vue.createElementVNode(
        "view",
        {
          style: vue.normalizeStyle({ height: $data.statusBarHeight + "px" })
        },
        null,
        4
        /* STYLE */
      ),
      vue.createElementVNode("scroll-view", {
        "scroll-x": "",
        class: "week-strip",
        "show-scrollbar": false
      }, [
        vue.createElementVNode("view", { class: "week-inner" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($options.weekDays, (day, idx) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: idx,
                class: vue.normalizeClass(["week-cell", { selected: day.dateStr === $data.selectedDate }]),
                "hover-class": "tap-active",
                onClick: ($event) => $options.selectDate(day.dateStr)
              }, [
                vue.createElementVNode(
                  "text",
                  { class: "cell-weekday" },
                  vue.toDisplayString(day.weekdayLabel),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  {
                    class: vue.normalizeClass(["cell-date", { today: day.isToday }])
                  },
                  vue.toDisplayString(day.dayNum),
                  3
                  /* TEXT, CLASS */
                ),
                day.hasSchedule ? (vue.openBlock(), vue.createElementBlock("view", {
                  key: 0,
                  class: "cell-dot"
                })) : vue.createCommentVNode("v-if", true)
              ], 10, ["onClick"]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ]),
      vue.createElementVNode(
        "scroll-view",
        {
          "scroll-y": "",
          class: "timeline-scroll",
          style: vue.normalizeStyle({ height: $options.scrollHeight + "px" })
        },
        [
          vue.createElementVNode("view", { class: "timeline-body" }, [
            vue.createElementVNode("view", { class: "day-header" }, [
              vue.createElementVNode(
                "text",
                { class: "day-title" },
                vue.toDisplayString($options.dayTitle),
                1
                /* TEXT */
              ),
              $options.dayHighlights ? (vue.openBlock(), vue.createElementBlock(
                "text",
                {
                  key: 0,
                  class: "day-highlights"
                },
                vue.toDisplayString($options.dayHighlights),
                1
                /* TEXT */
              )) : vue.createCommentVNode("v-if", true)
            ]),
            $options.timeSlots.length > 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "section"
            }, [
              (vue.openBlock(true), vue.createElementBlock(
                vue.Fragment,
                null,
                vue.renderList($options.timeSlots, (slot, idx) => {
                  return vue.openBlock(), vue.createElementBlock("view", {
                    key: "ts-" + idx,
                    class: "slot-row",
                    "hover-class": "tap-active"
                  }, [
                    vue.createElementVNode(
                      "text",
                      { class: "slot-time" },
                      vue.toDisplayString(slot.time),
                      1
                      /* TEXT */
                    ),
                    vue.createElementVNode("view", { class: "slot-divider" }),
                    vue.createElementVNode("view", { class: "slot-body" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "slot-activity" },
                        vue.toDisplayString(slot.activity),
                        1
                        /* TEXT */
                      ),
                      slot.detail ? (vue.openBlock(), vue.createElementBlock(
                        "text",
                        {
                          key: 0,
                          class: "slot-detail"
                        },
                        vue.toDisplayString(slot.detail),
                        1
                        /* TEXT */
                      )) : vue.createCommentVNode("v-if", true)
                    ])
                  ]);
                }),
                128
                /* KEYED_FRAGMENT */
              ))
            ])) : vue.createCommentVNode("v-if", true),
            $options.tasks.length > 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "section"
            }, [
              vue.createElementVNode("text", { class: "section-label" }, "TASKS"),
              vue.createElementVNode("view", { class: "pm-divider" }),
              (vue.openBlock(true), vue.createElementBlock(
                vue.Fragment,
                null,
                vue.renderList($options.tasks, (task, idx) => {
                  return vue.openBlock(), vue.createElementBlock("view", {
                    key: "tk-" + idx,
                    class: vue.normalizeClass(["task-row", { done: task.completed }]),
                    "hover-class": "tap-active",
                    onClick: ($event) => $options.toggleTask(idx)
                  }, [
                    vue.createElementVNode(
                      "view",
                      {
                        class: vue.normalizeClass(["task-check", { checked: task.completed }])
                      },
                      [
                        task.completed ? (vue.openBlock(), vue.createElementBlock("text", {
                          key: 0,
                          class: "check-icon"
                        }, "✓")) : vue.createCommentVNode("v-if", true)
                      ],
                      2
                      /* CLASS */
                    ),
                    vue.createElementVNode("view", { class: "task-body" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "task-name" },
                        vue.toDisplayString(task.name),
                        1
                        /* TEXT */
                      ),
                      vue.createElementVNode(
                        "text",
                        { class: "task-meta" },
                        vue.toDisplayString(task.estimatedMinutes) + "min",
                        1
                        /* TEXT */
                      )
                    ])
                  ], 10, ["onClick"]);
                }),
                128
                /* KEYED_FRAGMENT */
              ))
            ])) : vue.createCommentVNode("v-if", true),
            $options.timeSlots.length === 0 && $options.tasks.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 2,
              class: "empty-state"
            }, [
              vue.createElementVNode("text", { class: "empty-text" }, "No schedule for this day")
            ])) : vue.createCommentVNode("v-if", true),
            vue.createElementVNode(
              "view",
              {
                style: vue.normalizeStyle({ height: $options.fabBottomOffset + "px" })
              },
              null,
              4
              /* STYLE */
            )
          ])
        ],
        4
        /* STYLE */
      ),
      vue.createElementVNode(
        "view",
        {
          class: "fab",
          "hover-class": "fab-press",
          style: vue.normalizeStyle({ bottom: $options.fabBottom + "px" }),
          onClick: _cache[0] || (_cache[0] = (...args) => $options.onFabTap && $options.onFabTap(...args))
        },
        [
          vue.createElementVNode("text", { class: "fab-icon" }, "+")
        ],
        4
        /* STYLE */
      ),
      vue.createVNode(_component_custom_tabbar, { current: "/pages/schedule/schedule" })
    ]);
  }
  const PagesScheduleSchedule = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$3], ["__scopeId", "data-v-e6e5e79f"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/pages/schedule/schedule.vue"]]);
  const _sfc_main$3 = {
    components: { customTabbar: __easycom_0 },
    data() {
      return {
        statusBarHeight: 0,
        courseListHeight: 400,
        selectedWeekday: (/* @__PURE__ */ new Date()).getDay(),
        weekdays: [
          { label: "Sun" },
          { label: "Mon" },
          { label: "Tue" },
          { label: "Wed" },
          { label: "Thu" },
          { label: "Fri" },
          { label: "Sat" }
        ],
        courseSchedule: {}
      };
    },
    computed: {
      courses() {
        return this.courseSchedule[this.selectedWeekday] || [];
      }
    },
    onReady() {
      const sysInfo = uni.getSystemInfoSync();
      this.statusBarHeight = sysInfo.statusBarHeight || 0;
      this.courseListHeight = sysInfo.windowHeight - this.statusBarHeight - 140;
    }
  };
  function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_custom_tabbar = resolveEasycom(vue.resolveDynamicComponent("custom-tabbar"), __easycom_0);
    return vue.openBlock(), vue.createElementBlock("view", { class: "page-timetable" }, [
      vue.createElementVNode(
        "view",
        {
          class: "header",
          style: vue.normalizeStyle({ paddingTop: $data.statusBarHeight + "px" })
        },
        [
          vue.createElementVNode("view", { class: "header-inner" }, [
            vue.createElementVNode("text", { class: "brand" }, "PlanMosaic")
          ])
        ],
        4
        /* STYLE */
      ),
      vue.createElementVNode("scroll-view", {
        "scroll-x": "",
        class: "weekday-scroll"
      }, [
        vue.createElementVNode("view", { class: "weekday-strip" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.weekdays, (day, idx) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: idx,
                class: vue.normalizeClass(["weekday-cell", { active: idx === $data.selectedWeekday }]),
                "hover-class": "tap-active",
                onClick: ($event) => $data.selectedWeekday = idx
              }, [
                vue.createElementVNode(
                  "text",
                  { class: "weekday-label" },
                  vue.toDisplayString(day.label),
                  1
                  /* TEXT */
                )
              ], 10, ["onClick"]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ]),
      vue.createElementVNode(
        "scroll-view",
        {
          "scroll-y": "",
          class: "course-list-scroll",
          style: vue.normalizeStyle({ height: $data.courseListHeight + "px" })
        },
        [
          vue.createElementVNode("view", { class: "course-list-container" }, [
            $options.courses.length > 0 ? (vue.openBlock(), vue.createElementBlock("view", { key: 0 }, [
              (vue.openBlock(true), vue.createElementBlock(
                vue.Fragment,
                null,
                vue.renderList($options.courses, (course, idx) => {
                  return vue.openBlock(), vue.createElementBlock("view", {
                    key: idx,
                    class: "course-card pm-card",
                    "hover-class": "tap-active"
                  }, [
                    vue.createElementVNode("view", { class: "course-time" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "course-time-text" },
                        vue.toDisplayString(course.time),
                        1
                        /* TEXT */
                      )
                    ]),
                    vue.createElementVNode("view", { class: "course-info" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "course-name" },
                        vue.toDisplayString(course.name),
                        1
                        /* TEXT */
                      ),
                      course.location ? (vue.openBlock(), vue.createElementBlock(
                        "text",
                        {
                          key: 0,
                          class: "course-location"
                        },
                        vue.toDisplayString(course.location),
                        1
                        /* TEXT */
                      )) : vue.createCommentVNode("v-if", true),
                      course.teacher ? (vue.openBlock(), vue.createElementBlock(
                        "text",
                        {
                          key: 1,
                          class: "course-teacher"
                        },
                        vue.toDisplayString(course.teacher),
                        1
                        /* TEXT */
                      )) : vue.createCommentVNode("v-if", true)
                    ])
                  ]);
                }),
                128
                /* KEYED_FRAGMENT */
              ))
            ])) : (vue.openBlock(), vue.createElementBlock("view", {
              key: 1,
              class: "pm-empty"
            }, [
              vue.createElementVNode("text", { class: "pm-empty-text" }, "No courses on this day")
            ]))
          ])
        ],
        4
        /* STYLE */
      ),
      vue.createVNode(_component_custom_tabbar, { current: "/pages/timetable/timetable" })
    ]);
  }
  const PagesTimetableTimetable = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2], ["__scopeId", "data-v-ae10f376"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/pages/timetable/timetable.vue"]]);
  const _sfc_main$2 = {
    components: { customTabbar: __easycom_0 },
    data() {
      return {
        statusBarHeight: 0,
        chatHeight: 400,
        inputSafeBottom: 0,
        scrollToId: "chatBottom",
        inputText: "",
        messages: [],
        isStreaming: false
      };
    },
    onReady() {
      const sysInfo = uni.getSystemInfoSync();
      this.statusBarHeight = sysInfo.statusBarHeight || 0;
      this.chatHeight = sysInfo.windowHeight - this.statusBarHeight - 100;
    },
    methods: {
      sendMessage() {
        const text = this.inputText.trim();
        if (!text || this.isStreaming)
          return;
        this.messages.push({ role: "user", content: text });
        this.inputText = "";
        this.scrollToBottom();
        this.isStreaming = true;
        setTimeout(() => {
          this.messages.push({
            role: "assistant",
            content: "I received your message. AI chat requires a backend server connection. Please make sure server.js is running."
          });
          this.isStreaming = false;
          this.scrollToBottom();
        }, 800);
      },
      scrollToBottom() {
        this.$nextTick(() => {
          this.scrollToId = "";
          setTimeout(() => {
            this.scrollToId = "chatBottom";
          }, 50);
        });
      }
    }
  };
  function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_custom_tabbar = resolveEasycom(vue.resolveDynamicComponent("custom-tabbar"), __easycom_0);
    return vue.openBlock(), vue.createElementBlock("view", { class: "page-mosa" }, [
      vue.createElementVNode(
        "view",
        {
          class: "header",
          style: vue.normalizeStyle({ paddingTop: $data.statusBarHeight + "px" })
        },
        [
          vue.createElementVNode("view", { class: "header-inner" }, [
            vue.createElementVNode("text", { class: "brand" }, "Mosa")
          ])
        ],
        4
        /* STYLE */
      ),
      vue.createElementVNode("scroll-view", {
        "scroll-y": "",
        class: "chat-scroll",
        style: vue.normalizeStyle({ height: $data.chatHeight + "px" }),
        "scroll-into-view": $data.scrollToId,
        "scroll-with-animation": ""
      }, [
        vue.createElementVNode("view", {
          class: "chat-container",
          id: "chatContainer"
        }, [
          $data.messages.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "welcome-msg"
          }, [
            vue.createElementVNode("text", { class: "welcome-title" }, "Hi, I'm Mosa"),
            vue.createElementVNode("text", { class: "welcome-sub" }, "What's on your mind? I can help with scheduling, tasks, and more.")
          ])) : vue.createCommentVNode("v-if", true),
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.messages, (msg, idx) => {
              return vue.openBlock(), vue.createElementBlock(
                "view",
                {
                  key: idx,
                  class: vue.normalizeClass(["msg-row", msg.role])
                },
                [
                  vue.createElementVNode(
                    "view",
                    {
                      class: vue.normalizeClass(["msg-bubble", msg.role])
                    },
                    [
                      vue.createElementVNode(
                        "text",
                        {
                          class: "msg-text",
                          selectable: true
                        },
                        vue.toDisplayString(msg.content),
                        1
                        /* TEXT */
                      )
                    ],
                    2
                    /* CLASS */
                  )
                ],
                2
                /* CLASS */
              );
            }),
            128
            /* KEYED_FRAGMENT */
          )),
          vue.createElementVNode("view", { id: "chatBottom" })
        ])
      ], 12, ["scroll-into-view"]),
      vue.createElementVNode(
        "view",
        {
          class: "input-area",
          style: vue.normalizeStyle({ paddingBottom: $data.inputSafeBottom + "px" })
        },
        [
          vue.createElementVNode("view", { class: "input-wrapper" }, [
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "chat-input",
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.inputText = $event),
                placeholder: "Ask Mosa anything...",
                "confirm-type": "send",
                onConfirm: _cache[1] || (_cache[1] = (...args) => $options.sendMessage && $options.sendMessage(...args))
              },
              null,
              544
              /* NEED_HYDRATION, NEED_PATCH */
            ), [
              [vue.vModelText, $data.inputText]
            ]),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["send-btn", { active: $data.inputText.trim() }]),
                "hover-class": "tap-active",
                onClick: _cache[2] || (_cache[2] = (...args) => $options.sendMessage && $options.sendMessage(...args))
              },
              [
                vue.createElementVNode("text", { class: "send-icon" }, "↑")
              ],
              2
              /* CLASS */
            )
          ])
        ],
        4
        /* STYLE */
      ),
      vue.createVNode(_component_custom_tabbar, { current: "/pages/mosa/mosa" })
    ]);
  }
  const PagesMosaMosa = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1], ["__scopeId", "data-v-e671139b"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/pages/mosa/mosa.vue"]]);
  const _sfc_main$1 = {
    components: { customTabbar: __easycom_0 },
    data() {
      return {
        statusBarHeight: 0,
        isRegisterMode: false,
        errorMsg: "",
        isLoading: false,
        form: {
          username: "",
          password: "",
          confirm: ""
        }
      };
    },
    computed: {
      store() {
        return useScheduleStore();
      },
      avatarLetter() {
        var _a;
        const name = ((_a = this.store.state.currentUser) == null ? void 0 : _a.username) || "";
        return name.charAt(0).toUpperCase();
      },
      menuItems() {
        return [
          {
            label: "Sync to Cloud",
            action: "sync",
            value: ""
          },
          {
            label: "AI Provider",
            action: "provider",
            value: this.store.state.aiProvider || "deepseek"
          },
          {
            label: "Theme",
            action: "theme",
            value: this.store.state.theme || "light"
          },
          {
            label: "About",
            action: "about",
            value: ""
          }
        ];
      }
    },
    onReady() {
      const sysInfo = uni.getSystemInfoSync();
      this.statusBarHeight = sysInfo.statusBarHeight || 0;
    },
    methods: {
      toggleMode() {
        this.isRegisterMode = !this.isRegisterMode;
        this.errorMsg = "";
      },
      async handleLogin() {
        if (!this.form.username.trim() || !this.form.password.trim()) {
          this.errorMsg = "Please enter username and password";
          return;
        }
        if (this.isLoading)
          return;
        this.isLoading = true;
        this.errorMsg = "";
        const res = await this.store.login(this.form.username.trim(), this.form.password);
        this.isLoading = false;
        if (!res.success) {
          this.errorMsg = res.error || "Login failed";
        }
      },
      async handleRegister() {
        if (!this.form.username.trim() || !this.form.password.trim()) {
          this.errorMsg = "Please enter username and password";
          return;
        }
        if (this.form.password !== this.form.confirm) {
          this.errorMsg = "Passwords do not match";
          return;
        }
        if (this.form.password.length < 6) {
          this.errorMsg = "Password must be at least 6 characters";
          return;
        }
        if (this.isLoading)
          return;
        this.isLoading = true;
        this.errorMsg = "";
        const res = await this.store.register(this.form.username.trim(), this.form.password);
        this.isLoading = false;
        if (!res.success) {
          this.errorMsg = res.error || "Registration failed";
        }
      },
      handleLogout() {
        uni.showModal({
          title: "Sign Out",
          content: "Are you sure you want to sign out?",
          success: (res) => {
            if (res.confirm) {
              this.store.logout();
              this.form = { username: "", password: "", confirm: "" };
            }
          }
        });
      },
      handleMenu(action) {
        switch (action) {
          case "sync":
            this.doSync();
            break;
          case "provider": {
            const next = this.store.state.aiProvider === "deepseek" ? "qwen" : "deepseek";
            this.store.setAIProvider(next);
            uni.showToast({ title: "AI: " + next, icon: "none" });
            break;
          }
          case "theme": {
            const next = this.store.state.theme === "light" ? "dark" : "light";
            this.store.setTheme(next);
            uni.showToast({ title: next + " mode", icon: "none" });
            break;
          }
          case "about":
            uni.showModal({
              title: "PlanMosaic",
              content: "A minimal academic planning system.\nBuilt with love.",
              showCancel: false
            });
            break;
        }
      },
      async doSync() {
        const ok = await this.store.saveCloud();
        uni.showToast({ title: ok ? "Synced" : "Sync failed", icon: ok ? "success" : "none" });
      }
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_custom_tabbar = resolveEasycom(vue.resolveDynamicComponent("custom-tabbar"), __easycom_0);
    return vue.openBlock(), vue.createElementBlock("view", { class: "page-profile" }, [
      vue.createElementVNode(
        "view",
        {
          style: vue.normalizeStyle({ height: $data.statusBarHeight + "px" })
        },
        null,
        4
        /* STYLE */
      ),
      !$options.store.state.isLoggedIn ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "auth-area"
      }, [
        vue.createElementVNode("view", { class: "brand-area" }, [
          vue.createElementVNode("text", { class: "brand-text" }, "PlanMosaic"),
          vue.createElementVNode("text", { class: "brand-sub" }, "YOUR ACADEMIC COMPANION")
        ]),
        vue.createElementVNode("view", { class: "form-area" }, [
          vue.createElementVNode("view", { class: "form-field" }, [
            vue.createElementVNode("text", { class: "field-label" }, "USERNAME"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "field-input",
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => $data.form.username = $event),
                placeholder: "Enter username",
                "adjust-position": true
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $data.form.username]
            ])
          ]),
          vue.createElementVNode("view", { class: "form-divider" }),
          vue.createElementVNode("view", { class: "form-field" }, [
            vue.createElementVNode("text", { class: "field-label" }, "PASSWORD"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "field-input",
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.form.password = $event),
                type: "password",
                placeholder: "Enter password",
                "adjust-position": true,
                onConfirm: _cache[2] || (_cache[2] = ($event) => $data.isRegisterMode ? $options.handleRegister() : $options.handleLogin())
              },
              null,
              544
              /* NEED_HYDRATION, NEED_PATCH */
            ), [
              [vue.vModelText, $data.form.password]
            ])
          ]),
          $data.isRegisterMode ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "form-divider"
          })) : vue.createCommentVNode("v-if", true),
          $data.isRegisterMode ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 1,
            class: "form-field"
          }, [
            vue.createElementVNode("text", { class: "field-label" }, "CONFIRM PASSWORD"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "field-input",
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.form.confirm = $event),
                type: "password",
                placeholder: "Confirm password",
                "adjust-position": true,
                onConfirm: _cache[4] || (_cache[4] = ($event) => $options.handleRegister())
              },
              null,
              544
              /* NEED_HYDRATION, NEED_PATCH */
            ), [
              [vue.vModelText, $data.form.confirm]
            ])
          ])) : vue.createCommentVNode("v-if", true),
          $data.errorMsg ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 2,
            class: "form-error"
          }, [
            vue.createElementVNode(
              "text",
              { class: "form-error-text" },
              vue.toDisplayString($data.errorMsg),
              1
              /* TEXT */
            )
          ])) : vue.createCommentVNode("v-if", true),
          vue.createElementVNode("view", {
            class: "form-submit",
            "hover-class": "submit-press",
            onClick: _cache[5] || (_cache[5] = ($event) => $data.isRegisterMode ? $options.handleRegister() : $options.handleLogin())
          }, [
            vue.createElementVNode(
              "text",
              { class: "form-submit-text" },
              vue.toDisplayString($data.isRegisterMode ? "Create Account" : "Sign In"),
              1
              /* TEXT */
            )
          ]),
          vue.createElementVNode("view", {
            class: "form-switch",
            onClick: _cache[6] || (_cache[6] = (...args) => $options.toggleMode && $options.toggleMode(...args))
          }, [
            vue.createElementVNode(
              "text",
              { class: "switch-text" },
              vue.toDisplayString($data.isRegisterMode ? "Already have an account?" : "Don't have an account?"),
              1
              /* TEXT */
            ),
            vue.createElementVNode(
              "text",
              { class: "switch-action" },
              vue.toDisplayString($data.isRegisterMode ? "Sign In" : "Sign Up"),
              1
              /* TEXT */
            )
          ])
        ])
      ])) : (vue.openBlock(), vue.createElementBlock("view", {
        key: 1,
        class: "user-area"
      }, [
        vue.createElementVNode("view", { class: "user-card" }, [
          vue.createElementVNode("view", { class: "user-avatar" }, [
            vue.createElementVNode(
              "text",
              { class: "avatar-letter" },
              vue.toDisplayString($options.avatarLetter),
              1
              /* TEXT */
            )
          ]),
          vue.createElementVNode("view", { class: "user-meta" }, [
            vue.createElementVNode(
              "text",
              { class: "user-name" },
              vue.toDisplayString($options.store.state.currentUser.username),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "user-status" }, "Signed in")
          ])
        ]),
        $options.store.state.isSyncing ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "sync-row"
        }, [
          vue.createElementVNode("view", { class: "pm-spinner" }),
          vue.createElementVNode("text", { class: "sync-label" }, "Syncing...")
        ])) : vue.createCommentVNode("v-if", true),
        vue.createElementVNode("view", { class: "settings-group" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($options.menuItems, (item, idx) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                key: idx,
                class: "settings-row",
                "hover-class": "tap-active",
                onClick: ($event) => $options.handleMenu(item.action)
              }, [
                vue.createElementVNode(
                  "text",
                  { class: "settings-label" },
                  vue.toDisplayString(item.label),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode("view", { class: "settings-value" }, [
                  vue.createElementVNode(
                    "text",
                    { class: "settings-value-text" },
                    vue.toDisplayString(item.value),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("text", { class: "settings-chevron" }, "›")
                ])
              ], 8, ["onClick"]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ]),
        vue.createElementVNode("view", {
          class: "logout-btn",
          "hover-class": "tap-active",
          onClick: _cache[7] || (_cache[7] = (...args) => $options.handleLogout && $options.handleLogout(...args))
        }, [
          vue.createElementVNode("text", { class: "logout-label" }, "Sign Out")
        ]),
        vue.createElementVNode("text", { class: "version-label" }, "PlanMosaic v1.0.0")
      ])),
      vue.createVNode(_component_custom_tabbar, { current: "/pages/profile/profile" })
    ]);
  }
  const PagesProfileProfile = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__scopeId", "data-v-dd383ca2"], ["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/pages/profile/profile.vue"]]);
  __definePage("pages/schedule/schedule", PagesScheduleSchedule);
  __definePage("pages/timetable/timetable", PagesTimetableTimetable);
  __definePage("pages/mosa/mosa", PagesMosaMosa);
  __definePage("pages/profile/profile", PagesProfileProfile);
  const _sfc_main = {
    onLaunch: function() {
      formatAppLog("log", "at App.vue:7", "[App] PlanMosaic Launch");
      initSupabase();
      const store = useScheduleStore();
      store.loadLocal();
      this.autoLogin();
    },
    onShow: function() {
      formatAppLog("log", "at App.vue:20", "[App] Show");
    },
    onHide: function() {
      formatAppLog("log", "at App.vue:23", "[App] Hide");
    },
    methods: {
      async autoLogin() {
        const store = useScheduleStore();
        const saved = uni.getStorageSync("mosaique-credentials");
        if (saved) {
          try {
            const { username, password } = JSON.parse(saved);
            const result = await store.login(username, password);
            if (result.success) {
              formatAppLog("log", "at App.vue:34", "[App] Auto-login successful:", result.username);
            } else {
              uni.removeStorageSync("mosaique-credentials");
            }
          } catch (e) {
            formatAppLog("warn", "at App.vue:39", "[App] Auto-login failed:", e);
            uni.removeStorageSync("mosaique-credentials");
          }
        }
      }
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "D:/Trae CN/Projects/PlanMosaic/PlanMosaic Uni-app/App.vue"]]);
  function createApp() {
    const app = vue.createVueApp(App);
    return {
      app
    };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);
