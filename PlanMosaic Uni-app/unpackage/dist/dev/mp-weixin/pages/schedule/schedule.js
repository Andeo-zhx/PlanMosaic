"use strict";
const common_vendor = require("../../common/vendor.js");
const store_schedule = require("../../store/schedule.js");
const customTabbar = () => "../../components/custom-tabbar/custom-tabbar.js";
function todayStr() {
  const n = /* @__PURE__ */ new Date();
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}
const _sfc_main = {
  components: { customTabbar },
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
      return store_schedule.useScheduleStore();
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
    const sysInfo = common_vendor.index.getSystemInfoSync();
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
      common_vendor.index.showToast({ title: "Add schedule (coming soon)", icon: "none" });
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
    b: common_vendor.f($options.weekDays, (day, idx, i0) => {
      return common_vendor.e({
        a: common_vendor.t(day.weekdayLabel),
        b: common_vendor.t(day.dayNum),
        c: day.isToday ? 1 : "",
        d: day.hasSchedule
      }, day.hasSchedule ? {} : {}, {
        e: idx,
        f: day.dateStr === $data.selectedDate ? 1 : "",
        g: common_vendor.o(($event) => $options.selectDate(day.dateStr), idx)
      });
    }),
    c: common_vendor.t($options.dayTitle),
    d: $options.dayHighlights
  }, $options.dayHighlights ? {
    e: common_vendor.t($options.dayHighlights)
  } : {}, {
    f: $options.timeSlots.length > 0
  }, $options.timeSlots.length > 0 ? {
    g: common_vendor.f($options.timeSlots, (slot, idx, i0) => {
      return common_vendor.e({
        a: common_vendor.t(slot.time),
        b: common_vendor.t(slot.activity || ""),
        c: slot.detail
      }, slot.detail ? {
        d: common_vendor.t(slot.detail)
      } : {}, {
        e: "ts-" + idx
      });
    })
  } : {}, {
    h: $options.tasks.length > 0
  }, $options.tasks.length > 0 ? {
    i: common_vendor.f($options.tasks, (task, idx, i0) => {
      return common_vendor.e({
        a: task.completed
      }, task.completed ? {} : {}, {
        b: task.completed ? 1 : "",
        c: common_vendor.t(task.name || "Untitled"),
        d: common_vendor.t(task.estimatedMinutes || 0),
        e: "tk-" + idx,
        f: task.completed ? 1 : "",
        g: common_vendor.o(($event) => $options.toggleTask(idx), "tk-" + idx)
      });
    })
  } : {}, {
    j: $options.timeSlots.length === 0 && $options.tasks.length === 0
  }, $options.timeSlots.length === 0 && $options.tasks.length === 0 ? {} : {}, {
    k: $options.fabBottomOffset + "px",
    l: $options.scrollHeight + "px",
    m: $options.fabBottom + "px",
    n: common_vendor.o((...args) => $options.onFabTap && $options.onFabTap(...args), "aa"),
    o: common_vendor.p({
      current: "/pages/schedule/schedule"
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-e6e5e79f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/schedule/schedule.js.map
