# Whisper 鏈嶅姟鐜璁剧疆鑴氭湰 - Windows PowerShell 鐗堟湰

Write-Host "馃敡 寮€濮嬭缃?Whisper 鏈嶅姟鐜..." -ForegroundColor Green

# 妫€鏌?Conda 鏄惁瀹夎
if (-not (Get-Command conda -ErrorAction SilentlyContinue)) {
    Write-Host "鉂?閿欒锛氭湭鎵惧埌 Conda銆傝鍏堝畨瑁?Anaconda 鎴?Miniconda銆? -ForegroundColor Red
    Write-Host "涓嬭浇鍦板潃锛歨ttps://www.anaconda.com/download" -ForegroundColor Yellow
    exit 1
}

Write-Host "鉁?妫€娴嬪埌 Conda" -ForegroundColor Green

# 鍒涘缓 Conda 鐜
Write-Host "馃摝 鍒涘缓 whisper-env 鐜锛圥ython 3.10锛?.." -ForegroundColor Cyan
conda create -n whisper-env python=3.10 -y

# 婵€娲荤幆澧?
Write-Host "馃攧 婵€娲荤幆澧?.." -ForegroundColor Cyan
conda activate whisper-env

# 瀹夎渚濊禆
Write-Host "馃摜 瀹夎 Python 渚濊禆..." -ForegroundColor Cyan
pip install -r requirements.txt

# 涓嬭浇 Whisper 妯″瀷锛堥娆′娇鐢ㄦ椂浼氳嚜鍔ㄤ笅杞斤級
Write-Host "馃摜 鍑嗗 Whisper 妯″瀷锛堥娆¤繍琛屾椂鑷姩涓嬭浇锛?.." -ForegroundColor Cyan
Write-Host "   妯″瀷澶у皬锛歜ase 绾?142MB" -ForegroundColor Yellow

Write-Host "" 
Write-Host "鉁?鐜璁剧疆瀹屾垚锛? -ForegroundColor Green
Write-Host "" 
Write-Host "浣跨敤鏂规硶锛? -ForegroundColor Cyan
Write-Host "  1. 鍚姩鏈嶅姟锛?\start-whisper.ps1" -ForegroundColor White
Write-Host "  2. 鏈嶅姟灏嗚繍琛屽湪锛歨ttp://localhost:5000" -ForegroundColor White
Write-Host ""
