# 启动 Whisper 服务
# Windows PowerShell 版本

Write-Host "🚀 启动 Whisper 音频转文字服务..." -ForegroundColor Green

# 切换到脚本所在目录
Set-Location $PSScriptRoot

# 激活 conda 环境并启动服务
conda activate whisper-env
python app.py
