// server/utils/redis.js
const Redis = require('ioredis');

class RedisSessionStore {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  
  async setSession(userId, sessionData, ttl = 3600) {
    await this.redis.setex(`session:${userId}`, ttl, JSON.stringify(sessionData));
  }
  
  async getSession(userId) {
    const data = await this.redis.get(`session:${userId}`);
    return data ? JSON.parse(data) : null;
  }
  
  async deleteSession(userId) {
    await this.redis.del(`session:${userId}`);
  }

  // 新增：获取所有sessions，用于清理
  async getAllSessions() {
    const keys = await this.redis.keys('session:*');
    const sessions = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) sessions.push(JSON.parse(data));
    }
    return sessions;
  }
}

module.exports = { RedisSessionStore };