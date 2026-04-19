# Android 账户切换数据隔离与同步修复 Spec

## Why
用户报告 Android 端在切换账号时，日程信息仍然显示之前账号的数据。这会导致用户看到错误的日程信息，造成混淆和数据泄露风险。根本原因可能是用户切换时，UI 层没有及时清理缓存数据，或者本地存储没有按账户严格隔离，或者网络同步逻辑没有在切换后立即触发。

## What Changes
- **检查并修复账户切换时的数据清理机制**：确保 `AuthManager` 的用户状态变化能正确触发所有相关 ViewModel 的数据重置。
- **强化本地存储的账户隔离**：验证 `DataStoreManager` 的按用户文件存储逻辑，确保不同账户的数据完全独立。
- **优化网络同步触发时机**：在账户切换后立即触发数据同步，确保本地数据与 Supabase 数据库一致。
- **检查并修复可能的竞争条件**：确保快速切换账户时不会出现数据错乱。
- **验证所有相关屏幕的数据隔离**：包括日程、词汇、个人资料等屏幕。

## Impact
- **受影响的功能**：用户登录/注销、账户切换、日程数据显示、数据同步。
- **受影响的代码文件**：
  - `util/AuthManager.kt`
  - `util/DataStoreManager.kt`
  - `data/repository/ScheduleRepository.kt`
  - `ui/screens/schedule/ScheduleViewModel.kt`
  - `ui/screens/schedule/ScheduleScreen.kt`
  - `ui/screens/profile/ProfileScreen.kt`
  - `ui/screens/vocab/VocabViewModel.kt`（如果存在）
  - `ui/screens/mosa/MosaViewModel.kt`（如果存在）
- **可能涉及的其他文件**：其他 ViewModel 和 Repository 类。

## ADDED Requirements
### 要求：账户切换时立即清理内存缓存
系统应在用户切换账户时，立即清理所有 ViewModel 中缓存的前一账户数据，确保 UI 不会显示陈旧信息。

#### 场景：用户退出登录
- **当** 用户点击“退出登录”按钮
- **然后** `AuthManager.logout()` 被调用，`currentUser` 状态流更新为 `null`
- **并且** 所有监听 `AuthManager.currentUser` 的 ViewModel 应立即清空其内存缓存（例如 `ScheduleViewModel.appData`）
- **并且** UI 应立即更新，显示空状态或登录界面

#### 场景：用户登录新账户
- **当** 用户使用另一组凭证成功登录
- **然后** `AuthManager.login()` 更新 `currentUser` 状态流为新用户
- **并且** 所有相关 ViewModel 应清空旧数据，并触发新用户的数据加载（本地 + 云端同步）
- **并且** UI 应在数据加载期间显示加载状态，加载完成后显示新用户的数据

### 要求：本地存储严格按账户隔离
系统应确保每个账户的数据存储在独立的文件中，且文件访问不会跨账户污染。

#### 场景：多账户数据存储
- **当** 用户 A 和用户 B 在同一设备上使用应用
- **然后** 用户 A 的数据应保存在 `user_data/<user_id_a>.json`，用户 B 的数据在 `user_data/<user_id_b>.json`
- **并且** 加载用户 A 数据时，绝不读取用户 B 的文件内容

### 要求：网络同步后更新本地文件
系统应在每次成功从 Supabase 获取数据后，更新对应账户的本地文件，保持本地与云端一致。

#### 场景：联网成功时同步数据
- **当** 应用联网成功并成功从 Supabase 读取到用户数据
- **然后** 数据应保存到该用户的专属本地文件
- **并且** 如果本地文件已存在，应使用云端数据覆盖（或按合并策略处理）

## MODIFIED Requirements
### 要求：现有的 ScheduleViewModel 用户切换监听
改进 `ScheduleViewModel.init` 中的 `AuthManager.currentUser` 监听逻辑，确保在用户 ID 变化时彻底清空内存状态，并正确处理加载状态。

### 要求：现有的 DataStoreManager 按用户文件存储
验证并确保 `DataStoreManager.loadUserDataForUser` 和 `saveUserDataForUser` 方法正确使用 `userId` 参数，且文件路径生成唯一。

### 要求：现有的 ScheduleRepository 全量同步
优化 `fullSync` 方法，在用户切换后立即调用时，能正确处理可能的竞态条件，避免数据错位。

## REMOVED Requirements
无