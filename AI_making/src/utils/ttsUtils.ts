// src/utils/ttsUtils.ts
const API_BASE_URL = 'http://localhost:3001/api';

export interface TTSOptions {
  model?: string;
  voice?: string;
  speed?: number;
  gain?: number;
}

export interface TTSModel {
  id: string;
  name: string;
  description: string;
  supports_chinese: boolean;
  voices: string[];
}

// 预置音色
export const PRESET_VOICES = [
  { value: 'FunAudioLLM/CosyVoice2-0.5B:alex', label: 'Alex (男生)' },
  { value: 'FunAudioLLM/CosyVoice2-0.5B:brandon', label: 'Brandon (男生)' },
  { value: 'FunAudioLLM/CosyVoice2-0.5B:anna', label: 'Anna (沉稳女声)' },
  { value: 'FunAudioLLM/CosyVoice2-0.5B:bella', label: 'Bella (激情女声)' },
  { value: 'FunAudioLLM/CosyVoice2-0.5B:claire', label: 'Claire (温柔女声)' },
  { value: 'FunAudioLLM/CosyVoice2-0.5B:diana', label: 'Diana (欢快女声)' },
];

// 增强的文本清理函数 - 只保留中文和基本标点
export const cleanTextForTTS = (text: string): string => {
  if (!text || !text.trim()) return '';
  
  let cleaned = text;
  
  // 1. 移除所有代码块
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');
  
  // 2. 移除LaTeX公式
  cleaned = cleaned.replace(/\$[^$]+\$/g, '');
  
  // 3. 移除URL链接
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
  
  // 4. 移除Markdown链接和图片
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '');
  cleaned = cleaned.replace(/\[.*?\]\(.*?\)/g, '');
  
  // 5. 移除HTML标签
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // 6. 移除特殊标记
  cleaned = cleaned.replace(/[#*_~`^]/g, '');
  
  // 7. 移除所有非中文字符，只保留中文和中文标点
  // 保留：中文字符、中文标点、空格、换行
  cleaned = cleaned.replace(/[^\u4e00-\u9fa5，。！？；：、\s]/g, '');
  
  // 8. 清理多余的空格和换行
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  cleaned = cleaned.replace(/^\s+|\s+$/g, '');
  
  // 9. 移除空行
  const lines = cleaned.split('\n');
  cleaned = lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  
  // 10. 限制最大长度（TTS API可能有长度限制）
  const MAX_LENGTH = 2000;
  if (cleaned.length > MAX_LENGTH) {
    cleaned = cleaned.substring(0, MAX_LENGTH) + '...';
  }
  
  return cleaned;
};

class TTSService {
  private audioElement: HTMLAudioElement | null = null;
  private isPlaying = false;
  private currentVolume = 0.5;
  private isEnabled = false;
  private abortController: AbortController | null = null;
  private currentVoice = PRESET_VOICES[0].value;
  
  constructor() {
    this.initializeAudio();
  }
  
  private initializeAudio() {
    if (typeof window !== 'undefined') {
      this.audioElement = new Audio();
      this.audioElement.volume = this.currentVolume;
      
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
      });
      
      this.audioElement.addEventListener('error', (e) => {
        console.error('音频播放错误:', e);
        this.isPlaying = false;
      });
    }
  }
  
  // 启用/禁用TTS
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    console.log(`🔊 TTS ${enabled ? '启用' : '禁用'}`);
    if (!enabled) {
      this.stop();
    }
  }
  
  // 判断TTS是否启用
  isTTSEnabled(): boolean {
    return this.isEnabled;
  }
  
  // 设置音量
  setVolume(volume: number) {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.audioElement) {
      this.audioElement.volume = this.currentVolume;
    }
  }
  
  // 设置当前音色
  setCurrentVoice(voice: string) {
    this.currentVoice = voice;
  }
  
  // 获取当前音量
  getVolume(): number {
    return this.currentVolume;
  }
  
  // 一次性朗读完整文本（AI回答完成后调用）
  async speakCompleteText(text: string, options: TTSOptions = {}) {
    if (!this.isEnabled || !text.trim()) {
      console.log('TTS未启用或文本为空，跳过朗读');
      return;
    }
    
    // 清理文本 - 一次性处理完整文本
    const cleanText = cleanTextForTTS(text);
    if (!cleanText) {
      console.log('文本清理后为空，跳过朗读');
      return;
    }
    
    console.log('🔊 准备朗读完整文本');
    console.log('📝 原始文本长度:', text.length);
    console.log('🧹 清理后文本长度:', cleanText.length);
    console.log('📝 清理后文本预览:', cleanText.substring(0, 200) + (cleanText.length > 200 ? '...' : ''));
    
    // 停止当前播放
    this.stop();
    
    // 一次性发送整个处理后的文本给TTS
    await this.sendTTSRequest(cleanText, options);
  }
  
  // 发送TTS请求（一次性处理）
  private async sendTTSRequest(text: string, options: TTSOptions = {}) {
    if (!text.trim()) return;
    
    try {
      // 取消之前的请求
      if (this.abortController) {
        this.abortController.abort();
      }
      
      // 创建新的AbortController
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      
      const requestBody = {
        text: text,
        model: 'FunAudioLLM/CosyVoice2-0.5B',
        voice: options.voice || this.currentVoice,
        speed: options.speed || 1.0,
        gain: options.gain || 0.0
      };
      
      console.log('🔊 发送TTS请求（一次性）:', { 
        textLength: text.length,
        voice: requestBody.voice
      });
      
      // 发送一次性请求
      const response = await fetch(`${API_BASE_URL}/tts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS请求失败 (${response.status}): ${errorText}`);
      }
      
      // 获取音频数据
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (this.audioElement) {
        this.audioElement.src = audioUrl;
        this.isPlaying = true;
        
        try {
          await this.audioElement.play();
          console.log('✅ TTS音频开始播放');
          
          // 等待播放完成
          await new Promise((resolve, reject) => {
            if (!this.audioElement) return reject(new Error('Audio element not found'));
            
            const onEnded = () => {
              this.audioElement?.removeEventListener('ended', onEnded);
              this.audioElement?.removeEventListener('error', onError);
              URL.revokeObjectURL(audioUrl);
              resolve(true);
            };
            
            const onError = (e: Event) => {
              this.audioElement?.removeEventListener('ended', onEnded);
              this.audioElement?.removeEventListener('error', onError);
              URL.revokeObjectURL(audioUrl);
              reject(new Error('音频播放失败'));
            };
            
            this.audioElement.addEventListener('ended', onEnded);
            this.audioElement.addEventListener('error', onError);
          });
          
          console.log('✅ TTS音频播放完成');
        } catch (error) {
          console.error('音频播放失败:', error);
          URL.revokeObjectURL(audioUrl);
          throw error;
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('TTS请求被取消');
      } else {
        console.error('语音合成失败:', error.message);
      }
      this.isPlaying = false;
    }
  }
  
  // 停止所有朗读
  stop() {
    if (this.audioElement && this.isPlaying) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    this.isPlaying = false;
  }
  
  // 判断是否正在朗读
  isSpeaking(): boolean {
    return this.isPlaying;
  }
}

// 导出单例
export const ttsService = new TTSService();