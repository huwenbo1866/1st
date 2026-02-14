// server/process-manager.js
const cluster = require('cluster');
const os = require('os');
const path = require('path');
const { performance } = require('perf_hooks');

class ProcessManager {
  constructor(config = {}) {
    this.config = {
      workerCount: config.workerCount || Math.min(os.cpus().length, 8),
      basePort: config.basePort || 3001,
      workerScript: config.workerScript || path.join(__dirname, 'worker.js'),
      maxMemoryRestart: config.maxMemoryRestart || 1024, // MB
      maxUptimeRestart: config.maxUptimeRestart || 86400000, // 24小时
      ...config
    };
    
    this.workers = new Map(); // workerId -> worker info
    this.stats = new Map(); // workerId -> stats
    this.startTime = Date.now();
    
    if (cluster.isMaster) {
      console.log(`📡 主进程 ${process.pid} 启动`);
      this.setupMaster();
    }
  }
  
  setupMaster() {
    // 启动工作进程
    for (let i = 1; i <= this.config.workerCount; i++) {
      this.forkWorker(i);
    }
    
    // 监听工作进程事件
    cluster.on('exit', (worker, code, signal) => {
      const workerId = this.findWorkerIdByPid(worker.process.pid);
      if (workerId) {
        console.warn(`⚠️  工作进程 ${workerId} (PID: ${worker.process.pid}) 退出 (code: ${code}, signal: ${signal})`);
        this.workers.delete(workerId);
        this.stats.delete(workerId);
        
        // 自动重启
        console.log(`🔄 重启工作进程 ${workerId}...`);
        this.forkWorker(workerId);
      }
    });
    
    // 处理进程消息
    cluster.on('message', (worker, message) => {
      if (message.type === 'stats') {
        this.stats.set(message.workerId, message);
      }
    });
    
    // 定期检查和重启
    setInterval(() => this.checkWorkers(), 60000); // 每分钟检查一次
  }
  
  forkWorker(id) {
    const worker = cluster.fork({
      WORKER_ID: id.toString(),
      WORKER_PORT: (this.config.basePort + id - 1).toString()
    });
    
    this.workers.set(id, {
      worker,
      pid: worker.process.pid,
      startedAt: Date.now(),
      restarts: 0
    });
    
    console.log(`✅ 启动工作进程 ${id} (PID: ${worker.process.pid}, Port: ${this.config.basePort + id - 1})`);
    
    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        console.log(`👍 工作进程 ${id} 就绪`);
      }
    });
  }
  
  async checkWorkers() {
    for (const [id, info] of this.workers.entries()) {
      const uptime = Date.now() - info.startedAt;
      const stats = this.stats.get(id);
      
      if (stats) {
        const rss = stats.memory.rss / 1024 / 1024; // MB
        
        if (rss > this.config.maxMemoryRestart) {
          console.log(`🧹 工作进程 ${id} 内存使用 ${rss.toFixed(2)}MB 超过阈值，重启...`);
          await this.restartWorker(id);
        } else if (uptime > this.config.maxUptimeRestart) {
          console.log(`🕒 工作进程 ${id} 运行时间 ${uptime / 3600000}小时 超过阈值，重启...`);
          await this.restartWorker(id);
        }
      }
    }
  }
  
  async restartWorker(id) {
    const info = this.workers.get(id);
    if (!info) return;
    
    console.log(`🔄 开始重启工作进程 ${id} (PID: ${info.pid})`);
    
    // 发送关闭信号
    info.worker.send({ type: 'shutdown' });
    
    // 等待关闭或超时
    await new Promise(resolve => {
      info.worker.once('exit', resolve);
      setTimeout(() => {
        if (!info.worker.isDead()) {
          console.warn(`⚠️ 强制杀死工作进程 ${id}`);
          info.worker.kill('SIGKILL');
        }
        resolve();
      }, 10000);
    });
    
    // 重启
    this.forkWorker(id);
    this.workers.get(id).restarts = (info.restarts || 0) + 1;
  }
  
  findWorkerIdByPid(pid) {
    for (const [id, info] of this.workers.entries()) {
      if (info.pid === pid) return id;
    }
    return null;
  }
  
  start() {
    if (cluster.isMaster) {
      // 主进程已设置
    } else {
      // 工作进程逻辑在 worker.js
    }
    
    // 优雅关闭
    const shutdown = (signal) => {
      console.log(`\n📢 收到 ${signal} 信号，开始优雅关闭...`);
      
      // 通知所有工作进程关闭
      for (const info of this.workers.values()) {
        info.worker.send({ type: 'shutdown' });
      }
      
      let totalWorkers = this.workers.size;
      
      // 监听退出
      cluster.on('exit', () => {
        totalWorkers--;
        if (totalWorkers === 0) {
          console.log('👋 没有工作进程，退出主进程');
          process.exit(0);
        }
      });
      
      // 设置超时强制退出
      setTimeout(() => {
        console.warn('⚠️  优雅关闭超时，强制退出');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    console.log('✅ 优雅关闭处理器已设置');
  }
  
  // 根据PID获取工作进程
  getWorkerByPid(pid) {
    for (const id in cluster.workers) {
      if (cluster.workers[id].process.pid === pid) {
        return cluster.workers[id];
      }
    }
    return null;
  }
}

module.exports = ProcessManager;