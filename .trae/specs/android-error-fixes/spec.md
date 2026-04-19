# Android 错误修复 Spec

## Why
Android 子项目出现了严重的编译错误，包括 "Unresolved reference 'get'" 和接收器类型不匹配 "HttpMessageBuilder.header"。这些错误导致应用无法构建，影响开发和测试。此外，项目中可能存在其他逻辑谬误和代码质量问题，需要进行整体的大修复以确保代码健壮性和可维护性。

## What Changes
- **修复 Ktor 导入问题**：在 `ProfileScreen.kt` 中添加缺失的 `io.ktor.client.request.*` 导入，解决 `get` 方法未解析的错误。
- **修复接收器类型不匹配**：检查 `header` 方法的调用上下文，确保在正确的接收器上调用。
- **检查其他编译错误**：搜索整个 Android 项目中的编译错误（如未解析的引用、类型不匹配、语法错误等）并逐一修复。
- **修复逻辑谬误**：审查关键业务逻辑（如网络请求、数据解析、状态管理）中的潜在错误。
- **更新依赖版本（如有需要）**：确保 Ktor、Supabase 等依赖版本兼容，避免因版本冲突导致的编译问题。
- **运行构建验证**：修复后执行 `./gradlew assembleDebug` 确保项目能够成功构建。

## Impact
- Affected specs: Android 端的编译和运行能力。
- Affected code:
  - `app/src/main/java/com/example/planmosaic_android/ui/screens/profile/ProfileScreen.kt`
  - `app/src/main/java/com/example/planmosaic_android/data/remote/AiApiClient.kt`
  - `app/src/main/java/com/example/planmosaic_android/data/remote/SupabaseClient.kt`
  - 其他可能存在错误的 Kotlin 文件。

## MODIFIED Requirements
### Requirement: 可编译的 Android 应用
系统 SHALL 能够成功编译并生成 APK：
- **WHEN** 开发者执行 `./gradlew assembleDebug` 时
- **THEN** 构建过程应当成功完成，无编译错误。

### Requirement: 正确的网络请求
系统 SHALL 能够正确执行 Ktor 网络请求：
- **WHEN** 在 `ProfileScreen.kt` 中测试 AI API 连接时
- **THEN** `client.get` 方法应当被正确解析，`header` 方法应当在正确的接收器上调用。

## REMOVED Requirements
无。
