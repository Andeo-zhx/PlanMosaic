"use strict";
const common_vendor = require("../../common/vendor.js");
const customTabbar = () => "../../components/custom-tabbar/custom-tabbar.js";
const _sfc_main = {
  components: { customTabbar },
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
    var _a;
    const sysInfo = common_vendor.index.getSystemInfoSync();
    this.statusBarHeight = sysInfo.statusBarHeight || 0;
    this.inputSafeBottom = ((_a = sysInfo.safeAreaInsets) == null ? void 0 : _a.bottom) || 0;
    this.chatHeight = sysInfo.windowHeight - this.statusBarHeight - 44 - 56;
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
    b: $data.messages.length === 0
  }, $data.messages.length === 0 ? {} : {}, {
    c: common_vendor.f($data.messages, (msg, idx, i0) => {
      return {
        a: common_vendor.t(msg.content),
        b: common_vendor.n(msg.role),
        c: idx,
        d: common_vendor.n(msg.role)
      };
    }),
    d: $data.chatHeight + "px",
    e: $data.scrollToId,
    f: common_vendor.o((...args) => $options.sendMessage && $options.sendMessage(...args), "13"),
    g: $data.inputText,
    h: common_vendor.o(($event) => $data.inputText = $event.detail.value, "90"),
    i: $data.inputText.trim() ? 1 : "",
    j: common_vendor.o((...args) => $options.sendMessage && $options.sendMessage(...args), "c7"),
    k: $data.inputSafeBottom + "px",
    l: common_vendor.p({
      current: "/pages/mosa/mosa"
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-e671139b"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/mosa/mosa.js.map
