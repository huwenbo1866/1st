// src/components/LazyMessageList.tsx
import React, { useRef, useEffect, useMemo, useState } from 'react';
import EnhancedMessageBubble from './EnhancedMessageBubble';
import './LazyMessageList.css';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  files?: any[];
}

interface LazyMessageListProps {
  messages: Message[];
  isLoading: boolean;
  currentModelName: string;  // 需要传递当前模型名称
  visibleRange?: number;
}

const LazyMessageList: React.FC<LazyMessageListProps> = ({ 
  messages, 
  isLoading,
  currentModelName,
  visibleRange = 10 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);
  const [startIndex, setStartIndex] = useState(0);

  // 使用Intersection Observer实现懒加载
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            loadMoreMessages(index);
          }
        });
      },
      { threshold: 0.1 }
    );

    // 观察末尾的哨兵元素
    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => observer.disconnect();
  }, [messages.length]);

  const loadMoreMessages = (fromIndex: number) => {
    const newStart = Math.max(0, fromIndex - visibleRange);
    const end = Math.min(messages.length, newStart + visibleRange * 2);
    
    setStartIndex(newStart);
    setVisibleMessages(messages.slice(newStart, end));
  };

  // 初始加载
  useEffect(() => {
    loadMoreMessages(messages.length - 1);
  }, [messages]);

  // 如果消息数量不多，直接显示全部
  if (messages.length <= visibleRange * 2) {
    return (
      <div className="lazy-message-list" ref={containerRef}>
        {messages.map((message) => (
          <EnhancedMessageBubble
            key={message.id}
            message={message}
            currentModelName={currentModelName}
          />
        ))}
        
        {isLoading && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <span className="typing-text">AI正在思考...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="lazy-message-list" ref={containerRef}>
      {visibleMessages.map((message, index) => (
        <div 
          key={message.id}
          data-index={startIndex + index}
          className="message-container"
        >
          <EnhancedMessageBubble 
            message={message} 
            currentModelName={currentModelName} 
          />
        </div>
      ))}
      
      {/* 加载更多哨兵 */}
      <div 
        ref={sentinelRef} 
        id="sentinel" 
        style={{ 
          height: '1px',
          marginTop: '20px',
          visibility: 'hidden'
        }} 
      />
      
      {isLoading && (
        <div className="typing-indicator">
          <div className="typing-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
          <span className="typing-text">AI正在思考...</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(LazyMessageList);