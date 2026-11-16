@echo off
title STRIDERA Launcher
echo ===================================================
echo   Starting STRIDERA E-Commerce Platform
echo ===================================================
echo [1/2] Launching Backend ^& Database (Port 5000)...
start "STRIDERA Backend" cmd /k call "%~dp0start-backend.bat"
timeout /t 3 /nobreak >nul
echo [2/2] Launching Frontend Web App (Port 3000)...
start "STRIDERA Frontend" cmd /k call "%~dp0start-frontend.bat"
echo.
echo Both servers launched in dedicated windows!
echo Web Store: http://localhost:3000
echo Backend API: http://localhost:5000/api
echo.
pause
