// server/start.js - 新的启动文件
const { spawn, fork } = require('child_process');
const path = require('path');

console.log('🚀 启动AI Chat多用户并发服务器...');

// 1. 先启动负载均衡器
console.log('📡 启动负载均衡器...');
const loadBalancer = spawn('node', ['load-balancer.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' }
});

loadBalancer.on('error', (err) => {
  console.error('❌ 负载均衡器启动失败:', err);
  process.exit(1);
});

loadBalancer.on('exit', (code) => {
  console.log(`📡 负载均衡器退出，code: ${code}`);
  process.exit(code);
});

// 2. 等待一下确保负载均衡器启动
setTimeout(() => {
  // 3. 启动工作进程
  console.log('👷 启动工作进程...');
  const workers = [];
  
  // 读取环境变量配置
  const workerCount = parseInt(process.env.WORKER_COUNT) || 4;
  
  for (let i = 1; i <= workerCount; i++) {
    const workerPort = 3000 + i; // 使用3001-3004端口
    const workerEnv = {
      ...process.env,
      WORKER_ID: i.toString(),
      WORKER_PORT: workerPort.toString(),
      NODE_ENV: 'production'
    };
    
    console.log(`👷 启动工作进程 ${i} (端口: ${workerPort})...`);
    
    const worker = fork('worker.js', [], {
      env: workerEnv,
      stdio: 'inherit'
    });
    
    workers.push(worker);
    
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        console.log(`✅ 工作进程 ${i} 就绪`);
      }
    });
    
    worker.on('exit', (code) => {
      console.log(`⚠️  工作进程 ${i} 退出，code: ${code}`);
    });
  }
  
  console.log('🎉 所有服务启动完成！');
  console.log('📊 访问地址:');
  console.log('   - 负载均衡器: http://localhost:3000');
  console.log('   - 工作进程: http://localhost:3001 - 3004');
  console.log('   - 健康检查: http://localhost:3000/api/health');
  
  // 优雅关闭处理
  const shutdown = () => {
    console.log('\n📢 收到关闭信号，优雅关闭中...');
    
    // 先关闭工作进程
    workers.forEach(worker => {
      worker.kill('SIGTERM');
    });
    
    // 最后关闭负载均衡器
    setTimeout(() => {
      loadBalancer.kill('SIGTERM');
      process.exit(0);
    }, 5000);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
}, 2000); // 等待2秒让负载均衡器启动