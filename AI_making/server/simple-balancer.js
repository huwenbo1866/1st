// server/simple-balancer.js - 简单的负载均衡器
const http = require('http');
const httpProxy = require('http-proxy');

console.log('🔧 创建简单的负载均衡器...');

const proxy = httpProxy.createProxyServer({});
const workers = [
  'http://localhost:3001',
  'http://localhost:3002', 
  'http://localhost:3003',
  'http://localhost:3004'
];

let current = 0;
let requestCount = 0;

const server = http.createServer((req, res) => {
  requestCount++;
  
  // 简单的轮询负载均衡
  const target = workers[current];
  current = (current + 1) % workers.length;
  
  console.log(`📡 [${requestCount}] 路由请求到: ${target}${req.url}`);
  
  proxy.web(req, res, { target }, (err) => {
    if (err) {
      console.error(`❌ [${requestCount}] 代理错误:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '代理服务器错误',
        details: err.message 
      }));
    }
  });
});

// 错误处理
proxy.on('error', (err, req, res) => {
  // 防止重复发送响应头
  if (res && !res.headersSent && !res.writableEnded) {
    console.error(`❌ 代理错误:`, err.message);
    try {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: '代理服务器错误',
        details: err.message 
      }));
    } catch (headerError) {
      // 忽略headers已经发送的错误
    }
  }
});

proxy.on('proxyRes', (proxyRes, req, res) => {
  // 添加一些响应头
  res.setHeader('X-Load-Balancer', 'simple-balancer');
  res.setHeader('X-Worker-Hit', current);
});


const PORT = 3000;
server.listen(PORT, 'localhost', () => {
  console.log(`✅ 负载均衡器运行在 http://localhost:${PORT}`);
  console.log(`📊 代理到工作进程:`);
  workers.forEach((worker, index) => {
    console.log(`   ${index + 1}. ${worker}`);
  });
  console.log('\n📡 等待工作进程启动...');
});

// 检查工作进程是否可用
function checkWorkerHealth() {
  workers.forEach((worker, index) => {
    const healthUrl = `${worker}/api/health`;
    const req = http.get(healthUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`✅ 工作进程 ${index + 1} (${worker}) 健康`);
      } else {
        console.warn(`⚠️  工作进程 ${index + 1} (${worker}) 状态: ${res.statusCode}`);
      }
    });
    
    req.on('error', (err) => {
      console.warn(`❌ 工作进程 ${index + 1} (${worker}) 不可达: ${err.message}`);
    });
    
    req.setTimeout(3000, () => {
      req.destroy();
      console.warn(`⏰ 工作进程 ${index + 1} (${worker}) 检查超时`);
    });
  });
}

// 启动后30秒检查一次健康状态
setTimeout(checkWorkerHealth, 30000);
setInterval(checkWorkerHealth, 60000); // 每分钟检查一次

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('📢 收到SIGTERM信号，关闭负载均衡器...');
  server.close(() => {
    console.log('负载均衡器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📢 收到SIGINT信号，关闭负载均衡器...');
  server.close(() => {
    console.log('负载均衡器已关闭');
    process.exit(0);
  });
});