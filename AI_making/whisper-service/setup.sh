#!/bin/bash
# Whisper 服务环境设置脚本 - Linux/WSL 版本

echo "🔧 开始设置 Whisper 服务环境..."

# 检查 Conda 是否安装
if ! command -v conda &> /dev/null; then
    echo "❌ 错误：未找到 Conda。请先安装 Anaconda 或 Miniconda。"
    echo "下载地址：https://www.anaconda.com/download"
    exit 1
fi

echo "✅ 检测到 Conda"

# 创建 Conda 环境
echo "📦 创建 whisper-env 环境（Python 3.10）..."
conda create -n whisper-env python=3.10 -y

# 激活环境
echo "🔄 激活环境..."
source $(conda info --base)/etc/profile.d/conda.sh
conda activate whisper-env

# 安装依赖
echo "📥 安装 Python 依赖..."
pip install -r requirements.txt

# 下载 Whisper 模型（首次使用时会自动下载）
echo "📥 准备 Whisper 模型（首次运行时自动下载）..."
echo "   模型大小：base 约 142MB"

echo "" 
echo "✅ 环境设置完成！"
echo "" 
echo "使用方法："
echo "  1. 启动服务：./start-whisper.sh"
echo "  2. 服务将运行在：http://localhost:5000"
echo ""
