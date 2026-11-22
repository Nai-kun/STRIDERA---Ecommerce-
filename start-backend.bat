@echo off
title STRIDERA Python FastAPI Backend
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment .venv not found!
    echo Creating .venv and installing dependencies from requirements.txt...
    python -m venv .venv
    call ".venv\Scripts\pip.exe" install -r requirements.txt
)
echo Initializing / verifying PostgreSQL schema...
".venv\Scripts\python.exe" -m python_backend.init_db
echo Starting STRIDERA Python FastAPI Backend on http://localhost:5000 ...
echo Interactive API Docs: http://localhost:5000/docs
".venv\Scripts\python.exe" -m python_backend.run
pause
