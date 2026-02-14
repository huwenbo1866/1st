// src/components/FilePreview.tsx
import React, { useState, useEffect } from 'react';
import { UploadedFile } from '../utils/fileUtils';
import './FilePreview.css';

interface FilePreviewProps {
  file: UploadedFile;
  onRemove?: () => void;
  compact?: boolean;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove, compact = false }) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [metadata, setMetadata] = useState<{ icon: string; color: string }>({ icon: '📎', color: '#94a3b8' });

  useEffect(() => {
    const loadPreview = async () => {
      setIsLoading(true);
      
      // 根据文件类型设置图标和颜色
      const type = file.type.toLowerCase();
      let icon = '📎';
      let color = '#94a3b8';
      
      if (type.startsWith('image/')) {
        icon = '🖼️';
        color = '#3b82f6';
        setPreviewUrl(file.url);
      } else if (type === 'application/pdf') {
        icon = '📄';
        color = '#ef4444';
        // 生成PDF缩略图
        try {
          const pdfThumbnail = await generatePDFThumbnail(file.url);
          setPreviewUrl(pdfThumbnail);
        } catch (error) {
          setPreviewUrl('');
        }
      } else if (type.includes('word') || type.includes('document')) {
        icon = '📝';
        color = '#2563eb';
      } else if (type.startsWith('audio/')) {
        icon = '🎵';
        color = '#8b5cf6';
      } else if (type.startsWith('text/')) {
        icon = '📋';
        color = '#10b981';
      }
      
      setMetadata({ icon, color });
      setIsLoading(false);
    };
    
    loadPreview();
  }, [file]);

  const generatePDFThumbnail = async (url: string): Promise<string> => {
    // 这里可以集成PDF.js来生成缩略图
    // 暂时返回一个占位图标
    return `data:image/svg+xml,${encodeURIComponent(`
      <svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${metadata.color}" opacity="0.1"/>
        <rect x="10" y="10" width="180" height="260" rx="8" fill="white"/>
        <text x="100" y="120" text-anchor="middle" font-family="Arial" font-size="48" fill="${metadata.color}">📄</text>
        <text x="100" y="180" text-anchor="middle" font-family="Arial" font-size="14" fill="${metadata.color}">PDF</text>
        <text x="100" y="220" text-anchor="middle" font-family="Arial" font-size="12" fill="#64748b">${file.name.substring(0, 15)}...</text>
      </svg>
    `)}`;
  };

  if (compact) {
    return (
      <div className="file-preview-compact">
        <div className="file-icon" style={{ backgroundColor: `${metadata.color}15` }}>
          <span style={{ color: metadata.color }}>{metadata.icon}</span>
        </div>
        <div className="file-info">
          <span className="file-name" title={file.name}>
            {file.name.length > 20 ? `${file.name.substring(0, 17)}...` : file.name}
          </span>
          <span className="file-size">{(file.size / 1024).toFixed(1)}KB</span>
        </div>
        {onRemove && (
          <button className="file-remove-btn" onClick={onRemove}>
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="file-preview">
      <div className="preview-container" style={{ borderColor: `${metadata.color}30` }}>
        {isLoading ? (
          <div className="loading-preview">
            <div className="spinner"></div>
            <span>加载预览...</span>
          </div>
        ) : previewUrl ? (
          <img src={previewUrl} alt={file.name} className="preview-image" />
        ) : (
          <div className="no-preview" style={{ backgroundColor: `${metadata.color}10` }}>
            <div className="file-icon-large" style={{ color: metadata.color }}>
              {metadata.icon}
            </div>
          </div>
        )}
        
        <div className="file-overlay">
          <div className="file-type-badge" style={{ backgroundColor: metadata.color }}>
            {file.type.split('/')[1]?.toUpperCase() || 'FILE'}
          </div>
          {onRemove && (
            <button className="file-remove-btn-overlay" onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>
      
      <div className="file-details">
        <h4 className="file-title" title={file.name}>{file.name}</h4>
        <div className="file-meta">
          <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
          <span className="file-supported">
            {file.supportedByDeepSeek ? '✅ 支持分析' : '⚠️ 部分支持'}
          </span>
        </div>
        {file.supportedByDeepSeek && (
          <div className="file-capabilities">
            <span className="capability-badge">👁️ 视觉</span>
            <span className="capability-badge">📝 文本</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilePreview;