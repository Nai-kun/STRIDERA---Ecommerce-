@echo off
title STRIDERA Frontend
set "PATH=C:\laragon\bin\nodejs\node-v20;%PATH%"
cd /d "%~dp0frontend"
npm run dev
pause

