"use strict";
const common_vendor = require("../../common/vendor.js");
const customTabbar = () => "../../components/custom-tabbar/custom-tabbar.js";
const _sfc_main = {
  components: { customTabbar },
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
    const sysInfo = common_vendor.index.getSystemInfoSync();
    this.statusBarHeight = sysInfo.statusBarHeight || 0;
    this.courseListHeight = sysInfo.windowHeight - this.statusBarHeight - 96 - 56;
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
    b: common_vendor.f($data.weekdays, (day, idx, i0) => {
      return {
        a: common_vendor.t(day.label),
        b: idx,
        c: idx === $data.selectedWeekday ? 1 : "",
        d: common_vendor.o(($event) => $data.selectedWeekday = idx, idx)
      };
    }),
    c: $options.courses.length > 0
  }, $options.courses.length > 0 ? {
    d: common_vendor.f($options.courses, (course, idx, i0) => {
      return common_vendor.e({
        a: common_vendor.t(course.time || ""),
        b: common_vendor.t(course.name || "Unnamed Course"),
        c: course.location
      }, course.location ? {
        d: common_vendor.t(course.location)
      } : {}, {
        e: course.teacher
      }, course.teacher ? {
        f: common_vendor.t(course.teacher)
      } : {}, {
        g: idx
      });
    })
  } : {}, {
    e: $data.courseListHeight + "px",
    f: common_vendor.p({
      current: "/pages/timetable/timetable"
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-ae10f376"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/timetable/timetable.js.map
