<template>
	<view class="page-schedule">
		<!-- Status Bar Spacer -->
		<view :style="{ height: statusBarHeight + 'px' }"></view>

		<!-- ====== 2.1 顶部周视图条 ====== -->
		<scroll-view
			scroll-x
			class="week-strip"
			:show-scrollbar="false"
		>
			<view class="week-inner">
				<view
					v-for="(day, idx) in weekDays"
					:key="idx"
					class="week-cell"
					:class="{ selected: day.dateStr === selectedDate }"
					hover-class="tap-active"
					@click="selectDate(day.dateStr)"
				>
					<text class="cell-weekday">{{ day.weekdayLabel }}</text>
					<text class="cell-date" :class="{ today: day.isToday }">{{ day.dayNum }}</text>
					<view v-if="day.hasSchedule" class="cell-dot"></view>
				</view>
			</view>
		</scroll-view>

		<!-- ====== 2.2 日程/任务流 ====== -->
		<scroll-view
			scroll-y
			class="timeline-scroll"
			:style="{ height: scrollHeight + 'px' }"
		>
			<view class="timeline-body">
				<!-- Date Header -->
				<view class="day-header">
					<text class="day-title">{{ dayTitle }}</text>
					<text v-if="dayHighlights" class="day-highlights">{{ dayHighlights }}</text>
				</view>

				<!-- Time Slots Section -->
				<view v-if="timeSlots.length > 0" class="section">
					<view
						v-for="(slot, idx) in timeSlots"
						:key="'ts-' + idx"
						class="slot-row"
					>
						<text class="slot-time">{{ slot.time }}</text>
						<view class="slot-divider"></view>
						<view class="slot-body">
							<text class="slot-activity">{{ slot.activity || '' }}</text>
							<text v-if="slot.detail" class="slot-detail">{{ slot.detail }}</text>
						</view>
					</view>
				</view>

				<!-- Tasks Section -->
				<view v-if="tasks.length > 0" class="section">
					<text class="section-label">TASKS</text>
					<view class="pm-divider"></view>
					<view
						v-for="(task, idx) in tasks"
						:key="'tk-' + idx"
						class="task-row"
						:class="{ done: task.completed }"
						hover-class="tap-active"
						@click="toggleTask(idx)"
					>
						<view
							class="task-check"
							:class="{ checked: task.completed }"
						>
							<text v-if="task.completed" class="check-icon">&#10003;</text>
						</view>
						<view class="task-body">
							<text class="task-name">{{ task.name || 'Untitled' }}</text>
							<text class="task-meta">{{ task.estimated || 0 }}min</text>
						</view>
					</view>
				</view>

				<!-- Empty State -->
				<view
					v-if="timeSlots.length === 0 && tasks.length === 0"
					class="empty-state"
				>
					<text class="empty-text">No schedule for this day</text>
				</view>

				<!-- Bottom spacer for FAB + TabBar -->
				<view :style="{ height: fabBottomOffset + 'px' }"></view>
			</view>
		</scroll-view>

		<!-- ====== 2.3 FAB ====== -->
		<view
			class="fab"
			hover-class="fab-press"
			:style="{ bottom: fabBottom + 'px' }"
			@click="onFabTap"
		>
			<text class="fab-icon">+</text>
		</view>

		<!-- TabBar -->
		<custom-tabbar current="/pages/schedule/schedule"></custom-tabbar>
	</view>
</template>

<script>
	import { useScheduleStore } from '@/store/schedule.js'
	import customTabbar from '@/components/custom-tabbar/custom-tabbar.vue'

	// Standalone helper: safe in data() context
	function todayStr() {
		const n = new Date()
		return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0')
	}

	export default {
		components: { customTabbar },
		data() {
			return {
				statusBarHeight: 0,
				screenHeight: 0,
				safeBottom: 0,
				selectedDate: todayStr(),
				tabBarReserved: 70 // tabbar approx height
			}
		},
		computed: {
			store() {
				return useScheduleStore()
			},

			// Scroll area height = screen - statusBar - weekStrip - tabbar
			scrollHeight() {
				const weekStripHeight = 96
				return this.screenHeight - this.statusBarHeight - weekStripHeight - this.tabBarReserved
			},

			// FAB bottom offset (above tabbar + safe area)
			fabBottom() {
				return this.tabBarReserved + this.safeBottom + 16
			},

			// Scroll content bottom spacer (so last items are visible above FAB+TabBar)
			fabBottomOffset() {
				return 120
			},

			weekDays() {
				if (!this.selectedDate) return []
				return this.buildWeekDays(this.selectedDate)
			},

			schedule() {
				if (!this.selectedDate) return null
				return this.store.getSchedule(this.selectedDate)
			},

			timeSlots() {
				if (!this.selectedDate) return []
				return this.store.getTimeSlots(this.selectedDate)
			},

			tasks() {
				if (!this.selectedDate) return []
				return this.store.getTasks(this.selectedDate)
			},

			dayTitle() {
				if (!this.selectedDate) return ''
				const d = new Date(this.selectedDate + 'T00:00:00')
				const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
				const isToday = this.selectedDate === this.store.todayStr
				const prefix = isToday ? 'Today  ' : ''
				return prefix + (d.getMonth() + 1) + '/' + d.getDate() + '  ' + weekLabels[d.getDay()]
			},

			dayHighlights() {
				return this.schedule?.highlights || ''
			}
		},
		onReady() {
			const sysInfo = uni.getSystemInfoSync()
			this.statusBarHeight = sysInfo.statusBarHeight || 0
			this.screenHeight = sysInfo.windowHeight || 700
			this.safeBottom = sysInfo.safeAreaInsets?.bottom || 0
			this.selectedDate = this.store.todayStr
		},
		methods: {
			/**
			 * Build 7-day array (Mon-Sun) for the week containing `dateStr`
			 */
			buildWeekDays(dateStr) {
				const d = new Date(dateStr + 'T00:00:00')
				const dow = d.getDay() // 0=Sun
				const mondayOffset = dow === 0 ? -6 : 1 - dow
				const monday = new Date(d)
				monday.setDate(d.getDate() + mondayOffset)

				const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
				const days = []

				for (let i = 0; i < 7; i++) {
					const cur = new Date(monday)
					cur.setDate(monday.getDate() + i)
					const y = cur.getFullYear()
					const m = String(cur.getMonth() + 1).padStart(2, '0')
					const dd = String(cur.getDate()).padStart(2, '0')
					const ds = y + '-' + m + '-' + dd

					days.push({
						dayNum: cur.getDate(),
						weekdayLabel: labels[i],
						dateStr: ds,
						isToday: ds === this.store.todayStr,
						hasSchedule: !!(this.store.schedules[ds])
					})
				}
				return days
			},

			selectDate(dateStr) {
				this.selectedDate = dateStr
			},

			toggleTask(taskIndex) {
				const task = this.tasks[taskIndex]
				if (task && !task.completed) {
					this.store.completeTask(this.selectedDate, taskIndex, task.estimated)
				}
			},

			onFabTap() {
				// Placeholder: will trigger bottom sheet in a future phase
				uni.showToast({ title: 'Add schedule (coming soon)', icon: 'none' })
			}
		}
	}
</script>

<style lang="scss" scoped>
	.page-schedule {
		min-height: 100vh;
		background-color: $bg-base;
		position: relative;
	}

	/* ============ 2.1 顶部周视图条 ============ */
	.week-strip {
		background-color: $bg-surface;
		border-bottom: 1px solid $border-subtle;
		white-space: nowrap;
	}

	.week-inner {
		display: inline-flex;
		padding: $space-3 $space-2;
		gap: $space-2;
	}

	.week-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 64px;
		border-radius: $radius-md;
		gap: $space-1;
		position: relative;
	}

	.week-cell.selected {
		background-color: $bg-muted;
	}

	.cell-weekday {
		font-size: 11px;
		color: $text-secondary;
		letter-spacing: 0.5px;
	}

	.week-cell.selected .cell-weekday {
		color: $text-main;
		font-weight: 600;
	}

	.cell-date {
		font-size: 16px;
		font-weight: 400;
		color: $text-main;
	}

	.cell-date.today {
		color: $pm-accent;
	}

	.week-cell.selected .cell-date {
		font-weight: 600;
	}

	.cell-dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background-color: $text-secondary;
		position: absolute;
		bottom: 4px;
	}

	.week-cell.selected .cell-dot {
		background-color: $text-main;
	}

	/* ============ 2.2 日程/任务流 ============ */
	.timeline-scroll {
		flex: 1;
	}

	.timeline-body {
		padding: $space-5 $screen-padding 0;
	}

	.day-header {
		margin-bottom: $space-5;
	}

	.day-title {
		font-size: 20px;
		font-weight: 600;
		color: $text-main;
		display: block;
	}

	.day-highlights {
		font-size: 13px;
		color: $text-secondary;
		margin-top: $space-1;
		display: block;
	}

	/* -- Section -- */
	.section {
		margin-bottom: $space-5;
	}

	.section-label {
		font-size: 10px;
		color: $text-secondary;
		letter-spacing: 1.5px;
		display: block;
		margin-bottom: $space-2;
	}

	/* -- Time Slot Row (no shadow, border only) -- */
	.slot-row {
		display: flex;
		align-items: flex-start;
		gap: $space-4;
		padding: $space-4 0;
		border-bottom: 1px solid $border-subtle;
	}

	.slot-row:last-child {
		border-bottom: none;
	}

	.slot-time {
		width: 52px;
		flex-shrink: 0;
		font-size: 12px;
		color: $text-secondary;
		font-variant-numeric: tabular-nums;
		padding-top: 2px;
	}

	.slot-divider {
		display: none;
	}

	.slot-body {
		flex: 1;
		min-width: 0;
	}

	.slot-activity {
		font-size: 15px;
		font-weight: 500;
		color: $text-main;
		display: block;
	}

	.slot-detail {
		font-size: 12px;
		color: $text-secondary;
		margin-top: $space-1;
		display: block;
	}

	/* -- Task Row -- */
	.task-row {
		display: flex;
		align-items: center;
		gap: $space-3;
		padding: $space-3 0;
		border-bottom: 1px solid $border-subtle;
	}

	.task-row:last-child {
		border-bottom: none;
	}

	.task-check {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1.5px solid $border-normal;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.task-check.checked {
		background-color: $brand-action;
		border-color: $brand-action;
	}

	.check-icon {
		font-size: 12px;
		color: $bg-surface;
	}

	.task-body {
		flex: 1;
		min-width: 0;
	}

	.task-name {
		font-size: 14px;
		color: $text-main;
		display: block;
	}

	.task-row.done .task-name {
		text-decoration: line-through;
		color: $text-secondary;
	}

	.task-meta {
		font-size: 11px;
		color: $text-secondary;
		margin-top: 2px;
		display: block;
	}

	/* -- Empty State -- */
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 80px 0;
	}

	.empty-text {
		font-size: 13px;
		color: $text-secondary;
	}

	/* ============ 2.3 FAB ============ */
	.fab {
		position: fixed;
		right: $screen-padding;
		z-index: 998;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background-color: $brand-action;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fab-press {
		opacity: 0.7;
		transform: scale(0.92);
	}

	.fab-icon {
		font-size: 28px;
		color: $bg-surface;
		font-weight: 300;
		line-height: 1;
	}
</style>
