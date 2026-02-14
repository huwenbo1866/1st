const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '.env.openwebui') });

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OPENWEBUI_BASE_URL = (process.env.OPENWEBUI_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const OPENWEBUI_API_KEY = process.env.OPENWEBUI_API_KEY || '';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gpt-4o-mini';

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_SIZE || 50 * 1024 * 1024),
    files: 10
  }
});

const request = axios.create({
  baseURL: OPENWEBUI_BASE_URL,
  timeout: Number(process.env.REQUEST_TIMEOUT_MS || 120000)
});

function getHeaders(extra = {}) {
  const headers = { ...extra };
  if (OPENWEBUI_API_KEY) {
    headers.Authorization = `Bearer ${OPENWEBUI_API_KEY}`;
  }
  return headers;
}

function normalizeFileItem(file, fallbackId) {
  return {
    id: file?.id || file?.uuid || file?.file_id || fallbackId,
    name: file?.filename || file?.name || 'unknown',
    type: file?.content_type || file?.type || 'application/octet-stream',
    size: file?.size || 0,
    url: file?.url || file?.file?.url || '',
    deepSeekReady: true,
    supportedByDeepSeek: true,
    uploadedAt: new Date().toISOString()
  };
}

function getUserId(req, res) {
  let userId = req.headers['x-user-id'];
  if (!userId) {
    userId = crypto.randomUUID();
    res.setHeader('X-User-ID', userId);
  }
  return userId;
}

app.get('/api/health', async (req, res) => {
  try {
    await request.get('/health', { headers: getHeaders() });
    res.json({ status: 'ok', bridge: true, target: OPENWEBUI_BASE_URL });
  } catch (error) {
    res.status(502).json({
      status: 'error',
      bridge: true,
      message: 'open-webui unreachable',
      details: error.message
    });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const openaiResp = await request.get('/openai/models', { headers: getHeaders() });
    const models = (openaiResp.data?.data || []).map((m) => ({
      id: m.id,
      name: m.id,
      description: 'OpenWebUI model',
      max_tokens: 32768,
      vision: /vision|vl|gpt-4o|gemini/i.test(m.id),
      supports: ['文本对话', '多轮会话'],
      context_length: 32768
    }));
    res.json({ models });
  } catch (error) {
    res.json({
      models: [
        {
          id: DEFAULT_MODEL,
          name: DEFAULT_MODEL,
          description: 'Fallback model',
          max_tokens: 32768,
          vision: /vision|vl|gpt-4o|gemini/i.test(DEFAULT_MODEL),
          supports: ['文本对话'],
          context_length: 32768
        }
      ]
    });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  const userId = getUserId(req, res);
  const { message, files = [], model = DEFAULT_MODEL, max_tokens = 2000 } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!message && files.length === 0) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: '消息不能为空' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const content = [{ type: 'text', text: message || '请结合已上传文件进行分析' }];
  for (const f of files) {
    if (f?.url) {
      content.push({ type: 'text', text: `附件: ${f.name || f.id} (${f.url})` });
    }
  }

  try {
    const response = await request.post(
      '/openai/chat/completions',
      {
        model,
        stream: true,
        max_tokens,
        messages: [{ role: 'user', content }],
        user: userId
      },
      {
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        responseType: 'stream'
      }
    );

    req.on('close', () => {
      response.data?.destroy();
    });

    let buffer = '';
    response.data.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;

        if (payload === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) {
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
          }
        } catch (err) {
          // ignore invalid event
        }
      }
    });

    response.data.on('end', () => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    response.data.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message || '流式响应失败' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || '请求失败' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择要上传的文件' });
    }

    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const uploadResp = await request.post('/api/v1/files/', form, {
      headers: getHeaders(form.getHeaders())
    });

    const file = normalizeFileItem(uploadResp.data, req.file.originalname);
    res.json({ success: true, file });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.post('/api/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: '请选择要上传的文件' });
    }

    const results = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
      const uploadResp = await request.post('/api/v1/files/', form, {
        headers: getHeaders(form.getHeaders())
      });
      results.push(normalizeFileItem(uploadResp.data, file.originalname));
    }

    res.json({ success: true, files: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/files', async (req, res) => {
  try {
    const fileResp = await request.get('/api/v1/files/', { headers: getHeaders() });
    const list = (fileResp.data || []).map((f) => normalizeFileItem(f));
    res.json({ success: true, count: list.length, files: list });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/files/:id', async (req, res) => {
  try {
    const fileResp = await request.get(`/api/v1/files/${req.params.id}`, { headers: getHeaders() });
    res.json({ success: true, file: normalizeFileItem(fileResp.data, req.params.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.post('/api/tts/generate', async (req, res) => {
  try {
    const { text, voice } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ success: false, error: '文本不能为空' });
    }

    const ttsResp = await request.post(
      '/api/v1/audio/speech',
      {
        input: text,
        voice: voice || process.env.DEFAULT_TTS_VOICE || 'alloy',
        model: process.env.DEFAULT_TTS_MODEL || 'gpt-4o-mini-tts'
      },
      {
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        responseType: 'arraybuffer'
      }
    );

    res.setHeader('Content-Type', ttsResp.headers['content-type'] || 'audio/mpeg');
    res.send(Buffer.from(ttsResp.data));
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/configs', async (req, res) => {
  try {
    const configResp = await request.get('/api/v1/configs', { headers: getHeaders() });
    res.json(configResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/prompts', async (req, res) => {
  try {
    const promptResp = await request.get('/api/v1/prompts', { headers: getHeaders() });
    res.json(promptResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/chats', async (req, res) => {
  try {
    const chatResp = await request.get('/api/v1/chats', { headers: getHeaders() });
    res.json(chatResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/folders', async (req, res) => {
  try {
    const folderResp = await request.get('/api/v1/folders', { headers: getHeaders() });
    res.json(folderResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/notes', async (req, res) => {
  try {
    const noteResp = await request.get('/api/v1/notes', { headers: getHeaders() });
    res.json(noteResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/channels', async (req, res) => {
  try {
    const channelResp = await request.get('/api/v1/channels', { headers: getHeaders() });
    res.json(channelResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/retrieval', async (req, res) => {
  try {
    const retrievalResp = await request.get('/api/v1/retrieval', { headers: getHeaders() });
    res.json(retrievalResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.get('/api/knowledge', async (req, res) => {
  try {
    const knowledgeResp = await request.get('/api/v1/knowledge', { headers: getHeaders() });
    res.json(knowledgeResp.data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌉 OpenWebUI bridge started on http://localhost:${PORT}`);
  console.log(`➡️ Target OpenWebUI: ${OPENWEBUI_BASE_URL}`);
});
