@echo off
chcp 65001 >nul
echo ==========================================
echo PlanMosaic 图标设置工具
echo ==========================================
echo.

:: 检查 PowerShell
powershell -Command "Get-Host" >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 无法运行 PowerShell 脚本
    pause
    exit /b 1
)

echo 步骤 1: 正在将 image3.jpg 转换为 favicon.ico...
powershell -ExecutionPolicy Bypass -File "d:\Trae CN\Projects\PlanMosaic\create-favicon.ps1"

echo.
echo 步骤 2: 正在创建桌面快捷方式...

set "TARGET=d:\Trae CN\Projects\PlanMosaic\index.html"
set "ICON=d:\Trae CN\Projects\PlanMosaic\favicon.ico"
set "SHORTCUT=%USERPROFILE%\Desktop\PlanMosaic.lnk"
set "WORKING_DIR=d:\Trae CN\Projects\PlanMosaic"

if not exist "%ICON%" (
    echo 警告: favicon.ico 未找到，将使用 image3.jpg 作为图标
    set "ICON=d:\Trae CN\Projects\PlanMosaic\Image\image3.jpg"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "
    try {
        $ws = New-Object -ComObject WScript.Shell;
        $s = $ws.CreateShortcut('%SHORTCUT%');
        $s.TargetPath = '%TARGET%';
        $s.WorkingDirectory = '%WORKING_DIR%';
        $s.IconLocation = '%ICON%,0';
        $s.Description = 'PlanMosaic - 智能日程规划';
        $s.Save();
        Write-Host '桌面快捷方式创建成功！' -ForegroundColor Green;
    } catch {
        Write-Host ('错误: ' + $_.Exception.Message) -ForegroundColor Red;
    }
"

echo.
if exist "%SHORTCUT%" (
    echo ==========================================
    echo 设置完成！
    echo ==========================================
    echo.
    echo 快捷方式位置: %SHORTCUT%
    echo 图标文件: %ICON%
    echo.
    echo 您现在可以在桌面上看到 PlanMosaic 快捷方式，
    echo 图标显示为 image3。
) else (
    echo 快捷方式创建可能失败，请检查错误信息。
)

echo.
pause
