# Start Whisper venv
Write-Host "Starting Whisper service..." -ForegroundColor Green

if (-not (Test-Path ".\whisper-env\Scripts\Activate.ps1")) {
    Write-Host "ERROR: Virtual environment not found. Run .\setup-venv.ps1 first" -ForegroundColor Red
    exit 1
}

& ".\whisper-env\Scripts\Activate.ps1"
python app.py
