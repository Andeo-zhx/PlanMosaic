"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  name: "CustomTabbar",
  props: {
    current: {
      type: String,
      default: "/pages/schedule/schedule"
    }
  },
  data() {
    return {
      colorActive: "#222222",
      // mirrors $text-main
      colorInactive: "#888888",
      // mirrors $text-secondary
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
      common_vendor.index.reLaunch({ url: page });
    }
  }
};
if (!Array) {
  const _easycom_uni_icons2 = common_vendor.resolveComponent("uni-icons");
  _easycom_uni_icons2();
}
const _easycom_uni_icons = () => "../../uni_modules/uni-icons/components/uni-icons/uni-icons.js";
if (!Math) {
  _easycom_uni_icons();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.f($data.tabs, (tab, idx, i0) => {
      return {
        a: "51c48e3c-0-" + i0,
        b: common_vendor.p({
          type: tab.icon,
          size: 22,
          color: $props.current === tab.page ? $data.colorActive : $data.colorInactive
        }),
        c: common_vendor.t(tab.label),
        d: idx,
        e: $props.current === tab.page ? 1 : "",
        f: common_vendor.o(($event) => $options.switchTab(tab.page), idx)
      };
    })
  };
}
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-51c48e3c"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/components/custom-tabbar/custom-tabbar.js.map
