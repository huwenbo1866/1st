// server/utils/fileProcessor.js
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// 支持的文件类型
const SUPPORTED_DOC_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',  // 确保这里不是'word'或其他值
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html'
};

// 提取PDF文本
const extractPDFText = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return {
      success: true,
      text: pdfData.text,
      pages: pdfData.numpages,
      info: pdfData.info
    };
  } catch (error) {
    console.error('PDF提取失败:', error);
    return {
      success: false,
      error: error.message,
      text: ''
    };
  }
};

// 提取Word文档文本
const extractWordText = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ 
      buffer: dataBuffer,
      preserveEmptyParagraphs: true // 保留空段落
    });
    
    // 清理文本
    let text = result.value;
    
    // 移除多余的空行和空格
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();
    
    return {
      success: true,
      text: text,
      messages: result.messages,
      characterCount: text.length
    };
  } catch (error) {
    console.error('Word提取失败:', error);
    
    // 尝试用其他方式读取
    try {
      // 如果是 .doc 文件，尝试其他方式
      if (filePath.toLowerCase().endsWith('.doc')) {
        // .doc 文件可能需要其他库，这里返回提示
        return {
          success: false,
          error: '不支持 .doc 文件格式，请转换为 .docx 格式',
          text: '[不支持 .doc 格式，请转换为 .docx]'
        };
      }
    } catch (innerError) {
      // 忽略内部错误
    }
    
    return {
      success: false,
      error: error.message,
      text: `[Word文档解析失败: ${error.message}]`
    };
  }
};

// 提取纯文本文件
const extractTextFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      success: true,
      text: content
    };
  } catch (error) {
    console.error('文本文件读取失败:', error);
    return {
      success: false,
      error: error.message,
      text: ''
    };
  }
};

// 标准化MIME类型（处理不同浏览器/系统可能的差异）
const normalizeMimeType = (mimeType) => {
  const mimeMap = {
    'application/msword': 'application/msword',
    'application/vnd.ms-word': 'application/msword',
    'application/word': 'application/msword',
    'application/x-msword': 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/xls': 'application/vnd.ms-excel',
    'application/vnd.ms-excel': 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/ppt': 'application/vnd.ms-powerpoint',
    'application/vnd.ms-powerpoint': 'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  
  return mimeMap[mimeType] || mimeType;
};

// 主处理函数
const processDocumentFile = async (filePath, mimeType) => {
  console.log('📄 处理文档文件:', filePath, '类型:', mimeType);
  
  // 标准化MIME类型
  const normalizedMimeType = normalizeMimeType(mimeType);
  const fileType = SUPPORTED_DOC_TYPES[normalizedMimeType];
  
  console.log('🔍 MIME类型处理:', {
    originalMimeType: mimeType,
    normalizedMimeType: normalizedMimeType,
    mappedFileType: fileType
  });
  
  if (!fileType) {
    // 尝试根据文件扩展名判断
    const ext = path.extname(filePath).toLowerCase();
    const extensionMap = {
      '.doc': 'doc',
      '.docx': 'docx',
      '.pdf': 'pdf',
      '.txt': 'txt',
      '.md': 'md',
      '.html': 'html',
      '.htm': 'html'
    };
    
    const extType = extensionMap[ext];
    if (extType) {
      console.log(`⚠️  MIME类型不匹配，根据扩展名 ${ext} 识别为 ${extType}`);
      // 根据扩展名处理
      switch (extType) {
        case 'doc':
        case 'docx':
          return await extractWordText(filePath);
        case 'pdf':
          return await extractPDFText(filePath);
        case 'txt':
        case 'md':
        case 'html':
          return await extractTextFile(filePath);
      }
    }
    
    return {
      success: false,
      error: `不支持的文件类型: ${mimeType} (扩展名: ${ext})`,
      text: ''
    };
  }
  
  try {
    let result;
    
    switch (fileType) {
      case 'pdf':
        console.log('🔄 处理PDF文件');
        result = await extractPDFText(filePath);
        break;
      case 'docx':
      case 'doc':
        console.log('🔄 处理Word文件，类型:', fileType);
        result = await extractWordText(filePath);
        break;
      case 'txt':
      case 'md':
      case 'html':
        console.log('🔄 处理文本文件，类型:', fileType);
        result = await extractTextFile(filePath);
        break;
      default:
        console.error('❌ 未实现的处理类型:', fileType);
        result = {
          success: false,
          error: `未实现的处理类型: ${fileType}`,
          text: ''
        };
    }
    
    if (result.success) {
      // 截断过长的文本（避免token超限）
      const maxLength = 20000;
      if (result.text.length > maxLength) {
        result.text = result.text.substring(0, maxLength) + '\n\n... (内容已截断)';
      }
      
      console.log(`✅ ${fileType.toUpperCase()}提取成功，字符数: ${result.text.length}`);
    } else {
      console.error(`❌ ${fileType.toUpperCase()}提取失败:`, result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('文档处理失败:', error);
    return {
      success: false,
      error: error.message,
      text: ''
    };
  }
};

// 生成文档摘要
const summarizeDocument = (text, maxLength = 1000) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '\n\n... (文档内容较长，已截断显示)';
};

module.exports = {
  processDocumentFile,
  summarizeDocument,
  SUPPORTED_DOC_TYPES,
  normalizeMimeType  // 可选导出，便于调试
};
