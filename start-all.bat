@echo off
title STRIDERA Full-Stack Launcher (PostgreSQL + Python FastAPI + Next.js)
echo ============================================================
echo   Starting STRIDERA E-Commerce Platform
echo   Back-End: Python 3.12 + FastAPI + SQLAlchemy 2.0 (:5000)
echo   Front-End: Next.js 16 Storefront (:3000)
echo   Database: PostgreSQL / PGlite (:5432)
echo ============================================================

echo [1/3] Checking PostgreSQL on port 5432...
netstat -ano | findstr ":5432 " >nul
if errorlevel 1 (
    echo Starting Embedded PostgreSQL Server ^(PGlite^) on port 5432...
    set "PATH=C:\laragon\bin\nodejs\node-v20;%PATH%"
    start "STRIDERA PostgreSQL" cmd /k "cd /d %~dp0backend && node db-server.js"
    timeout /t 4 /nobreak >nul
) else (
    echo PostgreSQL already listening on port 5432.
)

echo [2/3] Launching Python FastAPI Back-End ^(Port 5000^)...
start "STRIDERA FastAPI Backend" cmd /k call "%~dp0start-backend.bat"
timeout /t 3 /nobreak >nul

echo [3/3] Launching Next.js Web Storefront ^(Port 3000^)...
start "STRIDERA Frontend" cmd /k call "%~dp0start-frontend.bat"

echo.
echo All STRIDERA services launched!
echo   - Storefront UI:   http://localhost:3000
echo   - FastAPI Backend: http://localhost:5000/api
echo   - Swagger Docs:    http://localhost:5000/docs
echo.
pause
