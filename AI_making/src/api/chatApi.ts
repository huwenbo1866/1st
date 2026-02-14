// src/api/chatApi.ts

import { v4 as uuidv4 } from 'uuid'; // 新增：用于生成userId

const API_BASE_URL = 'http://localhost:3001/api';

// 流式API调用（Qwen-VL专用）
export const sendMessageStream = async (
  message: string,
  files: any[] = [],
  model: string = 'Qwen/Qwen2.5-VL-72B-Instruct',
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: string) => void,
  abortController?: AbortController
) => {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('userId', userId);
  }

  try {
    const requestData = {
      message,
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        url: file.url,
        deepSeekReady: file.deepSeekReady,
        supportedByDeepSeek: file.supportedByDeepSeek
      })),
      model,
      max_tokens: 4000
    };

    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,  // 新增：发送userId
      },
      body: JSON.stringify(requestData),
      signal: abortController?.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
    }

    // 如果后端返回新userId，更新localStorage
    const newUserId = response.headers.get('X-User-ID');
    if (newUserId && newUserId !== userId) {
      localStorage.setItem('userId', newUserId);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    if (!reader) {
      onError('无法读取响应流');
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                processLine(line.slice(6), onChunk, onError, onComplete);
              }
            }
          }
          onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            processLine(line.slice(6), onChunk, onError, onComplete);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      console.error('Stream reading error:', error);
      onError('读取数据流时出错');
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error('Stream Error:', error);
    onError(error instanceof Error ? error.message : '网络连接失败');
  }
};

// 处理SSE数据行
function processLine(
  dataStr: string,
  onChunk: (chunk: string) => void,
  onError: (error: string) => void,
  onComplete: () => void
) {
  if (dataStr.trim() === '') return;
  
  if (dataStr === '[DONE]') {
    console.log('✅ 前端收到完成标记');
    onComplete();
    return;
  }

  try {
    const data = JSON.parse(dataStr);
    
    if (data.type === 'chunk' && data.content) {
      onChunk(data.content);
    } else if (data.type === 'error') {
      onError(data.message || '未知错误');
    } else if (data.type === 'done') {
      console.log('✅ 收到完成事件');
      onComplete();
    }
  } catch (e) {
    console.warn('Failed to parse SSE data:', dataStr, e);
  }
}