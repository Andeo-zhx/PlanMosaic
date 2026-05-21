@echo off
cls

REM Change to project directory
cd /d "D:\Trae CN\Projects\PlanMosaic"

REM Check if package.json exists
if not exist "package.json" (
    echo Error: package.json not found
    echo Please check the project directory structure
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo Warning: node_modules not found
    echo Installing dependencies, please wait...
    npm install --no-optional
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
)

REM Start Electron app
echo Starting Academic Planner System...
echo App window should open automatically
echo.
npm start

if %errorlevel% neq 0 (
    echo.
    echo Error: Failed to start desktop app
    echo Trying CLI tool as alternative...
    echo.
    node cli.js
    pause
    exit /b 1
)

echo.
echo App started successfully!
echo You can close this window now.
echo.
timeout /t 3 >nul
exit /b 0