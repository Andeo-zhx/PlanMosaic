@echo off
chcp 65001 >nul
echo ==========================================
echo PlanMosaic Android APK 构建脚本
echo ==========================================
echo.

:: 检查Java环境
if "%JAVA_HOME%"=="" (
    echo [错误] 未设置 JAVA_HOME 环境变量
    echo.
    echo 请按以下步骤配置Java环境:
    echo 1. 安装Android Studio (推荐)
    echo    下载地址: https://developer.android.com/studio
    echo 2. 或者安装JDK 17
    echo    下载地址: https://adoptium.net/
    echo 3. 设置JAVA_HOME环境变量指向JDK安装目录
    echo.
    pause
    exit /b 1
)

echo [信息] JAVA_HOME: %JAVA_HOME%
echo.

:: 进入项目目录
cd /d "%~dp0PlanMosaic AndroidStudio"

echo [步骤1/3] 清理构建目录...
call .\gradlew clean
if %errorlevel% neq 0 (
    echo [错误] 清理失败
    pause
    exit /b 1
)

echo.
echo [步骤2/3] 构建Release APK...
call .\gradlew assembleRelease
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo [步骤3/3] 验证APK文件...
set APK_PATH=app\build\outputs\apk\release\app-release.apk
if exist "%APK_PATH%" (
    echo [成功] APK文件已生成!
    echo.
    echo ==========================================
    echo APK文件位置:
    echo %CD%\%APK_PATH%
    echo ==========================================
    echo.
    echo 安装命令:
    echo adb install "%CD%\%APK_PATH%"
    echo.
) else (
    echo [错误] 未找到生成的APK文件
    pause
    exit /b 1
)

pause
