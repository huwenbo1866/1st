// src/components/ChatInterface.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import LazyMessageList from './LazyMessageList';
import InputArea from './InputArea';
import SmartSuggestions from './SmartSuggestions';
import { sendMessageStream } from '../api/chatApi';
import { UploadedFile } from '../utils/fileUtils';
import './ChatInterface.css';
import { initPdfExport } from '../utils/exportPdf';
import TTSControl from './TTSControl';
import { ttsService, PRESET_VOICES } from '../utils/ttsUtils';

// 类型定义
interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  files?: UploadedFile[];
}

// 模型配置
const MODELS = [
  {
    id: 'deepseek-ai/DeepSeek-V3.2',
    name: 'DeepSeek-V3.2',
    description: '强大的代码和文本分析模型',
    max_tokens: 32768,
    vision: false,
    supports: ['代码生成', '文本分析', '文件分析', '数学推理'],
    context_length: 128000
  },
  {
    id: 'Qwen/Qwen3-VL-32B-Instruct',
    name: 'Qwen3-VL-32B',
    description: '多模态视觉模型，支持推理和文件分析',
    max_tokens: 32768,
    vision: true,
    supports: ['视觉理解', '复杂推理', '文件分析', '文本分析'],
    context_length: 32000
  },
  {
    id: 'Qwen/Qwen2.5-VL-72B-Instruct',
    name: 'Qwen2.5-VL-72B',
    description: '视觉语言模型',
    max_tokens: 8192,
    vision: true,
    supports: ['图像识别', 'PDF分析'],
    context_length: 8192
  }
];

const ChatInterface: React.FC = () => {
  // 基础聊天状态
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      content: '你好！我是AI助手，基于多模态模型。我可以分析你上传的图片、PDF等文件，并进行视觉理解。',
      sender: 'assistant',
      timestamp: new Date()
    }
  ]);
  
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  // TTS状态
  const [isTTSEnabled, setIsTTSEnabled] = useState(() => {
    const saved = localStorage.getItem('tts_enabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tts_volume');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [currentVoice, setCurrentVoice] = useState(() => {
    const saved = localStorage.getItem('tts_voice');
    return saved || PRESET_VOICES[0].value;
  });
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // TTS状态监听
  useEffect(() => {
    ttsService.setEnabled(isTTSEnabled);
    localStorage.setItem('tts_enabled', JSON.stringify(isTTSEnabled));
    if (!isTTSEnabled) {
      ttsService.stop();
    }
  }, [isTTSEnabled]);

  useEffect(() => {
    ttsService.setVolume(volume);
    localStorage.setItem('tts_volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    ttsService.setCurrentVoice(currentVoice);
    localStorage.setItem('tts_voice', currentVoice);
  }, [currentVoice]);

  // PDF导出初始化
  useEffect(() => {
    const initPdfExportFunc = async () => {
      try {
        const exportModule = await import('../utils/exportPdf');
        const { initPdfExport } = exportModule;
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const pdfButton = await initPdfExport({
          selector: '.chat-messages-container',
          messageSelector: '.message-bubble-container',
          filenamePrefix: 'AI对话记录',
          buttonText: '📥 导出PDF',
          parentSelector: '.chat-header .header-right',
          defaultMargin: 15,
          defaultScale: 2,
          buttonId: 'chat-pdf-export-btn'
        });
        
        if (pdfButton) {
          Object.assign(pdfButton.style, {
            marginLeft: '8px',
            padding: '6px 12px',
            fontSize: '13px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            cursor: 'pointer'
          });
          
          pdfButton.addEventListener('mouseenter', () => {
            pdfButton.style.background = 'linear-gradient(135deg, #059669, #047857)';
          });
          
          pdfButton.addEventListener('mouseleave', () => {
            pdfButton.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          });
        }
      } catch (error) {
        console.error('初始化PDF导出失败:', error);
      }
    };
    
    initPdfExportFunc();
    
    return () => {
      const btn = document.getElementById('chat-pdf-export-btn');
      if (btn) btn.remove();
    };
  }, []);

  // 获取当前模型
  const getCurrentModel = useCallback(() => {
    return MODELS.find(model => model.id === selectedModel) || MODELS[0];
  }, [selectedModel]);

  // 停止生成
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    // 停止TTS播放
    ttsService.stop();
  }, []);

  // 发送消息
  const handleSendMessage = async (content: string, files?: UploadedFile[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || isLoading) return;

    if (isLoading) {
      stopGeneration();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 停止当前TTS朗读
    ttsService.stop();

    // 添加用户消息
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content,
      sender: 'user',
      timestamp: new Date(),
      files: files || []
    };
    
    setMessages((prev) => [...prev, userMessage]);
    if (files && files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...files]);
    }

    setIsLoading(true);

    // 创建AI消息占位符
    const aiMessageId = `ai-${Date.now()}`;
    
    const aiMessage: Message = {
      id: aiMessageId,
      content: '',
      sender: 'assistant',
      timestamp: new Date()
    };
    
    setMessages((prev) => [...prev, aiMessage]);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
        
      let streamedContent = '';
        
      await sendMessageStream(
        content,
        files || [],
        selectedModel,
        (chunk) => {
          streamedContent += chunk;
          setMessages((prev) => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: streamedContent }
              : msg
          ));
        },
        () => {
          console.log('✅ 流式传输完成');
          setIsLoading(false);
          abortControllerRef.current = null;
          
          // AI回答完成后，一次性发送给TTS
          if (isTTSEnabled && streamedContent.trim()) {
            console.log('🔊 AI回答完成，准备发送给TTS');
            
            // 延迟500ms后开始TTS，确保UI已更新
            setTimeout(() => {
              ttsService.speakCompleteText(streamedContent, {
                voice: currentVoice,
                speed: 1.0,
                gain: 0.0
              }).then(() => {
                console.log('✅ TTS朗读完成');
              }).catch(error => {
                console.error('TTS朗读失败:', error);
              });
            }, 500);
          }
        },
        (error) => {
          console.error('流式传输错误:', error);
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        controller
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('请求已取消');
        setMessages((prev) => prev.map(msg => 
          msg.id === aiMessageId && msg.content === ''
            ? { ...msg, content: '❌ 生成已中断' }
            : msg
        ));
      } else {
        console.error('发送消息失败:', error);
        setMessages((prev) => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, content: `❌ 请求失败: ${error.message}` }
            : msg
        ));
      }
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // 处理智能建议选择
  const handleSuggestionSelect = (suggestion: string) => {
    handleSendMessage(suggestion, attachedFiles);
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        if (!isLoading) setShowSuggestions((prev) => !prev);
      }
      
      if (e.key === 'Escape' && isLoading) {
        e.preventDefault();
        stopGeneration();
      }
      
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setAttachedFiles([]);
      }

      if (e.ctrlKey && e.altKey && e.key === 't') {
        e.preventDefault();
        setIsTTSEnabled((prev: boolean) => !prev);
      }
      
      if (e.ctrlKey && e.altKey && e.key === 's') {
        e.preventDefault();
        ttsService.stop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration]);

  // 清空聊天
  const handleClearChat = () => {
    if (isLoading) stopGeneration();
    ttsService.stop();

    setMessages([{
      id: 'cleared',
      content: '对话已清空。有什么可以帮你的吗？',
      sender: 'assistant',
      timestamp: new Date()
    }]);

    setAttachedFiles([]);
  };

  // 切换模型
  const handleModelChange = (modelId: string) => {
    if (isLoading) stopGeneration();
    ttsService.stop();

    const newModel = MODELS.find(m => m.id === modelId);
    if (newModel) {
      setSelectedModel(modelId);
      console.log(`切换到模型: ${newModel.name}`);
    }
  };

  // 处理文件变化
  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setAttachedFiles(newFiles);
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="header-left">
          <h1>🤖 多模态AI助手</h1>
          <div className="model-controls">
            <select 
              className="model-select"
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={isLoading}
            >
              {MODELS.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} {model.vision ? '(多模态)' : '(纯文本)'}
                </option>
              ))}
            </select>
            
            <div className="status-badges">
              {getCurrentModel().vision && (
                <span className="status-badge vision">👁️ 视觉支持</span>
              )}
            </div>
            
            {isLoading && (
              <button 
                className="stop-button"
                onClick={stopGeneration}
                title="停止生成 (Esc)"
              >
                ⏹️ 停止生成
              </button>
            )}
          </div>
        </div>
        
        <div className="header-right">
          {/* TTS控制组件 */}
          <div className="tts-control-wrapper">
            <TTSControl 
              onToggle={setIsTTSEnabled}
              onVolumeChange={setVolume}
              onVoiceChange={setCurrentVoice}
              currentVoice={currentVoice}
            />
          </div>
          
          <button 
            className="clear-button suggestions-button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            disabled={isLoading}
            title={showSuggestions ? '隐藏智能建议 (Ctrl+/)' : '显示智能建议 (Ctrl+/)'}
          >
            {showSuggestions ? '💡 隐藏建议' : '💡 显示建议'}
          </button>
          
          <button 
            className="clear-button"
            onClick={handleClearChat}
            disabled={isLoading}
            title="清空对话"
          >
            清空对话
          </button>
        </div>
      </div>

      <div className="chat-messages-container">
        <LazyMessageList
          messages={messages}
          isLoading={isLoading}
          currentModelName={getCurrentModel().name}
          visibleRange={8}
        />
        
        {showSuggestions && messages.length > 0 && !isLoading && (
          <SmartSuggestions
            context={messages[messages.length - 1]?.content || ''}
            files={attachedFiles}
            onSelect={handleSuggestionSelect}
            disabled={isLoading}
          />
        )}
        
        {attachedFiles.length > 0 && (
          <div className="file-previews-section">
            <div className="section-header">
              <h3>📁 已附加文件</h3>
              <button 
                className="clear-files-btn"
                onClick={() => setAttachedFiles([])}
                disabled={isLoading}
              >
                清除全部
              </button>
            </div>
            <div className="file-previews-grid">
              <div className="file-previews-hint">
                <span>📎 {attachedFiles.length} 个文件已附加</span>
                <span className="file-types">
                  {Array.from(new Set(attachedFiles.map(f => f.type.split('/')[0]))).join(', ')}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <InputArea 
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onStopGeneration={stopGeneration}
        initialFiles={attachedFiles}
        onFilesChange={handleFilesChange}
      />
    </div>
  );
};

export default ChatInterface;