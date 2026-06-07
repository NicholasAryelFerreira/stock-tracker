@echo off
REM run.bat - one command to set up (first run) and launch Stock Tracker.
REM Usage (Command Prompt):  run.bat     then open http://localhost:8000
cd /d "%~dp0"

if not exist ".venv" (
    echo Creating virtual environment ^(.venv^)...
    python -m venv .venv
)

set "PY=.venv\Scripts\python.exe"

"%PY%" -m pip install --quiet --upgrade pip
"%PY%" -m pip install --quiet -r requirements.txt

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo Created .env from template. Edit it and add your OPENAI_API_KEY.
)

echo Starting Stock Tracker on http://localhost:8000 ...
"%PY%" -m uvicorn main:app --reload --port 8000
