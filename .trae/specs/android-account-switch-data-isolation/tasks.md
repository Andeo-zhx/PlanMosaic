# Tasks

- [x] Task 1: 全面检查当前账户切换与数据隔离机制
  - [x] SubTask 1.1: 检查 `AuthManager` 的用户状态管理，确认 `currentUser` 流在登录/注销时正确更新
  - [x] SubTask 1.2: 检查 `DataStoreManager` 的按用户文件存储逻辑，确认文件路径生成唯一且无冲突
  - [x] SubTask 1.3: 检查 `ScheduleViewModel` 中 `AuthManager.currentUser` 的监听逻辑，确认用户切换时能及时清空 `appData` 并重新加载
  - [x] SubTask 1.4: 检查其他 ViewModel（如 `VocabViewModel`、`MosaViewModel`）是否也有类似的用户切换监听，若无则标记为潜在问题

- [x] Task 2: 修复账户切换时的数据清理问题
  - [x] SubTask 2.1: 在 `AuthManager.logout()` 和 `login()` 中确保 `_currentUser` 和 `_currentToken` 状态流更新及时且线程安全
  - [x] SubTask 2.2: 在 `ScheduleViewModel` 中增强用户切换监听器，添加防抖或取消前一个加载任务，避免竞态条件
  - [x] SubTask 2.3: 在用户切换时，除了清空 `appData` 外，还应重置 UI 状态（如 `_uiState` 中的 `allSchedules`、`daySchedule` 等）
  - [x] SubTask 2.4: 检查 `ProfileScreen` 中的注销逻辑，确保调用 `AuthManager.logout()` 后能正确导航或刷新界面

- [x] Task 3: 强化本地存储账户隔离
  - [x] SubTask 3.1: 验证 `DataStoreManager.getUserDataFile(userId)` 生成的路径是否唯一，考虑特殊字符处理
  - [x] SubTask 3.2: 检查 `loadUserDataForUser` 和 `saveUserDataForUser` 的异常处理，确保文件读写错误不会导致数据污染
  - [x] SubTask 3.3: 考虑添加文件访问日志，便于调试跨账户数据访问问题

- [x] Task 4: 优化网络同步触发与一致性
  - [x] SubTask 4.1: 检查 `ScheduleRepository.fullSync` 在用户切换后立即调用时的行为，确保使用正确的 `userId`
  - [x] SubTask 4.2: 在 `fullSync` 中添加同步锁或取消机制，防止同一用户多个同步请求重叠
  - [x] SubTask 4.3: 确保云端数据成功获取后，通过 `saveLocalData` 更新本地文件，且仅更新当前用户的文件
  - [x] SubTask 4.4: 在 `ScheduleViewModel.loadScheduleForWeek` 中，若用户未登录，应跳过网络请求并显示空状态

- [x] Task 5: 验证所有相关屏幕的数据隔离
  - [x] SubTask 5.1: 检查 `VocabViewModel` 和 `VocabScreen` 是否依赖用户数据，如有则添加用户切换监听
  - [x] SubTask 5.2: 检查 `MosaViewModel` 和 `MosaScreen` 是否依赖用户数据，如有则添加用户切换监听
  - [x] SubTask 5.3: 检查 `ProfileScreen` 中的用户数据显示，确保切换账户后个人信息及时更新

- [x] Task 6: 添加调试日志与监控
  - [x] SubTask 6.1: 在关键位置添加日志输出，如 `AuthManager` 状态变化、`DataStoreManager` 文件读写、`ScheduleRepository` 同步流程
  - [x] SubTask 6.2: 确保日志包含用户 ID 信息，便于跟踪跨账户操作
  - [x] SubTask 6.3: 添加性能监控，记录用户切换后数据加载耗时

- [x] Task 7: 测试账户切换场景
  - [x] SubTask 7.1: 模拟用户 A 登录，添加日程数据，然后退出登录
  - [x] SubTask 7.2: 模拟用户 B 登录，验证日程界面显示空白（不显示用户 A 的数据）
  - [x] SubTask 7.3: 为用户 B 添加日程数据，然后切换回用户 A 登录，验证显示用户 A 的数据而非用户 B 的
  - [x] SubTask 7.4: 测试网络断开/恢复场景下的同步行为，确保数据一致性
  - [x] SubTask 7.5: 测试快速连续切换账户，确保应用不崩溃且数据不混乱

# Task Dependencies
- [Task 2] 依赖于 [Task 1] 的分析结果。
- [Task 3] 和 [Task 4] 可并行进行，但都依赖于 [Task 1] 的完成。
- [Task 5] 依赖于 [Task 2] 的修复，以确保基础监听机制正常。
- [Task 6] 可在任何阶段添加，但建议在 [Task 7] 前完成以便调试。
- [Task 7] 是最终验证，依赖于所有其他任务的完成。