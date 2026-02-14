/* src/components/FileUploader.tsx */
import React, { useState, useRef } from 'react';
import { uploadFile, uploadMultipleFiles, isValidFile, getFileIcon, formatFileSize, UploadedFile } from '../../utils/fileUtils';
import './FileUploader.css';

interface FileUploaderProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFilesUploaded,
  maxFiles = 5,
  disabled = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 创建一个获取 accept 属性的函数
  const getAcceptString = () => {
    const extensions = [
      // 图像
      'image/*',
      // 文档
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.md',
      '.html',
      // 音频
      'audio/*'
    ];
    return extensions.join(',');
  };

  // 获取文件分类
  const getFileCategory = (file: File): string => {
    const mimeType = file.type.toLowerCase();
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'application/msword' || 
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'document';
    }
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('text/')) return 'text';
    
    return 'other';
  };

  // 获取文件图标
  const getFileIconByType = (file: File): string => {
    const category = getFileCategory(file);
    
    // 直接返回图标，不依赖 fileUtils 中的 getFileIcon
    const iconMap: Record<string, string> = {
      image: '🖼️',
      pdf: '📄',
      document: '📝',
      audio: '🎵',
      video: '🎬',
      text: '📄',
      other: '📎'
    };
    
    return iconMap[category] || '📎';
  };

  // 处理文件选择
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    validateAndSetFiles(fileList);
  };

  // 验证并设置文件
  const validateAndSetFiles = (files: File[]) => {
    try {
      const validFiles: File[] = [];
      
      files.slice(0, maxFiles).forEach(file => {
        try {
          if (isValidFile(file)) {
            validFiles.push(file);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : '文件验证失败');
        }
      });

      if (validFiles.length > 0) {
        setSelectedFiles(validFiles);
        setError(null);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '文件处理失败');
    }
  };

  // 处理拖放
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    validateAndSetFiles(files);
  };

  // 上传文件
  const handleUpload = async () => {
    if (selectedFiles.length === 0 || disabled) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(10);

    try {
      setUploadProgress(30);
      
      let uploadedFiles: UploadedFile[];
      if (selectedFiles.length === 1) {
        uploadedFiles = [await uploadFile(selectedFiles[0])];
      } else {
        uploadedFiles = await uploadMultipleFiles(selectedFiles);
      }

      setUploadProgress(90);
      onFilesUploaded(uploadedFiles);
      setSelectedFiles([]);
      
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);

    } catch (error) {
      setError(error instanceof Error ? error.message : '上传失败');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 移除文件
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 清空所有文件
  const clearAllFiles = () => {
    setSelectedFiles([]);
    setError(null);
  };

  // 触发文件选择
  const triggerFileInput = () => {
    if (fileInputRef.current && !disabled) {
      fileInputRef.current.click();
    }
  };

  // 获取支持的格式描述
  const getSupportedFormatsDescription = (): string => {
    return `支持图片、PDF、Word(.doc/.docx)、文本文件、音频文件，最多${maxFiles}个，单个最大50MB`;
  };

  return (
    <div className="file-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptString()}
        multiple={maxFiles > 1}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {/* 文件选择区域 */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <div className="upload-content">
          <div className="upload-icon">📎</div>
          <div className="upload-text">
            <div className="upload-title">
              {disabled ? '文件上传已禁用' : '点击或拖放文件到这里'}
            </div>
            <div className="upload-subtitle">
              {getSupportedFormatsDescription()}
            </div>
          </div>
        </div>
      </div>

      {/* 已选择的文件预览 */}
      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <div className="files-header">
            <span className="files-title">
              已选择 {selectedFiles.length} 个文件
            </span>
            <button
              className="clear-files-btn"
              onClick={clearAllFiles}
              disabled={isUploading}
            >
              清空
            </button>
          </div>
          
          <div className="files-list">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <div className="file-icon">
                  {getFileIconByType(file)} {/* 使用新的函数 */}
                </div>
                <div className="file-info">
                  <div className="file-name" title={file.name}>
                    {file.name}
                  </div>
                  <div className="file-meta">
                    <span className="file-size">{formatFileSize(file.size)}</span>
                    <span className="file-type">{getFileCategory(file)}</span>
                  </div>
                </div>
                <button
                  className="file-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  disabled={isUploading}
                  title="移除文件"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="upload-actions">
            <button
              className="upload-btn"
              onClick={handleUpload}
              disabled={isUploading || disabled}
            >
              {isUploading ? (
                <>
                  <span className="upload-spinner"></span>
                  上传中... {uploadProgress}%
                </>
              ) : (
                '开始上传'
              )}
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="upload-error">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {/* 进度条 */}
      {isUploading && (
        <div className="upload-progress">
          <div 
            className="progress-bar" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;