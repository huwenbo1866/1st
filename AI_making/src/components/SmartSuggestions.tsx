// src/components/SmartSuggestions.tsx
import React, { useState, useEffect } from 'react';
import { UploadedFile } from '../utils/fileUtils';
import './SmartSuggestions.css';

interface SmartSuggestion {
  id: string;
  text: string;
  icon: string;
  action: () => void;
  color: string;
  category: 'analysis' | 'summary' | 'question' | 'create';
}

interface SmartSuggestionsProps {
  context: string;
  files: UploadedFile[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({ 
  context, 
  files, 
  onSelect,
  disabled = false 
}) => {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const generateSuggestions = () => {
      const newSuggestions: SmartSuggestion[] = [];
      
      // 基于文件类型的建议
      if (files.length > 0) {
        const fileTypes = files.map(f => f.type.toLowerCase());
        const hasImages = fileTypes.some(t => t.startsWith('image/'));
        const hasPDFs = fileTypes.includes('application/pdf');
        const hasDocs = fileTypes.some(t => t.includes('word') || t.includes('document'));
        const hasText = fileTypes.some(t => t.startsWith('text/'));
        
        if (hasImages) {
          newSuggestions.push({
            id: 'analyze-images',
            text: '分析图片内容',
            icon: '🔍',
            action: () => onSelect('请详细分析这些图片中的内容，包括文字、物体和场景。'),
            color: '#3b82f6',
            category: 'analysis'
          });
          
          newSuggestions.push({
            id: 'extract-text',
            text: '提取图片文字',
            icon: '📝',
            action: () => onSelect('请提取这些图片中的所有文字信息，并保持原文格式。'),
            color: '#10b981',
            category: 'analysis'
          });
        }
        
        if (hasPDFs) {
          newSuggestions.push({
            id: 'summarize-pdf',
            text: '总结PDF要点',
            icon: '📊',
            action: () => onSelect('请总结这个PDF文档的核心内容和主要观点。'),
            color: '#ef4444',
            category: 'summary'
          });
          
          newSuggestions.push({
            id: 'extract-pdf-text',
            text: '提取PDF文字',
            icon: '📄',
            action: () => onSelect('请提取这个PDF文档中的所有文字内容。'),
            color: '#8b5cf6',
            category: 'analysis'
          });
        }
        
        if (hasDocs) {
          newSuggestions.push({
            id: 'summarize-doc',
            text: '总结文档内容',
            icon: '📋',
            action: () => onSelect('请总结这个文档的主要内容和结构。'),
            color: '#2563eb',
            category: 'summary'
          });
          
          newSuggestions.push({
            id: 'outline-doc',
            text: '生成大纲',
            icon: '📑',
            action: () => onSelect('请为这个文档生成详细的大纲结构。'),
            color: '#7c3aed',
            category: 'create'
          });
        }
        
        if (hasText) {
          newSuggestions.push({
            id: 'summarize-text',
            text: '总结文本内容',
            icon: '📝',
            action: () => onSelect('请用一句话总结这个文本的核心内容。'),
            color: '#059669',
            category: 'summary'
          });
          
          newSuggestions.push({
            id: 'translate-text',
            text: '翻译文本',
            icon: '🌐',
            action: () => onSelect('请将这段文本翻译成英文。'),
            color: '#6366f1',
            category: 'create'
          });
        }
        
        // 多文件处理建议
        if (files.length > 1) {
          newSuggestions.push({
            id: 'compare-files',
            text: '对比文件内容',
            icon: '⚖️',
            action: () => onSelect('请对比分析这些文件之间的关联和差异。'),
            color: '#f59e0b',
            category: 'analysis'
          });
          
          newSuggestions.push({
            id: 'combine-files',
            text: '合并文件内容',
            icon: '🔄',
            action: () => onSelect('请将这些文件的内容合并为一个完整的分析报告。'),
            color: '#06b6d4',
            category: 'create'
          });
        }
      }
      
      // 基于上下文的建议
      if (context.trim()) {
        newSuggestions.push({
          id: 'expand-topic',
          text: '扩展这个话题',
          icon: '💡',
          action: () => onSelect(`请详细解释：${context}`),
          color: '#8b5cf6',
          category: 'analysis'
        });
        
        newSuggestions.push({
          id: 'ask-question',
          text: '提出相关问题',
          icon: '❓',
          action: () => onSelect(`关于"${context}"，我应该了解哪些问题？`),
          color: '#ec4899',
          category: 'question'
        });
        
        newSuggestions.push({
          id: 'create-example',
          text: '举例说明',
          icon: '✨',
          action: () => onSelect(`请为"${context}"提供具体的例子说明。`),
          color: '#14b8a6',
          category: 'create'
        });
      }
      
      // 通用建议
      newSuggestions.push({
        id: 'create-summary',
        text: '生成简洁总结',
        icon: '📝',
        action: () => onSelect('请用简洁的语言总结上述内容。'),
        color: '#06b6d4',
        category: 'summary'
      });
      
      newSuggestions.push({
        id: 'create-mindmap',
        text: '生成思维导图',
        icon: '🧠',
        action: () => onSelect('请用Markdown格式生成一个思维导图。'),
        color: '#f97316',
        category: 'create'
      });
      
      setSuggestions(newSuggestions);
    };
    
    generateSuggestions();
  }, [context, files, onSelect]);

  if (suggestions.length === 0 || disabled) return null;

  const displayedSuggestions = expanded ? suggestions : suggestions.slice(0, 4);

  return (
    <div className="smart-suggestions">
      <div className="suggestions-header">
        <h4 className="suggestions-title">
          <span className="suggestions-icon">💡</span>
          智能建议
          <span className="suggestions-count">{suggestions.length} 个</span>
        </h4>
        {suggestions.length > 4 && (
          <button 
            className="expand-button"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        )}
      </div>
      
      <div className="suggestions-grid">
        {displayedSuggestions.map(suggestion => (
          <button
            key={suggestion.id}
            className="suggestion-card"
            onClick={suggestion.action}
            disabled={disabled}
            style={{ 
              '--suggestion-color': suggestion.color 
            } as React.CSSProperties}
          >
            <div className="suggestion-icon" style={{ backgroundColor: `${suggestion.color}20` }}>
              <span style={{ color: suggestion.color }}>{suggestion.icon}</span>
            </div>
            <span className="suggestion-text">{suggestion.text}</span>
          </button>
        ))}
      </div>
      
      {expanded && suggestions.length > 0 && (
        <div className="suggestions-categories">
          <div className="category-pill" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            🔍 分析类: {suggestions.filter(s => s.category === 'analysis').length}
          </div>
          <div className="category-pill" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            📊 总结类: {suggestions.filter(s => s.category === 'summary').length}
          </div>
          <div className="category-pill" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            ✨ 创作类: {suggestions.filter(s => s.category === 'create').length}
          </div>
          <div className="category-pill" style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)' }}>
            ❓ 提问类: {suggestions.filter(s => s.category === 'question').length}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartSuggestions;