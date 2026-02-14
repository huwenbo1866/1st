// server/start.js - 修改后的启动脚本
const { spawn, fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// 添加这行 - 加载环境变量配置文件
require('dotenv').config({ path: '.env.multi' });

console.log('🚀 启动AI Chat多用户并发服务器...');

// 检查必要的环境变量
if (!process.env.SILICONFLOW_API_KEY) {
  console.error('❌ 错误：请在 .env.multi 文件中设置 SILICONFLOW_API_KEY');
  process.exit(1);
}

// 检查端口是否被占用
const net = require('net');
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

// 1. 先检查3000端口是否可用
console.log('🔍 检查端口状态...');
checkPort(3000).then(async (isUsed) => {
  if (isUsed) {
    console.error('❌ 端口3000已被占用！请先停止相关进程');
    console.log('💡 尝试停止占用端口的进程:');
    console.log('   taskkill /f /im node.exe');
    console.log('   taskkill /f /im nginx.exe');
    process.exit(1);
  }

  console.log('✅ 端口3000可用');

  // 2. 启动负载均衡器（使用 simple-balancer.js）
  console.log('📡 启动负载均衡器...');
  const loadBalancer = spawn('node', ['simple-balancer.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
    cwd: __dirname
  });

  loadBalancer.on('error', (err) => {
    console.error('❌ 负载均衡器启动失败:', err);
    process.exit(1);
  });

  loadBalancer.on('exit', (code) => {
    console.log(`📡 负载均衡器退出，code: ${code}`);
    if (code !== 0) {
      console.error('❌ 负载均衡器异常退出');
    }
  });

  // 3. 等待负载均衡器启动
  console.log('⏳ 等待负载均衡器启动...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 4. 启动工作进程
  console.log('👷 启动工作进程...');
  const workers = [];
  
  const workerCount = parseInt(process.env.WORKER_COUNT) || 4;
  const basePort = 3001;
  
  for (let i = 1; i <= workerCount; i++) {
    const workerPort = basePort + i - 1;
    const workerEnv = {
      ...process.env,
      WORKER_ID: i.toString(),
      WORKER_PORT: workerPort.toString(),
      NODE_ENV: 'production',
      BASE_UPLOAD_DIR: process.env.BASE_UPLOAD_DIR || './uploads'
    };
    
    console.log(`👷 启动工作进程 ${i} (端口: ${workerPort})...`);
    
    const worker = fork('worker.js', [], {
      env: workerEnv,
      stdio: 'inherit',
      cwd: __dirname
    });
    
    workers.push({
      id: i,
      port: workerPort,
      process: worker
    });
    
    // 等待工作进程启动
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 所有服务启动完成！');
  console.log('📊 访问地址:');
  console.log('   - 负载均衡器: http://localhost:3000');
  console.log('   - 工作进程1: http://localhost:3001');
  console.log('   - 工作进程2: http://localhost:3002');
  console.log('   - 工作进程3: http://localhost:3003');
  console.log('   - 工作进程4: http://localhost:3004');
  console.log('\n🔍 健康检查:');
  console.log('   - 负载均衡器: http://localhost:3000/api/health');
  console.log('   - 工作进程1: http://localhost:3001/api/health');
  console.log('   - 工作进程2: http://localhost:3002/api/health');
  console.log('   - 工作进程3: http://localhost:3003/api/health');
  console.log('   - 工作进程4: http://localhost:3004/api/health');
  console.log('\n📁 文件上传目录:', process.env.BASE_UPLOAD_DIR || './uploads');

  // 5. 测试连接
  console.log('\n🧪 测试服务连通性...');
  setTimeout(() => {
    const http = require('http');
    const testUrl = 'http://localhost:3000/api/health';
    const req = http.get(testUrl, (res) => {
      console.log(`✅ 负载均衡器健康检查: HTTP ${res.statusCode}`);
      if (res.statusCode === 200) {
        res.on('data', (chunk) => {
          console.log(`📄 响应: ${chunk.toString()}`);
        });
      }
    });
    
    req.on('error', (err) => {
      console.error(`❌ 无法连接到负载均衡器: ${err.message}`);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      console.warn('⏰ 连接测试超时');
    });
  }, 5000);

  // 优雅关闭处理
  // 先关闭均匀负载器再关闭工作进程，防止工作进程关闭了还接受负载器的请求
  const shutdown = (signal) => {
    console.log(`\n📢 收到 ${signal} 信号，优雅关闭中...`);
  
    // 1. 先关闭负载均衡器
    console.log('📡 关闭负载均衡器...');
    if (loadBalancer && !loadBalancer.killed) {
      loadBalancer.kill('SIGTERM');
    }
    
    // 2. 等待1秒，然后关闭工作进程
    setTimeout(() => {
      workers.forEach(worker => {
        console.log(`👷 关闭工作进程 ${worker.id}...`);
        worker.process.kill('SIGTERM');
      });
      
      // 3. 等待所有进程退出
      setTimeout(() => {
        process.exit(0);
      }, 3000);
    }, 1000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});