@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set "TARGET=d:\Trae CN\Projects\PlanMosaic\index.html"
set "ICON=d:\Trae CN\Projects\PlanMosaic\Image\image3.jpg"
set "SHORTCUT=%USERPROFILE%\Desktop\PlanMosaic.lnk"
set "WORKING_DIR=d:\Trae CN\Projects\PlanMosaic"

echo 正在创建 PlanMosaic 桌面快捷方式...
echo 目标: %TARGET%
echo 图标: %ICON%
echo 快捷方式位置: %SHORTCUT%

powershell -NoProfile -ExecutionPolicy Bypass -Command "
    $ws = New-Object -ComObject WScript.Shell;
    $s = $ws.CreateShortcut('%SHORTCUT%');
    $s.TargetPath = '%TARGET%';
    $s.WorkingDirectory = '%WORKING_DIR%';
    $s.IconLocation = '%ICON%,0';
    $s.Description = 'PlanMosaic - 智能日程规划';
    $s.Save();
    Write-Host '快捷方式创建成功！' -ForegroundColor Green;
"

if exist "%SHORTCUT%" (
    echo.
    echo 快捷方式已成功创建在桌面！
    echo 图标已设置为 image3.jpg
) else (
    echo.
    echo 快捷方式创建失败，请检查路径是否正确。
)

pause
