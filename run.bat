@echo off
chcp 65001 >nul
title AIOU Help Server
echo ===================================================
echo     Starting AIOU Help Study Assistant...
echo ===================================================

if exist "C:\Users\HP\AppData\Local\Python\bin\python.exe" (
    "C:\Users\HP\AppData\Local\Python\bin\python.exe" run_server.py
    pause
    exit /b
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    python run_server.py
    pause
    exit /b
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    py run_server.py
    pause
    exit /b
)

echo [ERROR] Python not found. Please install Python 3.10+ and add to PATH.
pause
