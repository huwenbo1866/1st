/* src/components/MarkdownRenderer.tsx */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  isUser?: boolean;
}

// 定义组件props类型
interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

// 自定义li组件props
interface LiProps {
  children?: React.ReactNode;
  node?: any;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  isUser = false 
}) => {
  // 如果是用户消息，不进行复杂的Markdown渲染
  if (isUser) {
    return <div className="user-message-content">{content}</div>;
  }

  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          // 自定义链接组件
          a: ({ href, children }) => {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="markdown-link"
                onClick={(e) => {
                  if (isExternal) {
                    e.stopPropagation();
                  }
                }}
              >
                {children}
                {isExternal && (
                  <span className="external-icon" aria-label="(外部链接)">↗</span>
                )}
              </a>
            );
          },

          // 代码块和行内代码
          code: ({ className, children }: CodeProps) => {
            const language = className?.replace('language-', '') || 'text';
            const isInline = !className || !className.startsWith('language-');
            
            if (isInline) {
              return (
                <code className="inline-code">
                  {children}
                </code>
              );
            }

            return (
              <div className="code-block-container">
                <div className="code-header">
                  <span className="code-language">{language}</span>
                  <button 
                    className="copy-button"
                    onClick={() => navigator.clipboard.writeText(String(children))}
                    title="复制代码"
                  >
                    📋
                  </button>
                </div>
                <pre className="code-block">
                  <code className={className}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },

          // 表格支持
          table: ({ children }) => (
            <div className="table-container">
              <table className="markdown-table">{children}</table>
            </div>
          ),

          // 块引用
          blockquote: ({ children }) => (
            <blockquote className="markdown-quote">
              {children}
            </blockquote>
          ),

          // 列表 - 移除了checked处理
          ul: ({ children }) => (
            <ul className="markdown-list">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="markdown-list">{children}</ol>
          ),

          // 简单li组件，不处理checked
          li: ({ children }: LiProps) => <li>{children}</li>,

          // 图片处理
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

          // 标题
          h1: ({ children }) => <h1 className="markdown-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="markdown-h2">{children}</h2>,
          h3: ({ children }) => <h3 className="markdown-h3">{children}</h3>,
          h4: ({ children }) => <h4 className="markdown-h4">{children}</h4>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;