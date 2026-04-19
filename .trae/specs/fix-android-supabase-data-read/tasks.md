# Tasks

- [x] Task 1: 检查 Supabase 连接配置和网络权限
  - [x] SubTask 1.1: 验证 `Constants.kt` 中的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 是否正确（与 Supabase 项目设置一致）
  - [x] SubTask 1.2: 检查 `AndroidManifest.xml` 是否已声明互联网权限 `<uses-permission android:name="android.permission.INTERNET" />`
  - [x] SubTask 1.3: 确认 `build.gradle.kts` 中的依赖版本（特别是 `io.ktor` 和 `kotlinx-serialization`）与项目兼容

- [x] Task 2: 分析登录响应并提取 JWT 令牌
  - [x] SubTask 2.1: 检查 `SupabaseClient.login` 的响应结构，确认是否包含 `token` 字段（可查阅后端 RPC 定义或通过日志打印响应）
  - [x] SubTask 2.2: 修改 `AuthManager.login` 和 `AuthManager.register`，在成功时从响应中提取 `token` 并存储到 `DataStoreManager` 或内存中
  - [x] SubTask 2.3: 在 `AuthManager` 中添加 `getToken(): String?` 方法，用于获取当前用户的令牌

- [x] Task 3: 修改 SupabaseClient 以支持动态令牌
  - [x] SubTask 3.1: 修改 `SupabaseClient.rpc` 函数，使其能够接收可选的 `token` 参数。如果提供了 token，则使用 `Bearer <token>` 作为 `Authorization` 头；否则使用 `SUPABASE_ANON_KEY`
  - [x] SubTask 3.2: 更新所有调用 `rpc` 的地方（`login`, `register`, `getUserData`, `upsertUserData`）传递适当的令牌（登录/注册使用 ANON_KEY，用户数据操作使用用户令牌）
  - [x] SubTask 3.3: 确保 `httpClient` 配置正确，支持动态头部（可能需要使用 `defaultRequest` 或每个请求单独设置）

- [x] Task 4: 验证 RPC 函数调用和响应处理
  - [x] SubTask 4.1: 检查 `get_user_data` 和 `upsert_user_data` 的 RPC 函数签名（参数名、类型）是否与客户端调用匹配
  - [x] SubTask 4.2: 验证 `ScheduleRepository` 或其他数据层是否正确调用 `SupabaseClient.getUserData` 并处理响应
  - [x] SubTask 4.3: 检查 `ScheduleViewModel` 或 `ProfileScreen` 中数据加载逻辑，确保在登录后触发数据获取

- [x] Task 5: 添加网络请求日志和错误处理
  - [x] SubTask 5.1: 在 `SupabaseClient.rpc` 中添加 `println` 或 `Log.d` 输出请求 URL、头部（隐藏敏感信息）和响应状态码
  - [x] SubTask 5.2: 增强错误处理，将网络异常和服务器错误转换为用户友好的提示信息
  - [x] SubTask 5.3: 在 `AuthManager` 和 `ScheduleRepository` 中添加适当的日志，便于追踪登录和数据加载流程

- [ ] Task 6: 测试登录和数据读取流程
  - [ ] SubTask 6.1: 运行应用，尝试使用有效账号登录，观察日志输出确认令牌获取和存储
  - [ ] SubTask 6.2: 登录后触发用户数据加载（例如进入日程页面），检查日志中 `get_user_data` 请求是否使用正确的令牌
  - [ ] SubTask 6.3: 验证数据是否正确显示在 UI 上，或检查 ViewModel 中的状态是否更新
  - [ ] SubTask 6.4: 测试异常场景（错误密码、网络断开）并确认错误处理正常工作

# Task Dependencies
- [Task 2] 依赖于 [Task 1] 的配置验证。
- [Task 3] 依赖于 [Task 2] 的令牌提取逻辑。
- [Task 4] 可以在 [Task 3] 完成后进行。
- [Task 5] 可以在任何阶段添加，但应在 [Task 6] 前完成。
- [Task 6] 依赖于所有其他任务的完成。
