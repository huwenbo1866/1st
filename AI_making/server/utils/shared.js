// server/utils/shared.js - 修改版本（无需Redis）
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// UserSession 类 (完整)
class UserSession {
  constructor(userId, workerId) {
    this.id = userId || crypto.randomUUID();
    this.workerId = workerId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.files = [];
    this.chatHistory = [];
    this.preferences = {};
  }

  updateActivity() {
    this.lastActivity = Date.now();
    return this;
  }

  addFile(fileInfo) {
    this.files.push({
      ...fileInfo,
      uploadedAt: Date.now(),
      userId: this.id
    });
    return this;
  }

  removeFile(fileId) {
    this.files = this.files.filter(f => f.id !== fileId);
    return this;
  }

  async cleanupInactive(timeout = 3600000) {
    const now = Date.now();
    if (now - this.lastActivity > timeout) {
      await this.clearFiles();
      return true;
    }
    return false;
  }

  async clearFiles() {
    for (const file of this.files) {
      const filePath = path.join(process.env.BASE_UPLOAD_DIR, this.id, file.id);
      await fs.unlink(filePath).catch(() => {});
    }
    this.files = [];
    return this;
  }
}

// SessionManager (内存存储，无需Redis)
class SessionManager {
  constructor() {
    this.sessions = new Map();
    console.log('📝 使用内存会话存储（Redis不可用）');
  }

  async getSession(userId) {
    return this.sessions.get(userId) || null;
  }

  async createSession(userId, workerId) {
    const session = new UserSession(userId, workerId);
    await this.setSession(userId, session);
    return session;
  }

  async setSession(userId, session) {
    this.sessions.set(userId, session);
  }

  async deleteSession(userId) {
    this.sessions.delete(userId);
  }

  async getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

// FilePathManager
class FilePathManager {
  static getUserUploadDir(userId) {
    const timestamp = Date.now();
    return path.join(process.env.BASE_UPLOAD_DIR, userId, timestamp.toString());
  }

  static getUserFilePath(userId, fileId) {
    return path.join(process.env.BASE_UPLOAD_DIR, userId, fileId);
  }
}

// LockManager
class LockManager {
  constructor() {
    this.locks = new Map();
  }

  async acquire(key, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!this.locks.has(key)) {
        this.locks.set(key, true);
        return () => this.release(key);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`获取锁超时: ${key}`);
  }

  release(key) {
    this.locks.delete(key);
  }
}

module.exports = {
  UserSession,
  SessionManager,
  FilePathManager,
  LockManager
};