<template>
	<view class="page-timetable">
		<!-- Custom Header -->
		<view class="header" :style="{ paddingTop: statusBarHeight + 'px' }">
			<view class="header-inner">
				<text class="brand">PlanMosaic</text>
			</view>
		</view>

		<!-- Week Day Selector -->
		<scroll-view scroll-x class="weekday-scroll">
			<view class="weekday-strip">
				<view
					v-for="(day, idx) in weekdays"
					:key="idx"
					class="weekday-cell"
					:class="{ active: idx === selectedWeekday }"
					hover-class="tap-active"
					@click="selectedWeekday = idx"
				>
					<text class="weekday-label">{{ day.label }}</text>
				</view>
			</view>
		</scroll-view>

		<!-- Course List -->
		<scroll-view scroll-y class="course-list-scroll" :style="{ height: courseListHeight + 'px' }">
			<view class="course-list-container">
				<view v-if="courses.length > 0">
					<view
						v-for="(course, idx) in courses"
						:key="idx"
						class="course-card pm-card"
						hover-class="tap-active"
					>
						<view class="course-time">
							<text class="course-time-text">{{ course.time || '' }}</text>
						</view>
						<view class="course-info">
							<text class="course-name">{{ course.name || 'Unnamed Course' }}</text>
							<text v-if="course.location" class="course-location">{{ course.location }}</text>
							<text v-if="course.teacher" class="course-teacher">{{ course.teacher }}</text>
						</view>
					</view>
				</view>

				<view v-else class="pm-empty">
					<text class="pm-empty-text">No courses on this day</text>
				</view>
			</view>
		</scroll-view>
		<custom-tabbar current="/pages/timetable/timetable"></custom-tabbar>
	</view>
</template>

<script>
	import customTabbar from '@/components/custom-tabbar/custom-tabbar.vue'
	import { useScheduleStore } from '@/store/schedule.js'

	export default {
		components: { customTabbar },
		data() {
			return {
				statusBarHeight: 0,
				courseListHeight: 400,
				selectedWeekday: new Date().getDay(),
				weekdays: [
					{ label: 'Sun' },
					{ label: 'Mon' },
					{ label: 'Tue' },
					{ label: 'Wed' },
					{ label: 'Thu' },
					{ label: 'Fri' },
					{ label: 'Sat' }
				]
			}
		},
		computed: {
			store() {
				return useScheduleStore()
			},
			courseSchedule() {
				const schedule = {}
				const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
				for (const [dateStr, daySchedule] of Object.entries(this.store.state.schedules)) {
					if (daySchedule.timeSlots && daySchedule.timeSlots.length > 0) {
						const d = new Date(dateStr + 'T00:00:00')
						const dow = d.getDay()
						if (!schedule[dow]) schedule[dow] = []
						for (const slot of daySchedule.timeSlots) {
							schedule[dow].push({
								time: slot.time || '',
								name: slot.activity || 'Unnamed Course',
								location: slot.detail || '',
								teacher: ''
							})
						}
					}
				}
				for (const dow of Object.keys(schedule)) {
					schedule[dow].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
				}
				return schedule
			},
			courses() {
				return this.courseSchedule[this.selectedWeekday] || []
			}
		},
		onReady() {
			const sysInfo = uni.getSystemInfoSync()
			this.statusBarHeight = sysInfo.statusBarHeight || 0
			this.courseListHeight = sysInfo.windowHeight - this.statusBarHeight - 96 - 56
		}
	}
</script>

<style lang="scss" scoped>
	.page-timetable {
		min-height: 100vh;
		background-color: $bg-base;
	}

	.header {
		background-color: $bg-surface;
		padding-bottom: $space-3;
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: $space-4;
	}

	.brand {
		font-family: $font-display;
		font-size: 28px;
		font-weight: 300;
		letter-spacing: 4px;
		color: $text-main;
	}

	.weekday-scroll {
		white-space: nowrap;
		background-color: $bg-surface;
		border-bottom: 1px solid $border-subtle;
	}

	.weekday-strip {
		display: flex;
		padding: $space-3 $space-4;
		gap: $space-2;
	}

	.weekday-cell {
		padding: $space-2 $space-4;
		border-radius: $radius-pill;
		min-width: 44px;
		text-align: center;
	}

	.weekday-cell.active {
		background-color: $text-main;
	}

	.weekday-label {
		font-size: 13px;
		color: $text-secondary;
	}

	.weekday-cell.active .weekday-label {
		color: $bg-surface;
	}

	.course-list-scroll {
		flex: 1;
	}

	.course-list-container {
		padding: $space-4 $screen-padding;
		padding-bottom: 80px;
	}

	.course-card {
		display: flex;
		align-items: flex-start;
		gap: $space-3;
		padding: $space-4;
	}

	.course-time {
		flex-shrink: 0;
		padding-top: 2px;
	}

	.course-time-text {
		font-size: 12px;
		color: $text-secondary;
		font-variant-numeric: tabular-nums;
	}

	.course-info {
		flex: 1;
	}

	.course-name {
		font-size: 15px;
		font-weight: 500;
		color: $text-main;
		display: block;
	}

	.course-location {
		font-size: 12px;
		color: $text-secondary;
		margin-top: $space-1;
		display: block;
	}

	.course-teacher {
		font-size: 12px;
		color: $text-secondary;
		display: block;
	}
</style>
