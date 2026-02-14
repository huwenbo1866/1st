// src/components/OptimizedMessageList.tsx
import React, { useMemo, useEffect, useRef } from 'react';
import EnhancedMessageBubble from './EnhancedMessageBubble';
import './OptimizedMessageList.css';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  files?: any[];
}

interface OptimizedMessageListProps {
  messages: Message[];
  isLoading: boolean;
  currentModelName: string;
}

const OptimizedMessageList: React.FC<OptimizedMessageListProps> = ({
  messages,
  isLoading,
  currentModelName
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // 缓存消息，避免不必要的重渲染
  const memoizedMessages = useMemo(() => messages, [messages.length, messages[messages.length - 1]?.id]);
  
  // 滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      // 使用平滑滚动
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages.length, isLoading]);
  
  // 懒加载优化 - 只监听最后几个消息
  useEffect(() => {
    // 清理旧的observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    // 如果消息很多，只监听最近的消息
    const recentMessages = messages.slice(-5);
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // 可以在这里实现图片懒加载等
            const element = entry.target as HTMLElement;
            element.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );
    
    // 观察消息元素
    const messageElements = containerRef.current?.querySelectorAll('.message-bubble-container');
    messageElements?.forEach((el, index) => {
      if (index >= Math.max(0, messageElements.length - 10)) {
        observerRef.current?.observe(el);
      }
    });
    
    return () => {
      observerRef.current?.disconnect();
    };
  }, [messages]);
  
  return (
    <div className="optimized-message-list" ref={containerRef}>
      {memoizedMessages.map((message) => (
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
          <span className="typing-text">AI正在思考中...</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(OptimizedMessageList);