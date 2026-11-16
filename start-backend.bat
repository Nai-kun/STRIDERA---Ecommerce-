@echo off
title STRIDERA Backend
set "PATH=C:\laragon\bin\nodejs\node-v20;%PATH%"
cd /d "%~dp0backend"
node server.js
pause

