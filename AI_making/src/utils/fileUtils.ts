// src/utils/fileUtils.ts

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: string;
  url: string;
  path: string;
  deepSeekReady?: boolean;
  supportedByDeepSeek?: boolean;
  uploadedAt: string;
}

const API_BASE_URL = 'http://localhost:3001/api';

const QWEN_VL_SUPPORTED_TYPES = [
  // 图像格式
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  // 文档格式
  'application/pdf',
  'application/msword',  // 添加 .doc 文件
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // 添加 .docx 文件
  'text/plain', 'text/markdown', 'text/html',
  // 其他（通过描述处理）
  'audio/mpeg', 'audio/wav', 'audio/ogg'
];

// 单文件上传
export const uploadFile = async (file: File): Promise<UploadedFile> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '文件上传失败');
    }

    const data = await response.json();
    console.log('📁 文件上传结果:', data.file);
    return data.file;
  } catch (error) {
    console.error('文件上传错误:', error);
    throw error;
  }
};

// 多文件上传
export const uploadMultipleFiles = async (files: File[]): Promise<UploadedFile[]> => {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await fetch(`${API_BASE_URL}/upload/multiple`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '文件上传失败');
    }

    const data = await response.json();
    return data.files;
  } catch (error) {
    console.error('批量上传错误:', error);
    throw error;
  }
};

// 获取文件信息
export const getFileInfo = async (fileId: string): Promise<UploadedFile> => {
  try {
    const response = await fetch(`${API_BASE_URL}/files/${fileId}`);
    
    if (!response.ok) {
      throw new Error('获取文件信息失败');
    }

    const data = await response.json();
    return data.file;
  } catch (error) {
    console.error('获取文件信息错误:', error);
    throw error;
  }
};

// 检查是否支持多模态分析（重命名函数以更准确）
export const isDeepSeekSupported = (file: File | UploadedFile): boolean => {
  const mimeType = file.type.toLowerCase();
  return QWEN_VL_SUPPORTED_TYPES.includes(mimeType);
};

// 文件类型判断
export const getFileCategory = (file: File | UploadedFile): string => {
  const mimeType = file.type.toLowerCase();
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/msword' || 
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'document';  // 添加文档类型
  }
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('text/')) return 'text';
  
  return 'other';
};

// 文件图标映射 - 添加文档图标
export const getFileIcon = (category: string): string => {
  const iconMap: Record<string, string> = {
    image: '🖼️',
    pdf: '📄',
    document: '📝',  // 添加文档图标
    audio: '🎵',
    video: '🎬',
    text: '📄',
    other: '📎'
  };
  return iconMap[category] || '📎';
};

// 格式化文件大小
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 获取文件预览URL
export const getFilePreviewUrl = (file: UploadedFile | File): string => {
  if (file instanceof File) {
    return URL.createObjectURL(file);
  }
  return file.url;
};

// 检查文件是否有效 - 更新允许的文件类型
export const isValidFile = (file: File): boolean => {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const allowedTypes = [
    // 图像格式
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
    // 文档格式
    'application/pdf',
    'application/msword',  // 添加 .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // 添加 .docx
    'text/plain', 'text/markdown', 'text/html',
    // 音频格式
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'
  ];
  
  if (file.size > maxSize) {
    throw new Error(`文件大小不能超过50MB`);
  }
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`不支持的文件类型: ${file.type}`);
  }
  
  return true;
};

// 获取支持的格式描述
export const getSupportedFormatsDescription = (): string => {
  return `支持格式:
• 图像: JPEG, PNG, GIF, WebP, BMP
• 文档: PDF, Word(.doc/.docx), TXT, MD, HTML
• 音频: MP3, WAV, OGG
最大文件大小: 50MB`;
};