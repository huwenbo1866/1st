// src/utils/exportPdf.ts
export interface ExportPdfOptions {
  selector?: string;
  messageSelector?: string;
  filenamePrefix?: string;
  buttonText?: string;
  parentSelector?: string;
  defaultMargin?: number;
  defaultScale?: number;
  buttonId?: string;
}

// 全局存储选中的消息索引
const selectedMessageIndices = new Set<number>();

function waitForStableDOM(target: Element, stableMs = 500, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer: any = null;
    let checkTimeout: any = null;
    
    const obs = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        obs.disconnect();
        if (checkTimeout) clearInterval(checkTimeout);
        resolve();
      }, stableMs);
    });
    
    obs.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });

    timer = setTimeout(() => {
      obs.disconnect();
      if (checkTimeout) clearInterval(checkTimeout);
      resolve();
    }, Math.min(stableMs, 300));

    checkTimeout = setInterval(() => {
      if (Date.now() - start > timeout) {
        clearInterval(checkTimeout);
        obs.disconnect();
        reject(new Error('等待 DOM 稳定超时'));
      }
    }, 200);
  });
}

function createStyles() {
  const id = 'pdf-export-styles';
  if (document.getElementById(id)) return;
  
  const s = document.createElement('style');
  s.id = id;
  s.innerHTML = `
    /* 消息选中样式 */
    .pdf-export-selected { 
      outline: 3px solid rgba(37,99,235,0.6); 
      position: relative; 
      box-shadow: 0 0 0 1px #2563eb;
    }
    .pdf-export-badge { 
      position: absolute; 
      left: 6px; 
      top: 6px; 
      background: #2563eb; 
      color: #fff; 
      font-size: 12px; 
      padding: 2px 6px; 
      border-radius: 4px; 
      z-index: 50;
    }
    
    /* 消息选择模式样式 */
    .message-selectable {
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      position: relative;
    }
    
    .message-selectable:hover {
      background-color: rgba(37, 99, 235, 0.05) !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1) !important;
    }
    
    .message-selectable-active {
      outline: 3px solid rgba(37, 99, 235, 0.8) !important;
      background-color: rgba(37, 99, 235, 0.08) !important;
      border-radius: 12px !important;
      margin: 4px 0 !important;
    }
    
    .message-selectable-active::before {
      content: "✓ 已选中";
      position: absolute;
      top: 8px;
      left: 8px;
      background: #2563eb;
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 12px;
      z-index: 10;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    /* 侧边栏样式 - 关键：非模态 */
    .pdf-export-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: 420px;
      max-width: 90vw;
      background: white;
      z-index: 9997; /* 比普通内容高，但比全屏模态框低 */
      box-shadow: -2px 0 12px rgba(0,0,0,0.1);
      overflow-y: auto;
      padding: 20px;
      border-left: 1px solid #e5e7eb;
      transform: translateX(0); /* 默认显示 */
      transition: transform 0.3s ease;
    }
    
    /* 侧边栏收起状态 */
    .pdf-export-sidebar.hidden {
      transform: translateX(100%);
    }
    
    /* 半透明背景 - 允许点击穿透 */
    .pdf-export-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.1); /* 很淡的背景 */
      z-index: 9996; /* 比侧边栏低一级 */
      pointer-events: none; /* 关键：允许点击穿透 */
    }
    
    /* 侧边栏标题 */
    .pdf-export-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .pdf-export-header h3 {
      margin: 0;
      color: #1f2937;
    }
    
    .close-sidebar-btn {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #6b7280;
      padding: 4px;
      border-radius: 4px;
    }
    
    .close-sidebar-btn:hover {
      background: #f3f4f6;
      color: #374151;
    }
    
    /* 侧边栏内容区域 */
    .pdf-export-content {
      flex: 1;
      overflow-y: auto;
    }
    
    /* 控制项样式 */
    .pdf-export-controls {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .pdf-export-controls label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
      color: #374151;
    }
    
    .pdf-export-controls select,
    .pdf-export-controls input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    
    /* 按钮组 */
    .pdf-export-buttons {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
    
    .pdf-export-buttons button {
      flex: 1;
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background-color 0.2s;
    }
    
    #pdf-preview {
      background: #f3f4f6;
      color: #374151;
    }
    
    #pdf-preview:hover {
      background: #e5e7eb;
    }
    
    #pdf-export {
      background: #2563eb;
      color: white;
    }
    
    #pdf-export:hover {
      background: #1d4ed8;
    }
    
    #pdf-cancel {
      background: #f3f4f6;
      color: #374151;
    }
    
    #pdf-cancel:hover {
      background: #e5e7eb;
    }
    
    /* 日志区域 */
    .pdf-export-log { 
      height: 120px; 
      overflow: auto; 
      background: #111827; 
      color: #e5e7eb; 
      padding: 8px; 
      font-family: monospace; 
      font-size: 12px; 
      border-radius: 6px;
      margin-top: 16px;
    }
    
    .pdf-export-log div {
      margin-bottom: 4px;
    }
    
    /* 选择模式区域 */
    .pdf-select-mode-area {
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      margin: 16px 0;
      border: 1px solid #e5e7eb;
    }
    
    .pdf-select-mode-area label {
      display: flex !important;
      align-items: center;
      gap: 8px;
      margin-bottom: 0 !important;
    }
    
    #selected-count {
      font-weight: 600;
      color: #2563eb;
    }
    
    /* 已选消息预览 */
    .selected-preview {
      background: rgba(37, 99, 235, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      border: 1px solid rgba(37, 99, 235, 0.1);
    }
    
    .selected-preview h4 {
      margin: 0 0 8px 0;
      color: #2563eb;
      font-size: 14px;
    }
    
    .selected-messages-list {
      max-height: 200px;
      overflow-y: auto;
    }
    
    .selected-message-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px;
      background: white;
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    
    .selected-message-item .sender {
      font-weight: 600;
      min-width: 40px;
    }
    
    .selected-message-item .content {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .selected-message-item .index {
      background: #2563eb;
      color: white;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
    }
    
    /* 预览区域 */
    #pdf-preview-area {
      margin-top: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      background: #f9fafb;
    }
    
    #pdf-preview-iframe {
      width: 100%;
      height: 400px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
    }
    
    /* 主按钮样式 */
    .pdf-export-button {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 9999;
      padding: 10px 14px;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      border: none;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }
    
    .pdf-export-button:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(s);
}

function getMessageElements(root: Element, selector: string): Element[] {
  // 如果选择器为空，返回空数组或使用默认选择器
  if (!selector || !selector.trim()) {
    // 使用默认的消息选择器
    const defaultSelectors = [
      '.message-bubble-container',
      '.message',
      '[class*="message"]',
      '[data-role="message"]',
      '[role="article"]',
      'article'
    ];
    
    for (const fallback of defaultSelectors) {
      try {
        const elements = Array.from(root.querySelectorAll(fallback));
        if (elements.length > 0) {
          return elements;
        }
      } catch (e) {
        console.warn(`使用备用选择器 ${fallback} 时出错:`, e);
      }
    }
    
    return [];
  }
  
  // 优先按选择器查找
  try {
    const bySelector = Array.from(root.querySelectorAll(selector));
    if (bySelector.length > 0) return bySelector;
  } catch (e) {
    console.warn(`使用选择器 ${selector} 时出错:`, e);
  }
  
  // 针对你的 React 应用的消息结构进行优化查找
  const fallbackSelectors = [
    '.message-bubble-container',  // 你的消息容器类
    '[class*="message-bubble"]',  // 包含 message-bubble 的类
    '[class*="message"]',         // 包含 message 的类
    'div[role="article"]'         // 如果有 role 属性
  ];
  
  for (const fallback of fallbackSelectors) {
    try {
      const elements = Array.from(root.querySelectorAll(fallback));
      if (elements.length > 0) {
        return elements;
      }
    } catch (e) {
      console.warn(`使用备用选择器 ${fallback} 时出错:`, e);
    }
  }
  
  // 最后尝试查找所有可能的元素
  const allElements = Array.from(root.querySelectorAll('*'));
  return allElements.filter(el => {
    const cls = el.className?.toString() || '';
    const hasMessageClass = cls.includes('message') || 
                           cls.includes('Message') || 
                           cls.includes('bubble');
    
    // 检查是否包含合理的内容
    const hasContent = (el.textContent?.trim().length || 0) > 20;
    
    return hasMessageClass || hasContent;
  });
}

function getMessageIndex(element: Element, container: Element, messageSelector: string): number {
  // 传递实际的消息选择器，而不是空字符串
  const allMessages = getMessageElements(container, messageSelector);
  return allMessages.indexOf(element);
}

export async function initPdfExport(options: ExportPdfOptions = {}) {
  const {
    selector = '#message-list, .message-list, [data-message-list], .chat-messages, .messages',
    messageSelector = '.message, [data-message], [data-role="message"], [role="article"], article, .chat-message',
    filenamePrefix = 'chat',
    buttonText = '导出 PDF',
    parentSelector,
    defaultMargin = 10,
    defaultScale = 2,
    buttonId = 'pdf-export-button',
  } = options;

  createStyles();

  const parent = parentSelector ? document.querySelector(parentSelector) : document.body;
  if (!parent) {
    console.error('未找到父元素');
    return null;
  }

  // 移除已存在的按钮
  const existing = document.getElementById(buttonId);
  if (existing) existing.remove();

  // 创建按钮
  const btn = document.createElement('button');
  btn.id = buttonId;
  btn.type = 'button';
  btn.innerText = buttonText;
  btn.title = '导出聊天为 PDF';
  btn.className = 'pdf-export-button';

  let selectionModeEnabled = false;

  function toggleMessageSelection(element: Element, container: Element, messageSelector: string): boolean {
    const index = getMessageIndex(element, container, messageSelector);
    if (index === -1) return false;

    const wasSelected = selectedMessageIndices.has(index);
  
    if (wasSelected) {
      // 取消选中
      selectedMessageIndices.delete(index);
      element.classList.remove('pdf-export-selected');
      const badge = element.querySelector('.pdf-export-badge');
      if (badge) badge.remove();

      // 移除可点击样式
      element.classList.remove('message-selectable-active');
    } else {
      // 选中
      selectedMessageIndices.add(index);
      element.classList.add('pdf-export-selected', 'message-selectable-active');

      // 添加角标
      if (!element.querySelector('.pdf-export-badge')) {
        const badge = document.createElement('div');
        badge.className = 'pdf-export-badge';
        badge.innerText = '✓';
        element.appendChild(badge);
      }
    }

    return !wasSelected; // 返回新的选中状态
  }

  function updateSelectedPreview(container: Element) {
    const previewElement = document.querySelector('#selected-preview') as HTMLElement;
    const listElement = document.querySelector('#selected-messages-list') as HTMLElement;
    
    if (!previewElement || !listElement) return;
    
    if (selectedMessageIndices.size === 0) {
      previewElement.style.display = 'none';
      return;
    }
    
    previewElement.style.display = 'block';
    
    // 获取所有消息
    const allMessages = getMessageElements(container, messageSelector);
    const sortedIndices = Array.from(selectedMessageIndices).sort((a, b) => a - b);
    
    listElement.innerHTML = '';
    
    sortedIndices.forEach((index, i) => {
      if (index >= 0 && index < allMessages.length) {
        const messageElement = allMessages[index];
        const text = messageElement.textContent?.trim() || '';
        const isUser = messageElement.classList.contains('user') || 
                      messageElement.querySelector('.user') !== null;
        
        const item = document.createElement('div');
        item.className = 'selected-message-item';
        item.innerHTML = `
          <span class="index">${i + 1}</span>
          <span class="sender">${isUser ? '👤' : '🤖'}</span>
          <span class="content" title="${text}">${text.substring(0, 50)}${text.length > 50 ? '...' : ''}</span>
        `;
        
        listElement.appendChild(item);
      }
    });
  }

  function setupMessageSelection(container: Element) {
    // 清理旧的事件监听器
    container.removeEventListener('click', handleMessageClick as any);
    
    // 添加可点击的CSS类
    const allMessages = getMessageElements(container, messageSelector);
    allMessages.forEach(msg => {
      msg.classList.add('message-selectable');
      // 添加点击效果 - 使用类型断言将 Element 转换为 HTMLElement
      const htmlMsg = msg as HTMLElement;
      htmlMsg.style.cursor = 'pointer';
      htmlMsg.style.transition = 'all 0.2s ease';
    });
    
    function handleMessageClick(ev: MouseEvent) {
      if (!selectionModeEnabled) return;
      
      ev.preventDefault();
      ev.stopPropagation();
      
      const target = ev.target as Element;
      let messageElement: Element | null = null;
      
      // 向上查找消息元素
      let current: Element | null = target;
      while (current && current !== container) {
        if (current.matches(messageSelector)) {
          messageElement = current;
          break;
        }
        current = current.parentElement;
      }
      
      // 如果点击了角标，也查找父元素
      if (!messageElement && (target.classList.contains('pdf-export-badge') || target.closest('.pdf-export-badge'))) {
        messageElement = target.closest(messageSelector);
      }
      
      if (messageElement) {
        const isNowSelected = toggleMessageSelection(messageElement, container, messageSelector);
        
        // 在侧边栏中显示日志
        const logEl = document.querySelector('#pdf-log') as HTMLElement;
        if (logEl) {
          const time = new Date().toLocaleTimeString();
          const index = getMessageIndex(messageElement, container, messageSelector);
          
          logEl.innerHTML = `<div>[${time}] ${isNowSelected ? '✅ 选中' : '❌ 取消选中'} 消息 #${index + 1}</div>` + logEl.innerHTML.slice(0, 1000);
        }
        
        // 更新选中计数和预览
        updateSelectedCount();
        updateSelectedPreview(container);
      }
    }
    
    container.addEventListener('click', handleMessageClick as any, true);
  }

  // 添加 updateSelectedCount 函数
  function updateSelectedCount() {
    const selectedCount = selectedMessageIndices.size;
    const countElement = document.querySelector('#selected-count');
    if (countElement) {
      countElement.textContent = selectedCount > 0 ? `已选中 ${selectedCount} 条消息` : '';
    }
  }

  function openModal() {
    // 移除已存在的侧边栏和背景
    const existingSidebar = document.querySelector('.pdf-export-sidebar');
    const existingBackdrop = document.querySelector('.pdf-export-backdrop');
    if (existingSidebar) existingSidebar.remove();
    if (existingBackdrop) existingBackdrop.remove();
    
    // 创建半透明背景 - 允许点击穿透
    const backdrop = document.createElement('div');
    backdrop.className = 'pdf-export-backdrop';
    
    // 创建侧边栏
    const sidebar = document.createElement('div');
    sidebar.className = 'pdf-export-sidebar';
    
    sidebar.innerHTML = `
      <div class="pdf-export-header">
        <h3>📄 导出 PDF 设置</h3>
        <button class="close-sidebar-btn" title="关闭">×</button>
      </div>
      
      <div class="pdf-export-content">
        <div class="pdf-export-controls">
          <label>
            <span style="font-weight:500;margin-bottom:4px">导出模式:</span>
            <select id="pdf-mode">
              <option value="all">全部消息</option>
              <option value="selected">仅选中消息</option>
            </select>
          </label>
          
          <label>
            <span style="font-weight:500;margin-bottom:4px">页边距 (mm):</span>
            <input id="pdf-margin" type="number" value="${defaultMargin}" min="0" max="50" />
          </label>
          
          <div style="display:flex;gap:12px">
            <label style="flex:1">
              <span style="font-weight:500;margin-bottom:4px">纸张方向:</span>
              <select id="pdf-orientation">
                <option value="portrait">纵向</option>
                <option value="landscape">横向</option>
              </select>
            </label>
            
            <label style="flex:1">
              <span style="font-weight:500;margin-bottom:4px">纸张大小:</span>
              <select id="pdf-format">
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="a3">A3</option>
                <option value="a5">A5</option>
              </select>
            </label>
          </div>
          
          <label>
            <span style="font-weight:500;margin-bottom:4px">页面范围 (可选，示例: 1-3):</span>
            <input id="pdf-range" type="text" placeholder="如: 1-3" />
          </label>
          
          <label>
            <span style="font-weight:500;margin-bottom:4px">文件名:</span>
            <input id="pdf-fname" type="text" value="${filenamePrefix}-${new Date().toISOString().slice(0,10)}" />
          </label>
        </div>
        
        <div class="pdf-select-mode-area">
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pdf-select-mode" />
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:500">启用消息选择模式</span>
              <span style="font-size:12px;color:#6b7280">（点击聊天消息即可选择/取消选择）</span>
            </div>
            <span id="selected-count" style="margin-left:auto;font-weight:600;color:#2563eb"></span>
          </label>
        </div>
        
        <div id="selected-preview" class="selected-preview" style="display:none">
          <h4>📋 已选消息预览</h4>
          <div id="selected-messages-list" class="selected-messages-list">
            <!-- 动态填充选中的消息 -->
          </div>
        </div>
        
        <div style="font-size:13px;color:#6b7280;margin:12px 0;padding:12px;background:#f0f9ff;border-radius:6px;border-left:4px solid #2563eb">
          <strong>💡 使用说明:</strong><br>
          1. 勾选"启用消息选择模式"<br>
          2. 点击聊天中的消息气泡进行选择（蓝色边框表示已选中）<br>
          3. 选择"仅选中消息"导出模式<br>
          4. 点击"导出并保存"生成PDF
        </div>
        
        <div class="pdf-export-buttons">
          <button id="pdf-preview">预览</button>
          <button id="pdf-export">导出并保存</button>
          <button id="pdf-cancel">关闭</button>
        </div>
        
        <div class="pdf-export-log" id="pdf-log"></div>
        
        <div id="pdf-preview-area" style="display:none">
          <h4 style="margin-bottom:8px">📄 PDF 预览</h4>
          <iframe id="pdf-preview-iframe"></iframe>
        </div>
      </div>
    `;
    
    // 添加到页面
    document.body.appendChild(backdrop);
    document.body.appendChild(sidebar);
    
    // 获取DOM元素
    const logEl = sidebar.querySelector('#pdf-log') as HTMLElement;
    const selectModeCheckbox = sidebar.querySelector('#pdf-select-mode') as HTMLInputElement;
    const selectedCountSpan = sidebar.querySelector('#selected-count') as HTMLSpanElement;
    const closeBtn = sidebar.querySelector('.close-sidebar-btn') as HTMLButtonElement;
    const cancelBtn = sidebar.querySelector('#pdf-cancel') as HTMLButtonElement;
    
    // 日志函数
    function log(msg: string) {
      const time = new Date().toLocaleTimeString();
      logEl.innerHTML = `<div>[${time}] ${msg}</div>` + logEl.innerHTML;
    }
    
    // 更新选中计数
    function updateSelectedCount() {
      const count = selectedMessageIndices.size;
      selectedCountSpan.textContent = count > 0 ? `已选中 ${count} 条消息` : '';
    }
    
    updateSelectedCount();
    
    // 设置消息选择事件监听
    const container = document.querySelector(selector) as HTMLElement;
    let observer: MutationObserver | null = null;
    
    // 清理边框函数（气泡选中状态）- 移到这里，使它可以被所有函数访问
    function clearAllSelections() {
      if (!container) return;
      
      // 清除所有选中状态
      selectedMessageIndices.clear();

      // 移除所有消息的选中样式和角标
      const allMessages = getMessageElements(container, messageSelector);
      allMessages.forEach(msg => {
        msg.classList.remove('pdf-export-selected', 'message-selectable-active');
        const badge = msg.querySelector('.pdf-export-badge');
        if (badge) badge.remove();
      });

      // 更新UI显示
      updateSelectedCount();
      updateSelectedPreview(container);
    }
    
    // 启用/禁用选择模式
    selectModeCheckbox.addEventListener('change', () => {
      selectionModeEnabled = selectModeCheckbox.checked;
      if (selectionModeEnabled) {
        log('✅ 已启用消息选择模式');
        log('点击聊天消息即可选择/取消选择');
      } else {
        log('已禁用消息选择模式');
        // 当取消选择模式时，清除所有选中状态
        clearAllSelections();
      }
      updateSelectedCount();
    });
    
    if (container) {
      setupMessageSelection(container);
      
      // 监听DOM变化以更新消息索引
      observer = new MutationObserver(() => {
        updateSelectedCount();
        updateSelectedPreview(container);
      });
      
      observer.observe(container, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
      
      // 初始化预览
      updateSelectedPreview(container);
      
      // 清理函数
      const cleanup = () => {
        if (observer) {
          observer.disconnect();
        }
        selectionModeEnabled = false;
        if (selectModeCheckbox) {
          selectModeCheckbox.checked = false;
        }

        // 清除所有选中状态
        clearAllSelections();
      };
      
      // 关闭按钮事件
      closeBtn.addEventListener('click', () => {
        cleanup();
        sidebar.remove();
        backdrop.remove();
      });
      
      cancelBtn.addEventListener('click', () => {
        cleanup();
        sidebar.remove();
        backdrop.remove();
      });
      

      // 导出完成后清理
      const performGenerate = async (showPreview = false) => {
        try {
          log('开始导出流程...');
          
          const mode = (sidebar.querySelector('#pdf-mode') as HTMLSelectElement).value;
          const margin = Number((sidebar.querySelector('#pdf-margin') as HTMLInputElement).value) || defaultMargin;
          const orientation = (sidebar.querySelector('#pdf-orientation') as HTMLSelectElement).value as any;
          const format = (sidebar.querySelector('#pdf-format') as HTMLSelectElement).value as any;
          const rangeText = (sidebar.querySelector('#pdf-range') as HTMLInputElement).value.trim();
          const fname = (sidebar.querySelector('#pdf-fname') as HTMLInputElement).value.trim() || `${filenamePrefix}-${Date.now()}`;

          if (!container) {
            log('错误：未找到消息容器');
            alert('未找到消息容器，请检查选择器配置');
            return;
          }

          log('等待DOM稳定...');
          await waitForStableDOM(container, 800, 8000).catch(e => {
            log('DOM稳定等待超时，继续导出');
          });

          log('克隆消息节点...');
          const clone = container.cloneNode(true) as HTMLElement;

          // 处理仅选中消息模式
          if (mode === 'selected') {
            log('模式：仅导出已选消息');
            
            if (selectedMessageIndices.size === 0) {
              log('错误：未选中任何消息');
              alert('请先启用选择模式并选中要导出的消息');
              return;
            }

            const allMessages = getMessageElements(clone, messageSelector);
            log(`找到 ${allMessages.length} 条消息`);

            // 逆序删除，避免索引变化
            const indices = Array.from(selectedMessageIndices).sort((a, b) => b - a);
            let removedCount = 0;

            for (const index of indices) {
              if (index >= 0 && index < allMessages.length) {
                const msg = allMessages[index];
                // 添加选中标记
                const badge = document.createElement('div');
                badge.textContent = '已导出';
                badge.style.cssText = 'background:#10b981;color:white;padding:2px 6px;border-radius:4px;margin:4px;font-size:12px';
                msg.prepend(badge);
              } else {
                log(`警告：索引 ${index} 超出范围`);
              }
            }

            // 删除未选中的消息
            for (let i = allMessages.length - 1; i >= 0; i--) {
              if (!selectedMessageIndices.has(i)) {
                allMessages[i].remove();
                removedCount++;
              }
            }

            log(`删除了 ${removedCount} 条未选中消息，保留 ${selectedMessageIndices.size} 条消息`);
          }

          // 样式优化
          clone.style.cssText = `
            background: white !important;
            color: black !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            padding: 20px !important;
          `;

          // 移除媒体元素
          clone.querySelectorAll('video, audio, iframe, script, style').forEach(el => el.remove());

          // 加载 html2pdf
          log('加载html2pdf.js...');
          let html2pdfLib: any;
          try {
            const mod = await import('html2pdf.js');
            html2pdfLib = mod.default || mod;
          } catch (e) {
            html2pdfLib = (window as any).html2pdf;
          }

          if (!html2pdfLib) {
            log('错误：无法加载html2pdf.js');
            alert('请确保已安装 html2pdf.js：npm install html2pdf.js');
            return;
          }

          log('生成PDF...');
          const opt = {
            margin: margin,
            filename: `${fname}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
              scale: defaultScale, 
              useCORS: true,
              logging: true,
              allowTaint: true
            },
            jsPDF: { 
              unit: 'mm', 
              format: format, 
              orientation: orientation 
            }
          };

          const worker = html2pdfLib().set(opt).from(clone);
          const pdf = await worker.outputPdf('blob');
          
          log('PDF生成完成');

          if (showPreview) {
            const previewUrl = URL.createObjectURL(pdf);
            const iframe = sidebar.querySelector('#pdf-preview-iframe') as HTMLIFrameElement;
            iframe.src = previewUrl;
            (sidebar.querySelector('#pdf-preview-area') as HTMLElement).style.display = 'block';
            log('预览已生成');
          } else {
            const url = URL.createObjectURL(pdf);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fname}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            log('文件已保存');
            
            // 在导出完成后，关闭侧边栏
            cleanup();
            sidebar.remove();
            backdrop.remove();
          }

        } catch (error: any) {
          log(`错误：${error.message}`);
          console.error('导出失败:', error);
          alert(`导出失败: ${error.message}`);
        }
      };

      // 绑定按钮事件
      sidebar.querySelector('#pdf-preview')?.addEventListener('click', () => performGenerate(true));
      sidebar.querySelector('#pdf-export')?.addEventListener('click', () => performGenerate(false));
      
    } else {
      log(`⚠️ 警告：未找到消息容器 "${selector}"`);
    }
    
    // 点击背景关闭（可选）
    backdrop.addEventListener('click', (e) => {
      // 如果点击的是背景本身（不是子元素），则关闭
      if (e.target === backdrop) {
        selectionModeEnabled = false;
        if (selectModeCheckbox) {
          selectModeCheckbox.checked = false;
        }
        sidebar.remove();
        backdrop.remove();
      }
    });
    
    // 添加ESC键关闭功能
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectionModeEnabled = false;
        if (selectModeCheckbox) {
          selectModeCheckbox.checked = false;
        }
        sidebar.remove();
        backdrop.remove();
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    
    document.addEventListener('keydown', handleEscKey);
    
    // 侧边栏打开时，给按钮添加一个活跃状态
    const exportBtn = document.getElementById(buttonId);
    if (exportBtn) {
      exportBtn.classList.add('active');
      
      // 侧边栏关闭时移除活跃状态
      const removeActiveState = () => {
        exportBtn.classList.remove('active');
        document.removeEventListener('keydown', handleEscKey);
      };
      
      closeBtn.addEventListener('click', removeActiveState);
      cancelBtn.addEventListener('click', removeActiveState);
    }
    
    log('PDF导出侧边栏已打开');
    return sidebar;
  }

  btn.addEventListener('click', openModal);
  parent.appendChild(btn);

  return btn;
}

export default initPdfExport;