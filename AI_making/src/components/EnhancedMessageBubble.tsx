// src/components/EnhancedMessageBubble.tsx - 修复版（底部对齐布局）
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import './EnhancedMessageBubble.css';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  files?: any[];
}

interface EnhancedMessageBubbleProps {
  message: Message;
  currentModelName: string;
}

const EnhancedMessageBubble: React.FC<EnhancedMessageBubbleProps> = ({ 
  message, 
  currentModelName 
}) => {
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const isUser = message.sender === 'user';
  
  const timeString = message.timestamp.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // 预处理内容：主要处理LaTeX公式
  const processedContent = message.content
    .replace(/\\\[/g, '$$')   // \[ → $$
    .replace(/\\\]/g, '$$')   // \] → $$
    .replace(/\\\(/g, '$')    // \( → $
    .replace(/\\\)/g, '$');   // \) → $

  // 判断是否为真正的代码
  const isRealCode = (text: string): boolean => {
    const trimmed = text.trim();
    
    // 如果是空字符串，不是代码
    if (!trimmed) return false;
    
    // 排除常见非代码单词和短语
    const nonCodePatterns = [
      /^[A-Z]+$/,  // 全大写单词
      /^[a-z]+$/,  // 全小写单词
      /^\d+$/,     // 纯数字
      /^[a-zA-Z]+\([^)]*\)$/, // 简单函数调用
      /^(char|int|short|long|float|double|void|bool)$/i, // 类型名
    ];
    
    // 如果匹配任何非代码模式，不是真正的代码
    for (const pattern of nonCodePatterns) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }
    
    // 包含特殊字符的可能是真正的代码
    const codePatterns = /[{}()\[\];=<>+\-*/%&|^~!?:]/;
    return codePatterns.test(text);
  };

  // 处理代码复制
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeBlock(code);
      setIsCopied(true);
      
      setTimeout(() => {
        setIsCopied(false);
        setCopiedCodeBlock(null);
      }, 2000);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  // 复制整个消息
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      console.log('消息已复制');
    } catch (error) {
      console.error('复制消息失败:', error);
    }
  };

  // 渲染代码块的组件
  const CodeBlock = ({ 
    language, 
    value, 
    node, 
    inline, 
    className, 
    ...props 
  }: any) => {
    const [showCopyButton, setShowCopyButton] = useState(false);
    
    if (inline) {
      // 如果是行内代码但不是真正的代码，直接渲染为普通文本
      if (!isRealCode(value)) {
        return <span {...props}>{value}</span>;
      }
      return <code className="inline-code" {...props}>{value}</code>;
    }
    
    // 对于块级代码，如果是简单的文本，不渲染为代码块
    if (!isRealCode(value) && value.split('\n').length <= 2) {
      return (
        <div className="simple-text-block" {...props}>
          {value}
        </div>
      );
    }
    
    return (
      <div 
        className="code-block-wrapper"
        onMouseEnter={() => setShowCopyButton(true)}
        onMouseLeave={() => setShowCopyButton(false)}
      >
        <div className="code-block-header">
          <span className="code-language">{language || 'text'}</span>
          <button 
            className={`copy-button ${isCopied && copiedCodeBlock === value ? 'copied' : ''}`}
            onClick={() => handleCopyCode(value)}
            title="复制代码"
          >
            {isCopied && copiedCodeBlock === value ? '✅ 已复制' : '📋 复制'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language || 'text'}
          PreTag="div"
          className="syntax-highlighter"
          showLineNumbers={value.split('\n').length > 5}
          lineNumberStyle={{ color: '#888', minWidth: '3em' }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    );
  };

  // 如果是用户消息
  if (isUser) {
    return (
      <div className="message-bubble-container user">
        <div className="message-content-wrapper">
          <div className="message-bubble user">
            <div className="message-text user-content">
              {message.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < message.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
            
            {/* 底部容器：时间和操作按钮在同一行 */}
            <div className="message-bottom-row">
              {/* 用户消息操作按钮 */}
              <div className="message-actions">
                <button 
                  className="message-action-btn" 
                  title="复制消息"
                  onClick={() => navigator.clipboard.writeText(message.content)}
                >
                  📋
                </button>
                <button 
                  className="message-action-btn" 
                  title="重新编辑"
                  onClick={() => console.log('编辑消息')}
                >
                  ✏️
                </button>
                <button 
                  className="message-action-btn" 
                  title="删除"
                  onClick={() => console.log('删除消息')}
                >
                  🗑️
                </button>
              </div>
              
              {/* 用户消息时间 - 右对齐 */}
              <div className="message-footer">
                <span className="message-time">{timeString}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI消息的渲染
  return (
    <div className="message-bubble-container assistant">
      <div className="message-content-wrapper">
        <div className="message-bubble assistant">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex]}
            components={{
              // ======== 关键修复：自定义 p 组件 ========
              p: ({ children, node, ...props }: any) => {
                const childrenArray = React.Children.toArray(children);
                
                // 检查是否包含块级元素
                const hasBlockElement = childrenArray.some(child => {
                  if (React.isValidElement(child)) {
                    if (child.type === 'div') return true;

                    // 修复：使用类型安全的访问方式
                    const props = child.props as any; // 使用类型断言
                    const className = props?.className;
                    if (typeof className === 'string') {
                      return (
                        className.includes('code-block-wrapper') || 
                        className.includes('simple-text-block') ||
                        className.includes('table-container') ||
                        className.includes('enhanced-blockquote')
                      );
                    }
                  }
                  return false;
                });
                
                // 如果包含块级元素，使用 div 代替 p
                if (hasBlockElement) {
                  return (
                    <div 
                      className="markdown-paragraph-block" 
                      {...props}
                    >
                      {children}
                    </div>
                  );
                }
                
                return <p className="markdown-paragraph" {...props}>{children}</p>;
              },
              
              // ======== 原有配置 ========
              a: ({ href, children }) => (
                <a 
                  href={href} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="markdown-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {children}
                  <span className="external-link-icon">↗</span>
                </a>
              ),

              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const language = match ? match[1] : 'text';
                const code = String(children).replace(/\n$/, '');
                
                if (inline) {
                  if (!isRealCode(code)) {
                    return <span {...props}>{children}</span>;
                  }
                  return <code className="inline-code" {...props}>{children}</code>;
                }
                
                if (!isRealCode(code) && code.split('\n').length <= 2) {
                  return (
                    <div className="simple-text-block" {...props}>
                      {code}
                    </div>
                  );
                }
                
                return (
                  <CodeBlock 
                    language={language} 
                    value={code} 
                    node={node} 
                    inline={inline} 
                    className={className} 
                    {...props} 
                  />
                );
              },

              blockquote: ({ children }) => (
                <div className="enhanced-blockquote">
                  <div className="blockquote-icon">💡</div>
                  <div className="blockquote-content">{children}</div>
                </div>
              ),

              table: ({ children }) => (
                <div className="table-container">
                  <div className="table-scroll-wrapper">
                    <table className="markdown-table">
                      {children}
                    </table>
                  </div>
                </div>
              ),

              h1: ({ children }) => <h1 className="markdown-h1">{children}</h1>,
              h2: ({ children }) => <h2 className="markdown-h2">{children}</h2>,
              h3: ({ children }) => <h3 className="markdown-h3">{children}</h3>,
              h4: ({ children }) => <h4 className="markdown-h4">{children}</h4>,

              ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
              ol: ({ children }) => <ol className="markdown-list">{children}</ol>,
              li: ({ children }) => <li className="markdown-list-item">{children}</li>,

              img: ({ src, alt }) => (
                <img 
                  src={src} 
                  alt={alt || '图片'} 
                  className="markdown-image"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ),
            }}
          >
            {processedContent}
          </ReactMarkdown>

          {/* 底部容器：时间和操作按钮在同一行 */}
          <div className="message-bottom-row">
            {/* AI消息操作按钮 */}
            <div className="message-actions">
              <button 
                className="message-action-btn" 
                title="复制消息"
                onClick={handleCopyMessage}
              >
                📋
              </button>
              <button 
                className="message-action-btn" 
                title="重新生成"
                onClick={() => console.log('重新生成')}
              >
                🔄
              </button>
              <button 
                className="message-action-btn" 
                title="反馈"
                onClick={() => console.log('反馈')}
              >
                👍
              </button>
            </div>
            
            {/* AI消息时间 - 右对齐 */}
            <div className="message-footer">
              <span className="message-time">{timeString}</span>
              <span className="message-model">{currentModelName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EnhancedMessageBubble);