# Setup Whisper venv
Write-Host "Setting up Python virtual environment..." -ForegroundColor Green

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found. Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

python --version
python -m venv whisper-env
& ".\whisper-env\Scripts\Activate.ps1"
python -m pip install --upgrade pip
pip install -r requirements.txt

Write-Host "Setup complete! Run .\start-whisper-venv.ps1 to start" -ForegroundColor Green
