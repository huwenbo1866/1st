# Qwen-VL 多模态聊天应用

一个基于 Qwen-VL 的多模态聊天应用，支持文本、图片、文档等多种输入方式，以及语音转文字功能。

## 功能特性

- 💬 文本对话
- 🖼️ 图片识别
- 📄 文档解析（PDF、Word等）
- 🎤 语音转文字（Whisper）
- 📊 对话导出为PDF
- 🔊 文字转语音（TTS）

## 环境要求

### 主项目
- Node.js 14+
- npm 或 yarn

### Whisper 服务（可选）
- Python 3.10+
- Anaconda/Miniconda（推荐在 WSL 环境下使用）

---

## 快速启动指南

### 第一步：克隆项目并安装依赖

```powershell
# 1. 克隆项目（如果还没克隆）
git clone https://github.com/huwenbo1866/AI_making.git
cd AI_making

# 2. 设置 Node.js 环境变量（根据你的实际安装路径）
$env:Path = "C:\Program Files\nodejs;" + $env:Path

# 3. 安装主项目依赖
npm install

# 4. 安装后端依赖
cd server
npm install
cd ..
```

### 第二步：配置后端 API 密钥

编辑 `server/.env.multi` 文件，确保 API 密钥已设置：

```env
SILICONFLOW_API_KEY=sk-your-api-key-here
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1
PORT=3001
```

### 第三步：启动主项目（前端 + 后端）

```powershell
# 在项目根目录下运行
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run dev
```

启动成功后：
- **前端**：http://localhost:3000
- **后端 API**：http://localhost:3001

### 第四步：启动 Whisper 语音服务（可选）

Whisper 服务用于语音转文字功能。如果不需要该功能，可以跳过此步骤。

#### 方式一：在 WSL 环境下启动（推荐）

```bash
# 1. 打开 WSL
wsl

# 2. 进入项目目录（根据你的实际路径调整）
cd /mnt/c/Users/Admin/Desktop/textbookAna/AI_making/whisper-service

# 3. 给脚本添加执行权限
chmod +x setup.sh start-whisper.sh

# 4. 首次运行：安装环境（只需运行一次）
./setup.sh

# 5. 启动 Whisper 服务
./start-whisper.sh
```

#### 方式二：在 Windows 下启动（使用 conda）

```powershell
# 在 whisper-service 目录下
cd whisper-service

# 首次运行：安装环境
.\setup.ps1

# 启动服务
.\start-whisper.ps1
```

Whisper 服务启动后运行在：http://localhost:5000

---

## 完整的启动流程总结

### 日常开发启动流程

```powershell
# 1. 设置环境变量（每次新开终端都需要）
$env:Path = "C:\Program Files\nodejs;" + $env:Path

# 2. 启动主项目（在项目根目录）
npm run dev

# 3. （可选）在 WSL 中启动 Whisper 服务
# wsl
# cd /mnt/c/Users/Admin/Desktop/textbookAna/AI_making/whisper-service
# ./start-whisper.sh
```

### 各服务访问地址

- **前端应用**：http://localhost:3000
- **后端 API**：http://localhost:3001
- **Whisper 服务**（可选）：http://localhost:5000

### 停止服务

- **停止前端/后端**：在运行 `npm run dev` 的终端按 `Ctrl+C`
- **停止 Whisper**：在运行 Whisper 的终端按 `Ctrl+C`

---

## 其他启动方式

### 只启动前端
```bash
npm start
```

### 只启动后端
```bash
npm run start:server
```

### 使用不同的启动模式

```bash
# 多进程模式
npm run start:multi

# 集群模式
npm run start:workers

# 负载均衡模式
npm run start:balancer
```

---

## 故障排除

### 1. 找不到 Node.js 命令

确保 Node.js 已安装，并设置环境变量：
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
# 或根据你的实际安装路径修改
```

### 2. 后端启动失败（API 密钥错误）

检查 `server/.env.multi` 文件，确保 `SILICONFLOW_API_KEY` 已正确设置。

### 3. 前端连接不到后端

确认：
- 后端服务已启动在 http://localhost:3001
- `src/api/chatApi.ts` 中的 `API_BASE_URL` 设置为 `http://localhost:3001/api`

### 4. Whisper 服务启动失败

**在 WSL 中使用 conda**（推荐）：
```bash
# 检查 conda 是否安装
conda --version

# 如果没有，安装 Miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
```

### 5. 端口被占用

如果端口被占用，可以修改端口：
- **前端**：在 `package.json` 中修改或设置环境变量 `PORT=3002`
- **后端**：在 `server/.env.multi` 中修改 `PORT=3001`
- **Whisper**：在 `whisper-service/app.py` 中修改或设置环境变量 `PORT=5001`

---

## 使用语音转文字功能

1. 确保 Whisper 服务运行在 `http://localhost:5000`
2. 在聊天界面点击 🎤 按钮
3. 选择音频文件（支持 MP3, WAV, MP4, M4A, OGG, WebM）
4. 等待转录完成，文字会自动填入输入框

详细说明见 [whisper-service/README.md](whisper-service/README.md)

---

## 技术栈

### 前端
- React 19
- TypeScript
- React Markdown
- KaTeX（数学公式）
- html2pdf.js（PDF导出）

### 后端
- Node.js
- Express
- Multer（文件上传）
- pdf-parse（PDF解析）
- mammoth（Word解析）

### AI服务
- Qwen-VL（多模态对话）
- Whisper（语音识别）
- SiliconFlow API

## 项目结构

```
AI_making/
├── src/                    # 前端源码
│   ├── components/         # React组件
│   ├── api/               # API接口
│   └── utils/             # 工具函数
├── server/                # 后端服务
│   ├── worker.js          # 主服务器
│   ├── .env.multi         # 环境配置
│   └── utils/             # 后端工具
├── whisper-service/       # Whisper语音服务
│   ├── app.py            # Flask应用
│   ├── setup.sh          # Linux环境安装脚本
│   ├── start-whisper.sh  # Linux启动脚本
│   ├── setup.ps1         # Windows环境安装脚本
│   └── start-whisper.ps1 # Windows启动脚本
└── public/               # 静态资源
```

## 已知问题

- ✅ ~~Whisper 模型未导入~~ 已完成集成
- 导出PDF时会有绿色条纹
- 进程检查超时 + 重复请求

## 许可证

MIT


## 使用 OpenWebUI 后端桥接（新）

如果你想保留当前前端不改动，同时把后端切换为 `open-webui`，可以直接使用桥接服务：

1. 复制配置文件：

```bash
cd server
cp .env.openwebui.example .env.openwebui
```

2. 修改 `OPENWEBUI_BASE_URL`（以及可选 `OPENWEBUI_API_KEY`）。

3. 启动桥接（端口仍为 `3001`，前端无需改 API 地址）：

```bash
npm run start:bridge
```

4. 联合启动（前端 + 桥接）：

```bash
npm run dev:bridge
```

桥接已包含这些兼容接口：
- `/api/chat/stream`
- `/api/upload` / `/api/upload/multiple`
- `/api/files` / `/api/files/:id`
- `/api/tts/generate`
- `/api/models`
- `/api/configs`
- 第二阶段与增强：`/api/retrieval` `/api/knowledge` `/api/prompts` `/api/chats` `/api/folders` `/api/notes` `/api/channels`
- 长对话记忆：`/api/memories`（GET/POST/DELETE）与 `/api/session/reset`
- Agent SkillGoon 能力入口：`/api/skillgoon/functions` `/api/skillgoon/tools`（基于 OpenWebUI functions/tools）


## 长对话与 SkillGoon 说明

- 桥接层已加入按 `X-User-ID` 维度的会话上下文保留，会在每轮请求自动携带最近多轮上下文到 OpenWebUI。
- 可通过 `MAX_HISTORY_TURNS` 控制保留轮数，默认 20。
- 可调用 `POST /api/session/reset` 清空当前会话上下文。
- `skillgoon` 入口通过 OpenWebUI 的 Functions/Tools 暴露：
  - `GET /api/skillgoon/functions`
  - `GET /api/skillgoon/tools`

> 说明：你提到的“SkillGoon”目前在本仓库中未发现官方独立项目/接口定义，因此采用 OpenWebUI 原生 Agent 能力（functions/tools）作为兼容落地实现。
