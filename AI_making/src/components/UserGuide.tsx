// src/components/UserGuide.tsx
import React, { useState, useEffect } from 'react';
import './UserGuide.css';

interface UserGuideProps {
  onDismiss: () => void;
  showOnFirstVisit?: boolean;
}

const UserGuide: React.FC<UserGuideProps> = ({ onDismiss, showOnFirstVisit = true }) => {
  const [isVisible, setIsVisible] = useState(showOnFirstVisit);
  const [currentStep, setCurrentStep] = useState(0);
  
  const steps = [
    {
      title: '欢迎使用AI助手',
      content: '我可以处理图像、PDF、文档等多种文件格式，进行智能分析和对话。',
      icon: '👋'
    },
    {
      title: '上传文件',
      content: '点击输入框旁边的📎按钮或直接将文件拖入聊天区域。',
      icon: '📎'
    },
    {
      title: '选择模型',
      content: '根据任务需求选择合适的AI模型。视觉任务选择VL模型，文本任务选择纯文本模型。',
      icon: '🤖'
    },
    {
      title: '使用建议',
      content: '智能建议会基于您上传的文件和对话上下文提供快捷操作。',
      icon: '💡'
    },
    {
      title: '键盘快捷键',
      content: 'Ctrl+/ 切换建议，Ctrl+K 聚焦输入框，Ctrl+L 清空文件。',
      icon: '⌨️'
    }
  ];
  
  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss();
    localStorage.setItem('userGuideSeen', 'true');
  };
  
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('userGuideSeen');
    if (hasSeenGuide && showOnFirstVisit) {
      setIsVisible(false);
    }
  }, [showOnFirstVisit]);
  
  if (!isVisible) return null;
  
  return (
    <div className="user-guide-overlay">
      <div className="user-guide-modal">
        <div className="guide-header">
          <h2>
            <span className="guide-icon">{steps[currentStep].icon}</span>
            {steps[currentStep].title}
          </h2>
          <button className="close-guide" onClick={handleDismiss}>
            ×
          </button>
        </div>
        
        <div className="guide-content">
          <p>{steps[currentStep].content}</p>
          {currentStep === 4 && (
            <div className="shortcuts-grid">
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>/</kbd>
                <span>切换建议</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>K</kbd>
                <span>聚焦输入</span>
              </div>
              <div className="shortcut-item">
                <kbd>Ctrl</kbd> + <kbd>L</kbd>
                <span>清空文件</span>
              </div>
              <div className="shortcut-item">
                <kbd>Esc</kbd>
                <span>停止生成</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="guide-footer">
          <div className="step-indicators">
            {steps.map((_, index) => (
              <button
                key={index}
                className={`step-indicator ${currentStep === index ? 'active' : ''}`}
                onClick={() => setCurrentStep(index)}
              />
            ))}
          </div>
          
          <div className="guide-actions">
            {currentStep > 0 && (
              <button 
                className="guide-btn secondary"
                onClick={() => setCurrentStep(currentStep - 1)}
              >
                上一步
              </button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <button 
                className="guide-btn primary"
                onClick={() => setCurrentStep(currentStep + 1)}
              >
                下一步
              </button>
            ) : (
              <button 
                className="guide-btn primary"
                onClick={handleDismiss}
              >
                开始使用
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;