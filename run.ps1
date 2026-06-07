# run.ps1 - one command to set up (first run) and launch Stock Tracker.
# Usage:  .\run.ps1        (then open http://localhost:8000)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. Create the virtual environment if it doesn't exist yet (one-time).
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment (.venv)..." -ForegroundColor Cyan
    python -m venv .venv
}

# Call the venv's Python directly - no activation needed.
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

# 2. Install/update dependencies (fast no-op once satisfied).
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet -r requirements.txt

# 3. Create .env from the template the first time, and remind to add the key.
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from template. Edit it and add your OPENAI_API_KEY." -ForegroundColor Yellow
    Write-Host "(The app still runs without a key; AI features use local fallbacks.)" -ForegroundColor Yellow
}

# 4. Launch.
Write-Host "Starting Stock Tracker on http://localhost:8000 ..." -ForegroundColor Green
& $py -m uvicorn main:app --reload --port 8000
