@echo off
chcp 65001 >nul
echo ==========================================
echo PlanMosaic APK 安装脚本
echo ==========================================
echo.

:: 设置Java环境
set "JAVA_HOME=D:\Programs\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

:: 查找adb工具
set "ADB_PATH="
for /f "delims=" %%a in ('dir /s /b "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" 2^>nul') do (
    set "ADB_PATH=%%a"
    goto :found_adb
)

if "%ADB_PATH%"=="" (
    echo [错误] 未找到 adb 工具
    echo.
    echo 请确保已安装 Android Studio 或 Android SDK
    echo 或者手动将 adb.exe 路径添加到环境变量
    pause
    exit /b 1
)

:found_adb
echo [信息] 找到 ADB: %ADB_PATH%
echo.

:: 检查设备连接
echo [步骤1/3] 检查设备连接...
"%ADB_PATH%" devices
echo.

:: 检查是否识别到设备
for /f "tokens=1" %%a in ('"%ADB_PATH%" devices ^| findstr /v "List of" ^| findstr /v "^$"') do (
    set "DEVICE=%%a"
    goto :device_found
)

echo [错误] 未检测到已连接的设备
echo.
echo 请检查:
echo 1. 手机已通过USB连接到电脑
echo 2. 手机已开启USB调试模式
echo    设置 → 开发者选项 → USB调试 (开启)
echo 3. 已授权电脑调试权限 (手机上会弹出提示)
echo.
pause
exit /b 1

:device_found
echo [信息] 检测到设备: %DEVICE%
echo.

:: 检查APK文件是否存在
set "APK_PATH=app\build\outputs\apk\release\app-release.apk"
if not exist "%APK_PATH%" (
    echo [错误] 未找到APK文件: %APK_PATH%
    echo.
    echo 请先构建APK:
    echo   .\gradlew assembleRelease
    pause
    exit /b 1
)

echo [步骤2/3] 安装APK到设备...
"%ADB_PATH%" install -r "%APK_PATH%"
if %errorlevel% neq 0 (
    echo.
    echo [错误] 安装失败
echo.
    echo 常见原因:
    echo - 设备上已安装相同包名但签名不同的应用
echo - 手机存储空间不足
echo - 未允许安装未知来源应用
echo.
    echo 尝试卸载旧版本后重新安装:
    echo   adb uninstall com.example.planmosaic_android
echo.
    pause
    exit /b 1
)

echo.
echo [步骤3/3] 启动应用...
"%ADB_PATH%" shell am start -n com.example.planmosaic_android/.MainActivity

echo.
echo ==========================================
echo [成功] APK安装完成！
echo ==========================================
echo.
pause
