@echo off
title STRIDERA Frontend
set "PATH=C:\laragon\bin\nodejs\node-v20;%PATH%"
cd /d "%~dp0"
npm run dev
pause

