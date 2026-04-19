"use strict";
const common_vendor = require("../../common/vendor.js");
const store_schedule = require("../../store/schedule.js");
const customTabbar = () => "../../components/custom-tabbar/custom-tabbar.js";
const _sfc_main = {
  components: { customTabbar },
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
      return store_schedule.useScheduleStore();
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
    const sysInfo = common_vendor.index.getSystemInfoSync();
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
      common_vendor.index.showModal({
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
          common_vendor.index.showToast({ title: "AI: " + next, icon: "none" });
          break;
        }
        case "theme": {
          const next = this.store.state.theme === "light" ? "dark" : "light";
          this.store.setTheme(next);
          common_vendor.index.showToast({ title: next + " mode", icon: "none" });
          break;
        }
        case "about":
          common_vendor.index.showModal({
            title: "PlanMosaic",
            content: "A minimal academic planning system.\nBuilt with love.",
            showCancel: false
          });
          break;
      }
    },
    async doSync() {
      const ok = await this.store.saveCloud();
      common_vendor.index.showToast({ title: ok ? "Synced" : "Sync failed", icon: ok ? "success" : "none" });
    }
  }
};
if (!Array) {
  const _easycom_custom_tabbar2 = common_vendor.resolveComponent("custom-tabbar");
  _easycom_custom_tabbar2();
}
const _easycom_custom_tabbar = () => "../../components/custom-tabbar/custom-tabbar.js";
if (!Math) {
  _easycom_custom_tabbar();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.statusBarHeight + "px",
    b: !$options.store.state.isLoggedIn
  }, !$options.store.state.isLoggedIn ? common_vendor.e({
    c: $data.form.username,
    d: common_vendor.o(($event) => $data.form.username = $event.detail.value, "52"),
    e: common_vendor.o(($event) => $data.isRegisterMode ? $options.handleRegister() : $options.handleLogin(), "41"),
    f: $data.form.password,
    g: common_vendor.o(($event) => $data.form.password = $event.detail.value, "4b"),
    h: $data.isRegisterMode
  }, $data.isRegisterMode ? {} : {}, {
    i: $data.isRegisterMode
  }, $data.isRegisterMode ? {
    j: common_vendor.o(($event) => $options.handleRegister(), "26"),
    k: $data.form.confirm,
    l: common_vendor.o(($event) => $data.form.confirm = $event.detail.value, "cf")
  } : {}, {
    m: $data.errorMsg
  }, $data.errorMsg ? {
    n: common_vendor.t($data.errorMsg)
  } : {}, {
    o: common_vendor.t($data.isRegisterMode ? "Create Account" : "Sign In"),
    p: common_vendor.o(($event) => $data.isRegisterMode ? $options.handleRegister() : $options.handleLogin(), "6e"),
    q: common_vendor.t($data.isRegisterMode ? "Already have an account?" : "Don't have an account?"),
    r: common_vendor.t($data.isRegisterMode ? "Sign In" : "Sign Up"),
    s: common_vendor.o((...args) => $options.toggleMode && $options.toggleMode(...args), "33")
  }) : common_vendor.e({
    t: common_vendor.t($options.avatarLetter),
    v: common_vendor.t($options.store.state.currentUser.username),
    w: $options.store.state.isSyncing
  }, $options.store.state.isSyncing ? {} : {}, {
    x: common_vendor.f($options.menuItems, (item, idx, i0) => {
      return {
        a: common_vendor.t(item.label),
        b: common_vendor.t(item.value),
        c: idx,
        d: common_vendor.o(($event) => $options.handleMenu(item.action), idx)
      };
    }),
    y: common_vendor.o((...args) => $options.handleLogout && $options.handleLogout(...args), "3b")
  }), {
    z: common_vendor.p({
      current: "/pages/profile/profile"
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-dd383ca2"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/profile/profile.js.map
