// src/components/TTSControl.tsx
import React, { useState, useEffect } from 'react';
import './TTSControl.css';
import { ttsService, PRESET_VOICES } from '../utils/ttsUtils';

interface TTSControlProps {
  onToggle?: (enabled: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  onVoiceChange?: (voice: string) => void;
  currentVoice?: string;
}

const TTSControl: React.FC<TTSControlProps> = ({ 
  onToggle, 
  onVolumeChange,
  onVoiceChange,
  currentVoice
}) => {
  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem('tts_enabled');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('tts_volume');
    return saved ? parseFloat(saved) : 0.5;
  });
  
  const [selectedVoice, setSelectedVoice] = useState(() => {
    return currentVoice || localStorage.getItem('tts_voice') || PRESET_VOICES[0].value;
  });
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // 监听父组件传入的currentVoice变化
  useEffect(() => {
    if (currentVoice && currentVoice !== selectedVoice) {
      setSelectedVoice(currentVoice);
    }
  }, [currentVoice, selectedVoice]);
  
  // 初始化TTS服务
  useEffect(() => {
    ttsService.setEnabled(isEnabled);
    ttsService.setVolume(volume);
    ttsService.setCurrentVoice(selectedVoice);
    localStorage.setItem('tts_enabled', JSON.stringify(isEnabled));
    localStorage.setItem('tts_volume', volume.toString());
    localStorage.setItem('tts_voice', selectedVoice);
  }, [isEnabled, volume, selectedVoice]);
  
  // 监听TTS播放状态
  useEffect(() => {
    const checkPlaying = () => {
      setIsPlaying(ttsService.isSpeaking());
    };
    
    const interval = setInterval(checkPlaying, 500);
    return () => clearInterval(interval);
  }, []);
  
  // 处理开关切换
  const handleToggle = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    ttsService.setEnabled(newEnabled);
    
    if (onToggle) {
      onToggle(newEnabled);
    }
  };
  
  // 处理音量变化
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    ttsService.setVolume(newVolume);
    
    if (onVolumeChange) {
      onVolumeChange(newVolume);
    }
  };
  
  // 处理音色变化
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVoice = e.target.value;
    setSelectedVoice(newVoice);
    ttsService.setCurrentVoice(newVoice);
    localStorage.setItem('tts_voice', newVoice);
    
    if (onVoiceChange) {
      onVoiceChange(newVoice);
    }
  };
  
  // 停止播放
  const handleStop = () => {
    ttsService.stop();
  };
  
  // 测试语音
  const handleTest = async () => {
    if (!isEnabled) return;
    await ttsService.speakCompleteText('你好，我是AI助手，这是我的语音测试。欢迎使用文本转语音功能。', {
      voice: selectedVoice,
      speed: 1.0,
      gain: 0.0
    });
  };
  
  return (
    <div className={`tts-control ${isExpanded ? 'expanded' : ''}`}>
      <div className="tts-main-button" onClick={() => setIsExpanded(!isExpanded)}>
        {isPlaying ? (
          <span className="tts-icon playing">🔊</span>
        ) : isEnabled ? (
          <span className="tts-icon enabled">🔊</span>
        ) : (
          <span className="tts-icon disabled">🔈</span>
        )}
      </div>
      
      {isExpanded && (
        <div className="tts-control-panel">
          <div className="tts-header">
            <h4>语音朗读设置</h4>
            <button 
              className="tts-close-btn"
              onClick={() => setIsExpanded(false)}
              title="关闭"
            >
              ×
            </button>
          </div>
          
          <div className="tts-control-group">
            <div className="tts-switch">
              <label>
                <span className="switch-label">AI回答自动朗读</span>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={handleToggle}
                  className="switch-input"
                />
                <span className="switch-slider"></span>
              </label>
            </div>
            
            <div className="tts-voice-control">
              <label className="voice-label">音色选择</label>
              <select 
                value={selectedVoice} 
                onChange={handleVoiceChange}
                className="voice-select"
              >
                {PRESET_VOICES.map(v => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="tts-volume-control">
              <label className="volume-label">
                <span>音量</span>
                <span className="volume-value">{Math.round(volume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>
            
            <div className="tts-buttons">
              <button 
                className="tts-test-btn"
                onClick={handleTest}
                disabled={!isEnabled}
              >
                测试语音
              </button>
              
              {isPlaying && (
                <button 
                  className="tts-stop-btn"
                  onClick={handleStop}
                >
                  停止播放
                </button>
              )}
            </div>
            
            <div className="tts-status">
              <div className="status-indicator">
                <span className={`status-dot ${isEnabled ? 'active' : ''}`}></span>
                <span className="status-text">
                  {isEnabled ? '朗读已启用' : '朗读已关闭'}
                </span>
              </div>
              {isPlaying && (
                <div className="playing-indicator">
                  <div className="sound-wave">
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                  </div>
                  <span>正在朗读...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TTSControl;