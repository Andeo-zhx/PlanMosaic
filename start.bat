@echo off
chcp 65001 >nul
title 学业规划系统
echo 正在启动学业规划系统...
echo.

REM 检查Node.js是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js
    echo 请从 https://nodejs.org/ 下载并安装Node.js
    pause
    exit /b 1
)

REM 检查是否已安装依赖（node_modules是否存在）
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install --no-optional
    if %errorlevel% neq 0 (
        echo 依赖安装失败，将尝试使用内置HTTP服务器
    )
)

REM 启动HTTP服务器
echo 启动本地服务器...
echo 按 Ctrl+C 停止服务器
echo.

node server.js

if %errorlevel% neq 0 (
    echo 服务器启动失败
    pause
)