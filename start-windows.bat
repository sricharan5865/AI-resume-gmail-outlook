@echo off
:: ============================================================
:: TalentFlow - Windows Startup Script
:: Usage: Double-click or run from command prompt
:: ============================================================

echo.
echo ==============================================
echo   TalentFlow - Windows Startup
echo ==============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Install from: https://nodejs.org/
    pause
    exit /b 1
)
echo [INFO] Node.js: OK

:: Install server dependencies
echo [INFO] Installing server dependencies...
cd server
call npm install --silent
cd ..

:: Install client dependencies
echo [INFO] Installing client dependencies...
cd client
call npm install --silent
cd ..

echo.
echo ==============================================
echo   Starting TalentFlow...
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:5000
echo.
echo   Open in browser: http://localhost:5173
echo ==============================================
echo.

:: Start backend in new window
start "TalentFlow Backend" cmd /k "cd server && npm run dev"

:: Wait a moment
timeout /t 3 /nobreak >nul

:: Start frontend in new window
start "TalentFlow Frontend" cmd /k "cd client && npm run dev"

echo [INFO] Both servers are starting in separate windows.
echo [INFO] Close those windows to stop the servers.
pause
