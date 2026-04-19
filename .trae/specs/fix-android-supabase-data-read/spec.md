# 修复 Android 子应用 Supabase 数据读取问题 Spec

## Why
用户报告 Android 子应用在打开并登录账号后无法读取 Supabase 数据库中的数据。登录流程似乎成功，但后续的数据读取请求失败或返回空数据。这可能是由于身份验证令牌未正确传递、RPC 链接配置错误、网络权限问题或数据库行级安全（RLS）策略导致。

## What Changes
- **验证 Supabase 连接配置**：检查 Constants.kt 中的 URL 和密钥是否正确，确认网络权限和依赖版本。
- **修复身份验证令牌传递**：当前 SupabaseClient 在所有 RPC 调用中使用匿名密钥（ANON_KEY），登录后应使用用户特定的 JWT 令牌进行后续请求。
- **检查 RPC 函数和响应处理**：确保 login_user 和 get_user_data 等 RPC 函数的调用参数和响应解析正确。
- **审查数据流和存储**：检查 AuthManager、DataStoreManager 以及 Repository 层的数据缓存和同步逻辑。
- **添加日志和错误处理**：在关键网络请求点添加日志输出，便于调试。

## Impact
- **受影响的功能**：用户登录、用户数据获取、日程数据同步。
- **受影响的代码文件**：
  - `data/remote/SupabaseClient.kt`
  - `util/AuthManager.kt`
  - `util/Constants.kt`
  - `data/repository/ScheduleRepository.kt`
  - `ui/screens/schedule/ScheduleViewModel.kt`
  - `ui/screens/profile/ProfileScreen.kt`
- **可能涉及的其他文件**：AndroidManifest.xml（网络权限）、build.gradle.kts（依赖版本）。

## ADDED Requirements
### 要求：登录后使用 JWT 令牌进行 Supabase 请求
系统应在用户登录后，将 RPC 调用中的 `Authorization` 头从匿名密钥替换为从登录响应中获取的 JWT 令牌。

#### 场景：成功登录后获取用户数据
- **当** 用户使用正确的用户名和密码登录
- **然后** `login_user` RPC 返回包含 `token` 字段的成功响应
- **并且** 该令牌应保存在 `AuthManager` 或 `DataStoreManager` 中
- **并且** 后续的 `get_user_data` 等 RPC 调用应在 `Authorization` 头中使用该令牌

### 要求：增强网络请求日志和错误处理
系统应在关键网络请求点（如 `SupabaseClient.rpc`）添加详细的日志输出，包括请求 URL、头部和响应状态，以便于调试。

#### 场景：网络请求失败
- **当** Supabase RPC 调用因网络错误或服务器错误失败时
- **然后** 应在日志中输出错误详情（非敏感信息）
- **并且** 用户界面应显示适当的错误消息

## MODIFIED Requirements
### 要求：现有 SupabaseClient 身份验证头
修改 `SupabaseClient.rpc` 函数，使其能够根据当前登录状态动态设置 `Authorization` 头。如果存在用户令牌，则使用 `Bearer <user_token>`；否则回退到匿名密钥。

### 要求：现有 AuthManager 令牌管理
扩展 `AuthManager` 以存储和管理从登录响应中获取的 JWT 令牌，并提供获取当前令牌的方法。

## REMOVED Requirements
无
