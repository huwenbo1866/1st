# 将以下内容复制到新的 setup.ps1 文件中
@'
# Whisper 服务环境设置脚本 - Windows PowerShell 版本

Write-Host "🔧 开始设置 Whisper 服务环境..." -ForegroundColor Green

# 检查 Conda 是否安装
if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误：未找到 Conda。请先安装 Anaconda 或 Miniconda。" -ForegroundColor Red
    Write-Host "下载地址：https://www.anaconda.com/download" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 检测到 Conda" -ForegroundColor Green

# 创建 Conda 环境
Write-Host "📦 创建 whisper-env 环境（Python 3.10）..." -ForegroundColor Cyan
conda create -n whisper-env python=3.10 -y

# 激活环境
Write-Host "🔄 激活环境..." -ForegroundColor Cyan
conda activate whisper-env

# 安装依赖
Write-Host "📥 安装 Python 依赖..." -ForegroundColor Cyan
pip install -r requirements.txt

# 下载 Whisper 模型（首次使用时会自动下载）
Write-Host "📥 准备 Whisper 模型（首次运行时自动下载）..." -ForegroundColor Cyan
Write-Host "   模型大小：base 约 142MB" -ForegroundColor Yellow

Write-Host "" 
Write-Host "✅ 环境设置完成！" -ForegroundColor Green
Write-Host "" 
Write-Host "使用方法：" -ForegroundColor Cyan
Write-Host "  1. 启动服务：.\start-whisper.ps1" -ForegroundColor White
Write-Host "  2. 服务将运行在：http://localhost:5000" -ForegroundColor White
Write-Host ""
'@ | Out-File -FilePath .\setup-new.ps1 -Encoding UTF8

# 运行新的脚本
.\setup-new.ps1