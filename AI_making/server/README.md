
# 完整启动：负载均衡器+所有worker	生产环境、完整测试
npm run start:complete	

# 启动单个worker	开发调试
npm run start	

# 启动单个worker	开发模式（带热重载）	代码修改调试
npm run dev	

# 只启动负载均衡器	负载均衡器测试
npm run start:simple	


# 指定启动哪个 worker
WORKER_ID=1 WORKER_PORT=3001 node worker.js



# =========== 常见调试方法 =============
# 查找占用端口的进程
netstat -ano | findstr :3000

# 强制结束占用端口的进程（Windows）
taskkill /f /pid <PID>
