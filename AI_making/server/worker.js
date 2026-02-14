// server/worker.js - 工作进程入口
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; 
const crypto = require('crypto');
const iconv = require('iconv-lite');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { processDocumentFile, summarizeDocument, SUPPORTED_DOC_TYPES } = require('./utils/fileProcessor');
const { SessionManager, FilePathManager, LockManager, UserSession } = require('./utils/shared');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '.env.multi') }); // 使用多进程配置

// 获取 worker 配置
const workerId = process.env.WORKER_ID || '1';
const workerPort = process.env.WORKER_PORT || 3001;

// 初始化共享管理器
const sessionManager = new SessionManager();
const lockManager = new LockManager();

// 初始化 worker 统计
const workerStats = {
  activeConnections: 0,
  requests: 0,
  errors: 0
};

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(async (req, res, next) => {
  workerStats.requests++;
  workerStats.activeConnections++;
  res.on('finish', () => {
    workerStats.activeConnections--;
  });

  // 新增：userId和session管理
  let userId = req.headers['x-user-id'];
  if (!userId) {
    userId = crypto.randomUUID();
    res.setHeader('X-User-ID', userId); // 返回给前端
  }
  req.userId = userId;

  let session = await sessionManager.getSession(userId);
  if (!session) {
    session = await sessionManager.createSession(userId, workerId);
  }
  req.session = session;
  next();
});
app.use((err, req, res, next) => {
  console.error(`Worker ${workerId} 全局错误处理:`, err.message);
  workerStats.errors++;
  
  // 安全地提取错误信息
  const safeError = {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  };
  
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    details: safeError
  });
});

// 配置上传目录 - 使用环境变量，确保所有 worker 共享同一目录
const UPLOAD_BASE_DIR = process.env.BASE_UPLOAD_DIR || path.join(__dirname, 'uploads');

// 创建基目录（使用锁防止并发创建）
const initUploadDirs = async () => {
  const release = await lockManager.acquire('upload_dirs');
  try {
    if (!(await fs.stat(UPLOAD_BASE_DIR).catch(() => false))) {
      await fs.mkdir(UPLOAD_BASE_DIR, { recursive: true });
    }
  } finally {
    release();
  }
};
initUploadDirs();

// 允许访问上传的文件
app.use('/uploads', express.static(UPLOAD_BASE_DIR));

// SiliconFlow API配置
const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1';
// 文本转语音 URL配置
const SILICONFLOW_TTS_URL = 'https://api.siliconflow.cn/v1/audio/speech';
const API_KEY = process.env.SILICONFLOW_API_KEY;

if (!API_KEY) {
  console.error(`Worker ${workerId} ❌ 错误：请在 .env 文件中设置 SILICONFLOW_API_KEY`);
  console.error('示例：SILICONFLOW_API_KEY=sk-your-api-key-here');
  process.exit(1);
}

// 系统提示
const SYSTEM_PROMPT = `
你是一个基于知识储备雄厚的AI助手。
请你遵循用户命令、满足用户需求、解答用户疑问。
    
重要注意事项：
1. 当回答中包含数学公式时，请使用美元格式的LaTeX写法（例如 $E=mc^2$）。
2. 禁止使用[]格式的LaTeX写法。
3. 对于普通的单词、术语或数字，不要使用反引号包裹。
4. 只对真正的代码片段使用反引号或代码块语法。
5. 保持回答自然流畅，避免不必要的格式化。
    
遵循以上规则，提供清晰、专业的回答。`;

// 模型特定系统提示函数
const getModelSpecificPrompt = (modelId) => {
  return SYSTEM_PROMPT;
};

// 获取模型能力描述
const getCurrentModelCapabilities = (modelId) => {
  const capabilities = {
    'deepseek-ai/DeepSeek-V3.2': {
      name: 'DeepSeek-V3.2',
      strength: '代码生成、文本分析、文件处理',
      context: '128K',
      note: '特别适合编程和技术文档分析'
    },
    'deepseek-ai/DeepSeek-OCR': {
      name: 'DeepSeek-OCR',
      strength: '图像文字识别、视觉文档处理',
      context: '128K',
      note: '可以从图片中提取和分析文字内容'
    },
    'Qwen/Qwen3-VL-32B-Instruct': {
      name: 'Qwen3-VL-32B',
      strength: '多模态推理、视觉理解、综合分析',
      context: '32K',
      note: '强大的视觉和文本综合分析能力'
    },
    'Qwen/Qwen2.5-VL-72B-Instruct': {
      name: 'Qwen2.5-VL-72B',
      strength: '视觉语言模型',
      context: '8K',
      note: '支持图像理解和文本分析'
    },
    'Qwen/Qwen2.5-72B-Instruct': {
      name: 'Qwen2.5-72B',
      strength: '纯文本语言模型',
      context: '32K',
      note: '通用文本对话和代码生成'
    }
  };
  
  return capabilities[modelId] || { 
    name: modelId, 
    strength: '通用对话',
    context: '未知',
    note: ''
  };
};


// 支持的文件类型 - 使用对象来映射MIME类型到目录
const FILE_TYPE_MAP = {
  // 图像
  'image/jpeg': 'images',
  'image/jpg': 'images',
  'image/png': 'images',
  'image/gif': 'images',
  'image/webp': 'images',
  // PDF
  'application/pdf': 'pdfs',
  // Word文档 - 添加多种可能的MIME类型
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'others', // .docx
  'application/msword': 'others', // .doc
  'application/vnd.ms-word': 'others', // 备用 .doc
  'application/word': 'others', // 备用 .doc
  // 文本
  'text/plain': 'others',
  'text/markdown': 'others',
  'text/html': 'others',
  // 音频
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  // 其他可能类型
  'application/octet-stream': 'others'
};

const fixMimeType = (fileName, currentMimeType) => {
  const extension = path.extname(fileName).toLowerCase();
  
  const extensionToMimeType = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  
  if (currentMimeType === 'application/octet-stream' || 
      !FILE_TYPE_MAP[currentMimeType] || 
      currentMimeType === 'application/msword') {
    
    const correctMimeType = extensionToMimeType[extension];
    if (correctMimeType) {
      console.log(`Worker ${workerId} 🔄 修复MIME类型: ${fileName} (${currentMimeType} -> ${correctMimeType})`);
      return correctMimeType;
    }
  }
  
  return currentMimeType;
};

// 支持视觉分析的文件类型
const SUPPORTED_VISION_TYPES = {
  'image/jpeg': true,
  'image/jpg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true
};

// 支持文档分析的文件类型
const SUPPORTED_DOCUMENT_TYPES = {
  'application/pdf': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true, // .docx
  'application/msword': true, // .doc
  'text/plain': true,
  'text/markdown': true,
  'text/html': true
};

// 生成安全的文件名
const generateFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName || 'file');
  return `${timestamp}-${randomString}${ext}`;
};

// 文件名编码处理
const decodeFileName = (fileName) => {
  if (!fileName) return '未命名文件';
  
  try {
    if (Buffer.isBuffer(fileName)) {
      return fileName.toString('utf8');
    }
    
    if (typeof fileName === 'string') {
      const buffer = Buffer.from(fileName, 'binary');
      const encodings = ['utf8', 'latin1', 'gbk', 'gb2312'];
      for (const encoding of encodings) {
        try {
          const decoded = iconv.decode(buffer, encoding);
          if (/[\u4e00-\u9fa5]/.test(decoded) && decoded !== fileName) {
            return decoded;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    return String(fileName);
  } catch (error) {
    return String(fileName || '未命名文件');
  }
};

// 然后修改 multer 的 storage 配置：
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // 先修复MIME类型
      file.mimetype = fixMimeType(file.originalname, file.mimetype);
      const mimeType = file.mimetype;
      const fileType = FILE_TYPE_MAP[mimeType] || 'others';
      
      // 用户特定目录
      const userDir = FilePathManager.getUserUploadDir(req.userId); // ./uploads/{userId}/{timestamp}
      await fs.mkdir(userDir, { recursive: true });

      // 子目录按fileType
      const destination = path.join(userDir, fileType);
      await fs.mkdir(destination, { recursive: true });

      cb(null, destination);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const originalName = decodeFileName(file.originalname);
    const safeName = generateFileName(originalName);
    req.decodedFileName = originalName;
    cb(null, safeName);
  }
});

// 改进的 fileFilter 函数
const fileFilter = (req, file, cb) => {
  const mimeType = file.mimetype || '';
  const originalName = file.originalname || '';
  const extension = path.extname(originalName).toLowerCase();
  
  console.log(`Worker ${workerId} 🔍 文件过滤器检查:`, {
    originalName: originalName,
    mimeType: mimeType,
    extension: extension
  });
  
  // 检查MIME类型是否在支持列表中
  if (FILE_TYPE_MAP[mimeType]) {
    cb(null, true);
    return;
  }
  
  // 如果MIME类型是octet-stream或不正确，根据扩展名判断
  if (mimeType === 'application/octet-stream' || !FILE_TYPE_MAP[mimeType]) {
  const supportedExtensions = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',  // 确保这里正确
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  
  if (supportedExtensions[extension]) {
    // 修正MIME类型
    file.mimetype = supportedExtensions[extension];
    console.log(`Worker ${workerId} 🔄 修正MIME类型: ${originalName} (${extension}) -> ${file.mimetype}`);
    cb(null, true);
    return;
  }
}
  
  // 如果扩展名是支持的，即使MIME类型不匹配也允许
  const supportedExtensions = ['.docx', '.doc', '.pdf', '.txt', '.md', '.html', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (supportedExtensions.includes(extension)) {
    console.log(`Worker ${workerId} ⚠️  通过扩展名接受文件: ${originalName} (${extension}), MIME类型: ${mimeType}`);
    cb(null, true);
    return;
  }
  
  console.log(`Worker ${workerId} ❌ 不支持的文件: ${originalName}, MIME类型: ${mimeType}, 扩展名: ${extension}`);
  cb(new Error(`不支持的文件类型: ${originalName} (${mimeType})`), false);
};

// 创建 multer 实例 - 添加并发限制
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE) || 50 * 1024 * 1024,
    files: parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 5
  }
});

// =============== 文件上传接口 ===============
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: '请选择要上传的文件' 
      });
    }

    const file = req.file;
    const originalName = req.decodedFileName || file.originalname || '未命名文件';
    const mimeType = file.mimetype || 'application/octet-stream';
    const fileType = FILE_TYPE_MAP[mimeType] || 'others';
    const relativePath = path.relative(UPLOAD_BASE_DIR, file.path); // {userId}/{timestamp}/{fileType}/{filename}
    const fileUrl = `/uploads/${relativePath}`;
    const fullUrl = `http://localhost:3000${fileUrl}`; // 使用负载均衡端口3000

    console.log(`Worker ${workerId} 📁 文件上传成功:`, {
      名称: originalName,
      大小: formatFileSize(file.size),
      类型: mimeType,
      目录: fileType
    });

    const supportedByVision = !!SUPPORTED_VISION_TYPES[mimeType] || 
                             !!SUPPORTED_DOCUMENT_TYPES[mimeType];

    // 添加到session
    const fileInfo = {
      id: file.filename,
      name: originalName,
      size: file.size,
      type: mimeType,
      category: fileType,
      path: relativePath,
      url: fullUrl,
      deepSeekReady: supportedByVision,
      supportedByDeepSeek: supportedByVision,
      uploadedAt: new Date().toISOString()
    };
    req.session.addFile(fileInfo);
    await sessionManager.setSession(req.userId, req.session);

    res.json({
      success: true,
      file: fileInfo
    });

  } catch (error) {
    console.error(`Worker ${workerId} ❌ 文件上传错误:`, error);
    workerStats.errors++;
    res.status(500).json({ 
      success: false, 
      error: error.message || '文件上传失败' 
    });
  }
});

app.post('/api/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '请选择要上传的文件' 
      });
    }

    const files = req.files.map((file) => {
      const originalName = decodeFileName(file.originalname);
      const mimeType = file.mimetype || 'application/octet-stream';
      const fileType = FILE_TYPE_MAP[mimeType] || 'others';
      const relativePath = path.relative(UPLOAD_BASE_DIR, file.path);
      const fileUrl = `/uploads/${relativePath}`;
      const fullUrl = `http://localhost:3000${fileUrl}`;
      
      const supportedByVision = !!SUPPORTED_VISION_TYPES[mimeType] || 
                               !!SUPPORTED_DOCUMENT_TYPES[mimeType];
      
      const fileInfo = {
        id: file.filename,
        name: originalName,
        size: file.size,
        type: mimeType,
        category: fileType,
        url: fullUrl,
        path: fileUrl,
        deepSeekReady: supportedByVision,
        supportedByDeepSeek: supportedByVision,
        uploadedAt: new Date().toISOString()
      };

      // 添加到session
      req.session.addFile(fileInfo);

      return fileInfo;
    });

    await sessionManager.setSession(req.userId, req.session);

    console.log(`Worker ${workerId} 📁 批量上传 ${files.length} 个文件成功`);

    res.json({
      success: true,
      files: files
    });

  } catch (error) {
    console.error(`Worker ${workerId} ❌ 批量上传错误:`, error);
    workerStats.errors++;
    res.status(500).json({ 
      success: false, 
      error: error.message || '文件上传失败' 
    });
  }
});


// =============== 主要聊天接口 ===============
app.post('/api/chat/stream', async (req, res) => {
  // ============ 新增：客户端连接状态管理 ============
  let isClientConnected = true;
  let axiosResponse = null;
  let timeoutId = null;
  const requestId = crypto.randomBytes(8).toString('hex'); // 请求ID用于追踪
  
  console.log(`Worker ${workerId} 🆔 开始处理请求 ${requestId}`);
  
  // 监听客户端断开连接
  req.on('close', () => {
    console.log(`Worker ${workerId} ❌ 客户端断开连接 [${requestId}]`);
    isClientConnected = false;
    
    // 取消AI API请求
    if (axiosResponse && axiosResponse.destroy) {
      axiosResponse.destroy();
    }
    
    // 清理超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
  
  try {
    const { 
      message, 
      model = 'Qwen/Qwen2.5-72B-Instruct',
      max_tokens = 4000, 
      files = [] 
    } = req.body;

    console.log(`Worker ${workerId} 📨 收到消息 [${requestId}]:`, message?.substring(0, 100));
    console.log(`Worker ${workerId} 📁 附带文件数量 [${requestId}]:`, files?.length || 0);
    console.log(`Worker ${workerId} 🤖 使用模型 [${requestId}]:`, model);
    
    // ============ 保持原来的session管理 ============
    req.session.updateActivity();
    await sessionManager.setSession(req.userId, req.session);
    
    const modelSpecificPrompt = getModelSpecificPrompt(model);
    const modelCapabilities = getCurrentModelCapabilities(model);
    
    console.log(`Worker ${workerId} 📝 模型能力 [${requestId}]:`, {
      name: modelCapabilities.name,
      strength: modelCapabilities.strength,
      context: modelCapabilities.context
    });
    
    const messages = [
      {
        role: 'system',
        content: modelSpecificPrompt
      }
    ];

    // ============ 保持原来的文件处理逻辑 ============
    if (files && files.length > 0) {
      const userContent = [];
      let hasImages = false;
      let hasDocuments = false;
      
      for (const file of files) {
        // 处理图片
        if (file.type && file.type.startsWith('image/')) {
          try {
            console.log(`Worker ${workerId} 🖼️ 处理图片 [${requestId}]:`, file.name);
            
            let filePath = '';
            if (file.path) {
              filePath = path.join(UPLOAD_BASE_DIR, file.path.replace('/uploads/', ''));
            } else if (file.url && file.url.includes('/uploads/')) {
              const urlParts = file.url.split('/uploads/');
              if (urlParts.length > 1) {
                const relativePath = urlParts[1];
                filePath = path.join(UPLOAD_BASE_DIR, relativePath);
              }
            }
            
            if (filePath && (await fs.stat(filePath).catch(() => false))) {
              const imageBuffer = await fs.readFile(filePath);
              const mimeType = file.type || 'image/png';
              
              if (model.includes('DeepSeek-OCR') || model.includes('Qwen3-VL') || model.includes('Qwen2.5-VL')) {
                const base64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
                
                userContent.push({
                  type: 'image_url',
                  image_url: {
                    url: base64
                  }
                });
                
                hasImages = true;
                console.log(`Worker ${workerId} ✅ 图片发送给${model.includes('DeepSeek-OCR') ? 'DeepSeek-OCR' : '视觉模型'} [${requestId}]:`, file.name);
              } else {
                userContent.push({
                  type: 'text',
                  text: `[图片文件: ${file.name}] (当前模型不支持直接分析图片，如需分析请切换至视觉模型)`
                });
              }
            } else {
              console.warn(`Worker ${workerId} ❌ 图片文件不存在 [${requestId}]:`, filePath);
              userContent.push({
                type: 'text',
                text: `[图片: ${file.name} - 文件未找到]`
              });
            }
          } catch (error) {
            console.error(`Worker ${workerId} ❌ 处理图片失败 [${requestId}]:`, file.name, error);
            userContent.push({
              type: 'text',
              text: `[图片: ${file.name} - 处理失败: ${error.message}]`
            });
          }
        }
        // 处理文档
        else if (file.type === 'application/pdf' || 
                 file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                 file.type === 'application/msword' ||
                 file.type === 'text/plain' ||
                 file.type === 'text/markdown' ||
                 file.type === 'text/html') {
          
          try {
            console.log(`Worker ${workerId} 📄 处理文档 [${requestId}]:`, file.name, '类型:', file.type);
            
            let filePath = '';
            if (file.path) {
              filePath = path.join(UPLOAD_BASE_DIR, file.path.replace('/uploads/', ''));
            } else if (file.url && file.url.includes('/uploads/')) {
              const urlParts = file.url.split('/uploads/');
              if (urlParts.length > 1) {
                const relativePath = urlParts[1];
                filePath = path.join(UPLOAD_BASE_DIR, relativePath);
              }
            }
            
            if (filePath && (await fs.stat(filePath).catch(() => false))) {
              const result = await processDocumentFile(filePath, file.type);
              
              if (result.success) {
                let fileContent = result.text;
                let docInfo = `【${file.name} 内容】`;
                
                if (model.includes('DeepSeek-V3.2')) {
                  docInfo += `\n📊 使用DeepSeek-V3.2分析 - 擅长代码和文本分析\n`;
                } else if (model.includes('Qwen3-VL-32B')) {
                  docInfo += `\n🧠 使用Qwen3-VL-32B分析 - 擅长多模态推理\n`;
                }
                
                if (file.type === 'application/pdf' && result.pages) {
                  docInfo += `📄 共 ${result.pages} 页\n\n`;
                } else if ((file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                           file.type === 'application/msword') && result.messages) {
                  docInfo += `📝 Word文档\n\n`;
                }
                
                const maxLength = model.includes('DeepSeek-V3.2') ? 30000 : 15000;
                if (fileContent.length > maxLength) {
                  fileContent = fileContent.substring(0, maxLength) + '\n\n... (内容已截断，完整分析请使用更高上下文模型)';
                }
                
                userContent.push({
                  type: 'text',
                  text: docInfo + fileContent + '\n【文件结束】'
                });
                
                hasDocuments = true;
                console.log(`Worker ${workerId} ✅ ${file.type}提取成功 [${requestId}]，字符数: ${fileContent.length}`);
              } else {
                console.error(`Worker ${workerId} ❌ 文档提取失败 [${requestId}]:`, result.error);
                userContent.push({
                  type: 'text',
                  text: `[文档: ${file.name} - 解析失败: ${result.error}]`
                });
              }
            } else {
              console.warn(`Worker ${workerId} ❌ 文档文件不存在 [${requestId}]:`, filePath);
              userContent.push({
                type: 'text',
                text: `[文档: ${file.name} - 文件未找到]`
              });
            }
          } catch (error) {
            console.error(`Worker ${workerId} ❌ 处理文档失败 [${requestId}]:`, file.name, error);
            userContent.push({
              type: 'text',
              text: `[文档: ${file.name} - 处理失败: ${error.message}]`
            });
          }
        }
        else {
          userContent.push({
            type: 'text',
            text: `[文件: ${file.name} - 类型: ${file.type}]`
          });
        }
      }
      
      if (message) {
        userContent.push({
          type: 'text',
          text: message
        });
      }
      
      if (!hasImages && !hasDocuments && userContent.length === 0) {
        userContent.push({
          type: 'text',
          text: '请分析这些文件内容'
        });
      }
      
      messages.push({
        role: 'user',
        content: userContent
      });
      
      console.log(`Worker ${workerId} 📤 构建消息 [${requestId}]，包含: ${userContent.filter(item => item.type === 'image_url').length}张图片, 
        ${userContent.filter(item => item.type === 'text' && item.text.includes('【')).length}个文档`);
      
    } else {
      let userText = message || '';
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: userText }]
      });
    }

    if (!message && (!files || files.length === 0)) {
      return res.status(400).json({
        error: '消息内容不能为空'
      });
    }

    console.log(`Worker ${workerId} 🚀 发送请求到SiliconFlow API [${requestId}]...`);
    console.log(`Worker ${workerId} 📊 模型配置 [${requestId}]:`, {
      model: model,
      max_tokens: max_tokens,
      context_length: modelCapabilities.context,
      supports_vision: model.includes('DeepSeek-OCR') || model.includes('Qwen3-VL') || model.includes('Qwen2.5-VL')
    });
    
    // ============ 设置响应头 ============
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');

    // ============ 根据模型调整参数 ============
    let adjustedMaxTokens = max_tokens;
    if (model.includes('Qwen2.5-VL-72B')) {
      adjustedMaxTokens = Math.min(max_tokens, 8192);
    } else if (model.includes('DeepSeek-V3.2') || model.includes('DeepSeek-OCR')) {
      adjustedMaxTokens = Math.min(max_tokens, 32768);
    } else if (model.includes('Qwen3-VL-32B')) {
      adjustedMaxTokens = Math.min(max_tokens, 32768);
    }

    // ============ 设置请求超时（2分钟） ============
    timeoutId = setTimeout(() => {
      console.log(`Worker ${workerId} ⏰ 请求超时 [${requestId}]`);
      
      if (isClientConnected && !res.headersSent) {
        try {
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: '请求超时',
            requestId: requestId
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ 
            type: 'done',
            requestId: requestId 
          })}\n\n`);
          res.end();
        } catch (error) {
          console.log(`Worker ${workerId} ⚠️ 超时处理时连接已关闭 [${requestId}]`);
        }
      }
      
      // 取消axios请求
      if (axiosResponse && axiosResponse.destroy) {
        axiosResponse.destroy();
      }
    }, 120000);

    // ============ 检查客户端是否还连接 ============
    if (!isClientConnected) {
      console.log(`Worker ${workerId} ⏹️ 客户端已断开，跳过处理 [${requestId}]`);
      if (timeoutId) clearTimeout(timeoutId);
      return;
    }

    try {
      // 发送模型信息
      if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ 
          type: 'model_info',
          model: modelCapabilities.name,
          strength: modelCapabilities.strength,
          context: modelCapabilities.context,
          requestId: requestId
        })}\n\n`);
      }

      const requestData = {
        model: model,
        messages: messages,
        max_tokens: adjustedMaxTokens,
        stream: true,
        temperature: 0.7
      };

      const response = await axios({
        method: 'post',
        url: `${SILICONFLOW_API_URL}/chat/completions`,
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        data: requestData,
        responseType: 'stream',
        timeout: 120000
      });

      axiosResponse = response.data;
      let buffer = '';
      
      // ============ 处理AI响应流 ============
      response.data.on('data', (chunk) => {
        // 检查客户端是否断开
        if (!isClientConnected) {
          response.data.destroy(); // 客户端断开，停止接收
          return;
        }

        const chunkStr = chunk.toString();
        buffer += chunkStr;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data.trim() === '[DONE]') {
              console.log(`Worker ${workerId} ✅ 收到完成标记 [DONE] [${requestId}]`);
              if (isClientConnected) {
                res.write(`data: ${JSON.stringify({ 
                  type: 'done',
                  requestId: requestId 
                })}\n\n`);
              }
              continue;
            }
          
            try {
              const parsed = JSON.parse(data);

              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                if (isClientConnected) {
                  res.write(`data: ${JSON.stringify({ 
                    type: 'chunk', 
                    content: content,
                    requestId: requestId
                  })}\n\n`);
                }
              }
            } catch (e) {
              console.warn(`Worker ${workerId} 解析JSON失败 [${requestId}]:`, e.message, '原始数据:', data);
            }
          }
        }
      });

      response.data.on('end', () => {
        console.log(`Worker ${workerId} 🔚 流式响应结束 [${requestId}]`);
        
        // 清理超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // 检查客户端是否还连接
        if (isClientConnected && !res.headersSent) {
          try {
            res.write(`data: ${JSON.stringify({ 
              type: 'done',
              requestId: requestId 
            })}\n\n`);
            res.end();
          } catch (error) {
            console.log(`Worker ${workerId} ⚠️ 发送完成事件失败 [${requestId}]: ${error.message}`);
          }
        }
      });

      response.data.on('error', (error) => {
        console.error(`Worker ${workerId} ❌ 流式传输错误 [${requestId}]:`, error.message);
        workerStats.errors++;
        
        // 清理超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        if (isClientConnected && !res.headersSent) {
          try {
            res.write(`data: ${JSON.stringify({ 
              type: 'error', 
              message: '流式传输错误: ' + error.message,
              requestId: requestId
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ 
              type: 'done',
              requestId: requestId 
            })}\n\n`);
            res.end();
          } catch (endError) {
            console.log(`Worker ${workerId} ⚠️ 发送错误事件失败 [${requestId}]: ${endError.message}`);
          }
        }
      });

    } catch (apiError) {
      console.error(`Worker ${workerId} ❌ API请求失败 [${requestId}]:`, apiError.message);
      workerStats.errors++;
      
      // 清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      let errorMessage = 'API请求失败';
      if (apiError.response) {
        console.error(`Worker ${workerId} 响应状态 [${requestId}]:`, apiError.response.status);
        errorMessage = `API错误: ${apiError.response.status}`;
      }
      
      if (isClientConnected && !res.headersSent) {
        try {
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: errorMessage,
            requestId: requestId
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ 
            type: 'done',
            requestId: requestId 
          })}\n\n`);
          res.end();
        } catch (endError) {
          console.log(`Worker ${workerId} ⚠️ API错误响应失败 [${requestId}]: ${endError.message}`);
        }
      }
    }

  } catch (error) {
    console.error(`Worker ${workerId} ❌ 服务器错误 [${requestId}]:`, error.message);
    workerStats.errors++;
    
    // 清理超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (isClientConnected && !res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          message: '服务器错误: ' + error.message,
          requestId: requestId
        })}\n\n`);
        res.write(`data: ${JSON.stringify({ 
          type: 'done',
          requestId: requestId 
        })}\n\n`);
        res.end();
      } catch (endError) {
        console.log(`Worker ${workerId} ⚠️ 服务器错误响应失败 [${requestId}]: ${endError.message}`);
      }
    }
  }
});


// ============== 文本转语音接口 ===============
app.post('/api/tts/generate', async (req, res) => {
  try {
    const { 
      text, 
      // 1. 明确指定模型
      model = 'FunAudioLLM/CosyVoice2-0.5B',
      // 2. 音色参数，前端应从预置列表中选择
      voice = 'FunAudioLLM/CosyVoice2-0.5B:alex', // 提供默认值
      speed = 1.0,
      gain = 0.0, // 音量增益，按文档添加
      response_format = 'mp3'
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: '文本内容不能为空' });
    }

    // 更新session
    req.session.updateActivity();
    await sessionManager.setSession(req.userId, req.session);

    // 3. 构建符合硅基流动API要求的请求体
    const requestData = {
      model: model, // 关键参数
      input: text.trim(), // 注意：文档强调输入内容不要加多余空格
      voice: voice,       // 关键参数，格式为"模型名:音色名"
      speed: speed,
      gain: gain,
      response_format: response_format
      // 未来可扩展：如需情感，可拼接 input: `你能用高兴的情感说吗？<|endofprompt|>${text}`
    };

    console.log(`Worker ${workerId} 🔊 发送TTS请求:`, { model, voice, textLength: text.length });

    const response = await axios.post(SILICONFLOW_TTS_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    });

    const audioBuffer = Buffer.from(response.data);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);

  } catch (error) {
    console.error(`Worker ${workerId} ❌ TTS生成错误:`, error.message);
    workerStats.errors++;
    // ... 保持你原有的、安全的错误处理逻辑 ...
    res.status(500).json({ 
      success: false, 
      error: '语音生成失败',
      details: error.message 
    });
  }
});

// 获取可用的语音模型
app.get('/api/tts/models', (req, res) => {
  res.json({
    success: true,
    models: [
      {
        id: 'FunAudioLLM/CosyVoice2-0.5B',
        name: 'CosyVoice 2 (0.5B)',
        description: '支持多语言、情感控制的流式语音合成模型',
        supports_chinese: true,
        // 将你定义的音色常量PRESET_VOICES中的值映射过来
        voices: [
          'FunAudioLLM/CosyVoice2-0.5B:alex',
          'FunAudioLLM/CosyVoice2-0.5B:brandon', 
          'FunAudioLLM/CosyVoice2-0.5B:anna',
          'FunAudioLLM/CosyVoice2-0.5B:bella',
          'FunAudioLLM/CosyVoice2-0.5B:claire',
          'FunAudioLLM/CosyVoice2-0.5B:diana'
        ]
      }
      // 如果你以后要集成其他模型，可以在这里添加
    ]
  });
});


// =============== 模型列表接口 ===============
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      // 新增的模型
      {
        id: 'deepseek-ai/DeepSeek-V3.2',
        name: 'DeepSeek-V3.2',
        description: '最新版DeepSeek，强大的代码和文本分析能力',
        max_tokens: 32768,
        vision: false,
        supports: ['代码生成', '文本分析', '文件分析', '数学推理'],
        context_length: 128000
      },
      {
        id: 'Qwen/Qwen3-VL-32B-Instruct',
        name: 'Qwen3-VL-32B',
        description: '多模态视觉模型，支持推理和文件分析',
        max_tokens: 32768,
        vision: true,
        supports: ['视觉理解', '复杂推理', '文件分析', '文本分析'],
        context_length: 32000
      },
      // 原有的模型
      {
        id: 'Qwen/Qwen2.5-VL-72B-Instruct',
        name: 'Qwen2.5-VL-72B',
        description: '视觉语言模型',
        max_tokens: 8192,
        vision: true,
        supports: ['图像识别', '文本理解'],
        context_length: 8192
      }
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Qwen Chat API',
    uploadsEnabled: true,
    apiKeyConfigured: !!API_KEY,
    port: workerPort,
    workerId: workerId
  });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, model = 'Qwen/Qwen2.5-72B-Instruct' } = req.body;

    console.log(`Worker ${workerId} 📨 收到消息（非流式）:`, message);

    // 更新session
    req.session.updateActivity();
    await sessionManager.setSession(req.userId, req.session);

    const response = await axios.post(`${SILICONFLOW_API_URL}/chat/completions`, {
      model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: [{ type: 'text', text: message }]
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log(`Worker ${workerId} ✅ 收到非流式响应`);
    
    res.json({
      reply: response.data.choices[0].message.content,
      usage: response.data.usage
    });
  } catch (error) {
    console.error(`Worker ${workerId} ❌ 非流式API错误:`, error.message);
    workerStats.errors++;
    
    res.status(500).json({ 
      error: '调用AI服务失败',
      details: error.message
    });
  }
});

app.get('/api/debug/test-api', async (req, res) => {
  try {
    const response = await axios.post(`${SILICONFLOW_API_URL}/chat/completions`, {
      model: 'Qwen/Qwen2.5-72B-Instruct',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, say hi if you can see this message.' }]
        }
      ],
      max_tokens: 100,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      message: 'API连接正常',
      response: response.data.choices[0].message.content,
      model: response.data.model
    });
  } catch (error) {
    console.error(`Worker ${workerId} ❌ API测试失败:`, error.message);
    workerStats.errors++;
    
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message,
      status: error.response?.status
    });
  }
});

app.get('/api/files', async (req, res) => {
  // 返回当前用户的文件，从session
  res.json({
    success: true,
    count: req.session.files.length,
    files: req.session.files
  });
});

// 启动监听
app.listen(workerPort, () => {
  console.log(`Worker ${workerId} 🚀 后端服务器运行在 http://localhost:${workerPort}`);
  console.log(`Worker ${workerId} 📡 可用端点:`);
  console.log(`   - 健康检查: GET http://localhost:${workerPort}/api/health`);
  console.log(`   - 流式聊天: POST http://localhost:${workerPort}/api/chat/stream`);
  console.log(`   - 普通聊天: POST http://localhost:${workerPort}/api/chat`);
  console.log(`   - 文件上传: POST http://localhost:${workerPort}/api/upload`);
  console.log(`   - 批量上传: POST http://localhost:${workerPort}/api/upload/multiple`);
  console.log(`   - 模型列表: GET http://localhost:${workerPort}/api/models`);
  console.log(`   - 文件列表: GET http://localhost:${workerPort}/api/files`);
  console.log(`Worker ${workerId} 📁 上传目录: ${UPLOAD_BASE_DIR}`);
  console.log(`Worker ${workerId} 🔑 API密钥状态: ${API_KEY ? '已设置 ✓' : '未设置 ✗'}`);
  // 只有在子进程中才发送消息
  if (process.send) {
    process.send({ type: 'ready' });
  } else {
    console.log(`Worker ${workerId} ✅ 已启动（独立模式）`);
  }
});


function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 定期发送统计信息
setInterval(() => {
  if (process.send) {
    const memoryUsage = process.memoryUsage();
    process.send({
      type: 'stats',
      workerId,
      memory: memoryUsage,
      connections: workerStats.activeConnections,
      requests: workerStats.requests,
      errors: workerStats.errors
    });
  }
}, 30000); // 每30秒发送一次

// 新增：定时清理inactive sessions，每小时
setInterval(async () => {
  try {
    const sessions = await redisStore.getAllSessions();
    for (const sessionData of sessions) {
      const session = new UserSession(sessionData.id, sessionData.workerId);
      if (await session.cleanupInactive()) {
        await sessionManager.deleteSession(session.id);
        console.log(`Worker ${workerId} 🧹 清理inactive session: ${session.id}`);
      }
    }
  } catch (error) {
    console.error(`Worker ${workerId} ❌ 清理session错误:`, error);
  }
}, 3600000);

console.log(`🎯 工作进程 ${workerId} 初始化完成，等待请求...`);