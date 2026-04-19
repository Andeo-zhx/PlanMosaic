# Android APK Release打包规格说明

## Why
需要将PlanMosaic Android项目打包生成Release版本的可安装APK文件，并设置应用图标为image4.ico文件，以便用户可以安装和测试应用。

## What Changes
- 将image4.ico转换为Android支持的各种尺寸图标（PNG/WebP格式）
- 更新mipmap目录下的应用图标资源
- 配置Release版本的签名配置
- 构建并生成Release版本的APK文件

## Impact
- 受影响目录: `PlanMosaic AndroidStudio/app/src/main/res/mipmap-*`
- 受影响文件: `PlanMosaic AndroidStudio/app/build.gradle.kts`
- 输出文件: `PlanMosaic AndroidStudio/app/build/outputs/apk/release/app-release.apk`

## ADDED Requirements

### Requirement 1: 图标转换与设置
系统将image4.ico转换为Android应用所需的各种尺寸图标资源。

#### Scenario: 图标转换成功
- **GIVEN** image4.ico文件存在于项目根目录
- **WHEN** 执行图标转换流程
- **THEN** 生成以下尺寸的图标文件：
  - mdpi: 48x48px
  - hdpi: 72x72px
  - xhdpi: 96x96px
  - xxhdpi: 144x144px
  - xxxhdpi: 192x192px
  - 圆角图标 (round): 各尺寸对应大小

### Requirement 2: Release签名配置
系统配置Release版本的签名信息以便生成可安装的APK。

#### Scenario: 签名配置
- **GIVEN** 用户需要提供签名密钥库文件
- **WHEN** 用户创建或提供keystore文件
- **THEN** build.gradle.kts中配置release签名信息
- **AND** APK可以使用该签名进行构建

### Requirement 3: APK构建
系统执行Gradle构建命令生成Release版本的APK文件。

#### Scenario: 构建成功
- **GIVEN** 图标已更新且签名已配置
- **WHEN** 执行 `./gradlew assembleRelease` 命令
- **THEN** 在 `app/build/outputs/apk/release/` 目录生成 `app-release.apk` 文件
- **AND** APK文件已签名且可安装

## 技术细节

### 图标尺寸规格
| 密度 | 尺寸(普通) | 尺寸(圆角) |
|------|-----------|-----------|
| mdpi | 48x48 | 48x48 |
| hdpi | 72x72 | 72x72 |
| xhdpi | 96x96 | 96x96 |
| xxhdpi | 144x144 | 144x144 |
| xxxhdpi | 192x192 | 192x192 |

### 签名配置要求
- 需要keystore文件 (如 `release.keystore`)
- keystore密码
- key别名
- key密码

### 构建环境要求
- Android Studio / Gradle
- Android SDK
- Java 17 (根据build.gradle.kts配置)
