// src/utils/fileParser.js
const fs = require('fs').promises;
const path = require('path');
const { createWorker } = require('tesseract.js');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

class FileParser {
  constructor() {
    this.supportedTypes = {
      // 文本类型
      'text/plain': 'text',
      'text/markdown': 'text',
      'text/html': 'text',
      'application/json': 'text',
      // 文档类型
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      // 图像类型
      'image/jpeg': 'image',
      'image/jpg': 'image',
      'image/png': 'image',
      'image/gif': 'image',
      'image/webp': 'image',
      // 音频类型（需要额外处理）
      'audio/mpeg': 'audio',
      'audio/wav': 'audio',
      'audio/ogg': 'audio',
      'audio/webm': 'audio',
      'audio/mp4': 'audio'
    };
  }

  // 判断文件类型
  getFileType(mimeType) {
    return this.supportedTypes[mimeType] || 'unknown';
  }

  // 解析文本文件
  async parseText(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content: this.cleanContent(content),
        type: 'text',
        length: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'text'
      };
    }
  }

  // 解析PDF文件
  async parsePDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      
      return {
        success: true,
        content: this.cleanContent(pdfData.text),
        type: 'pdf',
        pages: pdfData.numpages,
        info: pdfData.info,
        length: pdfData.text.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'pdf'
      };
    }
  }

  // 解析Word文档
  async parseWord(filePath) {
    try {
      const result = await mammoth.extractRawText({path: filePath});
      return {
        success: true,
        content: this.cleanContent(result.value),
        type: 'word',
        messages: result.messages,
        length: result.value.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: 'word'
      };
    }
  }

  // 解析图片OCR
  async parseImage(filePath) {
    try {
      const worker = await createWorker();
      
      // 加载语言（中英文）
      await worker.loadLanguage('chi_sim+eng');
      await worker.initialize('chi_sim+eng');
      
      const { data: { text } } = await worker.recognize(filePath);
      await worker.terminate();
      
      return {
        success: true,
        content: this.cleanContent(text),
        type: 'image',
        isOCR: true,
        length: text.length
      };
    } catch (error) {
      console.error('OCR解析错误:', error);
      return {
        success: false,
        error: error.message,
        type: 'image'
      };
    }
  }

  // 通用解析接口
  async parseFile(filePath, mimeType) {
    const fileType = this.getFileType(mimeType);
    
    console.log(`🔍 开始解析文件: ${filePath}, 类型: ${fileType}`);
    
    try {
      switch (fileType) {
        case 'text':
          return await this.parseText(filePath);
        case 'pdf':
          return await this.parsePDF(filePath);
        case 'doc':
        case 'docx':
          return await this.parseWord(filePath);
        case 'image':
          return await this.parseImage(filePath);
        case 'audio':
          // 音频需要额外服务，返回提示
          return {
            success: true,
            content: '[音频文件 - 需要配置语音识别服务]',
            type: 'audio',
            note: '如需语音转文字，请配置Whisper API',
            length: 0
          };
        default:
          return {
            success: false,
            error: `不支持的文件类型: ${mimeType}`,
            type: 'unknown'
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        type: fileType
      };
    }
  }

  // 改进：清理内容函数，更智能地去除多余空行
  cleanContent(content) {
    // 先规范化所有换行符为 \n
    content = content.replace(/\r\n|\r/g, '\n');
    
    // 分割成行，并去除每行首尾空格
    let lines = content.split('\n').map(line => line.trim());
    
    // 过滤掉完全空的行，并处理连续空行
    let cleanedLines = [];
    let inTable = false;  // 标记是否在表格中
    let prevWasEmpty = false;
    
    for (let line of lines) {
      if (line.length === 0) {
        if (!prevWasEmpty && !inTable) {  // 只在非表格中保留单个空行
          cleanedLines.push('');
        }
        prevWasEmpty = true;
        continue;
      }
      
      // 检测表格行（Markdown表格通常以 | 开头/结尾）
      if (line.startsWith('|') && line.endsWith('|')) {
        inTable = true;
      } else if (inTable && !line.startsWith('|')) {
        inTable = false;
      }
      
      cleanedLines.push(line);
      prevWasEmpty = false;
      
      // 在表格行后不添加额外空行
      if (inTable) {
        continue;
      }
    }
    
    // 去除开头和结尾的空行
    while (cleanedLines.length > 0 && cleanedLines[0] === '') {
      cleanedLines.shift();
    }
    while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === '') {
      cleanedLines.pop();
    }
    
    // 用单个 \n 连接行（段落间用 \n\n）
    return cleanedLines.join('\n');
  }
}

module.exports = new FileParser();