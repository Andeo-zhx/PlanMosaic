@echo off
cd /d "%~dp0PlanMosaic Desktop"

echo ========================================
echo    PlanMosaic Desktop App Launcher
echo ========================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json not found!
    echo Please ensure this script is in the project root.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Dependency install failed. Check network or npm config.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
)

echo [START] Launching PlanMosaic Desktop App...
echo.
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] App failed to start, exit code: %errorlevel%
    pause
    exit /b %errorlevel%
)

echo.
echo [EXIT] PlanMosaic closed.
pause