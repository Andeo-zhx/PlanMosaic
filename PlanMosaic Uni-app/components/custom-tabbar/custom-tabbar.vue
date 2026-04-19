<template>
	<view class="custom-tabbar">
		<view
			v-for="(tab, idx) in tabs"
			:key="idx"
			class="tab-item"
			:class="{ active: current === tab.page }"
			hover-class="tap-active"
			@click="switchTab(tab.page)"
		>
			<view class="tab-icon-wrapper">
				<uni-icons
					:type="tab.icon"
					:size="22"
					:color="current === tab.page ? colorActive : colorInactive"
				></uni-icons>
			</view>
			<text class="tab-label">{{ tab.label }}</text>
		</view>
	</view>
</template>

<script>
	export default {
		name: 'CustomTabbar',
		props: {
			current: {
				type: String,
				default: '/pages/schedule/schedule'
			}
		},
		data() {
			return {
				colorActive: '#222222',  // mirrors $text-main
				colorInactive: '#888888', // mirrors $text-secondary
				tabs: [
					{
						page: '/pages/schedule/schedule',
						label: 'Schedule',
						icon: 'calendar'
					},
					{
						page: '/pages/timetable/timetable',
						label: 'Timetable',
						icon: 'bars'
					},
					{
						page: '/pages/mosa/mosa',
						label: 'Mosa',
						icon: 'chatbubble'
					},
					{
						page: '/pages/profile/profile',
						label: 'Me',
						icon: 'person'
					}
				]
			}
		},
		methods: {
			switchTab(page) {
				if (page === this.current) return
				uni.reLaunch({ url: page })
			}
		}
	}
</script>

<style lang="scss" scoped>
	.custom-tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 999;
		display: flex;
		align-items: flex-start;
		justify-content: space-around;
		height: auto;
		background-color: $bg-surface;
		border-top: 1px solid $border-subtle;
		padding-top: 6px;
		padding-bottom: constant(safe-area-inset-bottom);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.tab-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		height: $touch-target;
		gap: 2px;
	}

	.tab-icon-wrapper {
		width: $tabbar-icon-size;
		height: $tabbar-icon-size;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tab-label {
		font-size: 10px;
		color: $text-secondary;
		letter-spacing: 0.3px;
	}

	.tab-item.active .tab-label {
		color: $text-main;
		font-weight: 500;
	}
</style>
