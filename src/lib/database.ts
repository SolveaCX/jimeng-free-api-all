import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';

// 数据库文件路径
const DB_PATH = process.env.DB_PATH || './data/jimeng.db';

// 确保数据目录存在
fs.ensureDirSync(path.dirname(DB_PATH));

// 初始化数据库连接
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 初始化表结构
db.exec(`
  -- 用户表（管理员账号）
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- Session表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- API Key统计表
  CREATE TABLE IF NOT EXISTS key_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL,
    key_preview TEXT NOT NULL,
    model TEXT NOT NULL,
    credits_used INTEGER DEFAULT 0,
    remaining_credits INTEGER DEFAULT 0,
    call_count INTEGER DEFAULT 1,
    last_used TEXT DEFAULT (datetime('now', 'localtime')),
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 媒体记录表
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT,
    key_preview TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 日志缓冲表
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  -- 异步视频任务表
  CREATE TABLE IF NOT EXISTS video_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT UNIQUE NOT NULL,
    history_id TEXT,
    status TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT NOT NULL,
    token TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    token_preview TEXT NOT NULL,
    request_json TEXT,
    result_url TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    finished_at TEXT
  );

  -- 创建索引
  CREATE INDEX IF NOT EXISTS idx_key_stats_key ON key_stats(key_hash);
  CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_video_tasks_task_id ON video_tasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_video_tasks_updated ON video_tasks(updated_at DESC);
`);

// 密码哈希
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 生成Session ID
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Key预览（隐藏中间部分）
export function keyPreview(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

// Key哈希
export function hashKey(key: string): string {
  return crypto.createHash('md5').update(key).digest('hex');
}

// ==================== 用户管理 ====================

export function isSetupComplete(): boolean {
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count > 0;
}

export function createUser(username: string, password: string): void {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
}

export function validateUser(username: string, password: string): number | null {
  const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as { id: number; password_hash: string } | undefined;
  if (user && user.password_hash === hashPassword(password)) {
    return user.id;
  }
  return null;
}

export function changePassword(userId: number, newPassword: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
}

// ==================== Session管理 ====================

export function createSession(userId: number): string {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24小时
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
  return sessionId;
}

export function validateSession(sessionId: string): number | null {
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sessionId) as { user_id: number; expires_at: string } | undefined;
  if (session && new Date(session.expires_at) > new Date()) {
    return session.user_id;
  }
  if (session) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  return null;
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// ==================== 统计管理 ====================

export function recordCall(key: string, model: string, creditsUsed: number = 0, remainingCredits: number = 0): void {
  console.log(`[DB] recordCall called: model=${model}, creditsUsed=${creditsUsed}, remainingCredits=${remainingCredits}`);
  const keyHash = hashKey(key);
  const preview = keyPreview(key);
  
  try {
    const existing = db.prepare('SELECT id, call_count, credits_used FROM key_stats WHERE key_hash = ? AND model = ?').get(keyHash, model) as { id: number; call_count: number; credits_used: number } | undefined;
    
    if (existing) {
      db.prepare(`UPDATE key_stats SET call_count = ?, credits_used = ?, remaining_credits = ?, last_used = datetime('now', 'localtime') WHERE id = ?`)
        .run(existing.call_count + 1, existing.credits_used + creditsUsed, remainingCredits, existing.id);
      console.log(`[DB] Updated key_stats: id=${existing.id}, call_count=${existing.call_count + 1}, creditsUsed=${creditsUsed}`);
    } else {
      db.prepare('INSERT INTO key_stats (key_hash, key_preview, model, credits_used, remaining_credits) VALUES (?, ?, ?, ?, ?)')
        .run(keyHash, preview, model, creditsUsed, remainingCredits);
      console.log(`[DB] Inserted new key_stats: model=${model}, preview=${preview}, creditsUsed=${creditsUsed}`);
    }
  } catch (e) {
    console.error(`[DB] recordCall error:`, e);
  }
}

export function getStats() {
  // 按Key汇总（包含剩余积分）
  const keyStats = db.prepare(`
    SELECT key_preview, SUM(call_count) as total_calls, SUM(credits_used) as total_credits, 
           MAX(remaining_credits) as remaining_credits, MAX(last_used) as last_used
    FROM key_stats GROUP BY key_hash ORDER BY total_calls DESC
  `).all();
  
  // 按模型汇总
  const modelStats = db.prepare(`
    SELECT model, SUM(call_count) as total_calls, SUM(credits_used) as total_credits
    FROM key_stats GROUP BY model ORDER BY total_calls DESC
  `).all();
  
  // 总计
  const totals = db.prepare(`
    SELECT SUM(call_count) as total_calls, SUM(credits_used) as total_credits FROM key_stats
  `).get() as { total_calls: number; total_credits: number };
  
  return { keyStats, modelStats, totals };
}

// ==================== 媒体管理 ====================

export function saveMedia(type: 'image' | 'video', url: string, model: string, prompt: string, key: string): void {
  db.prepare('INSERT INTO media (type, url, model, prompt, key_preview) VALUES (?, ?, ?, ?, ?)')
    .run(type, url, model, prompt, keyPreview(key));
}

export function getMedia(page: number = 1, limit: number = 20, type?: string) {
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM media';
  let countQuery = 'SELECT COUNT(*) as total FROM media';
  const params: any[] = [];
  
  if (type) {
    query += ' WHERE type = ?';
    countQuery += ' WHERE type = ?';
    params.push(type);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  const items = db.prepare(query).all(...params, limit, offset);
  const countResult = db.prepare(countQuery).get(...params) as { total: number };
  
  return {
    items,
    total: countResult.total,
    page,
    limit,
    totalPages: Math.ceil(countResult.total / limit)
  };
}

// ==================== 日志管理 ====================

const MAX_LOGS = 1000;

export function addLog(level: string, message: string): void {
  db.prepare('INSERT INTO logs (level, message) VALUES (?, ?)').run(level, message);
  
  // 清理旧日志
  db.prepare(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ${MAX_LOGS})`).run();
}

export function getLogs(level?: string, limit: number = 100) {
  let query = 'SELECT * FROM logs';
  const params: any[] = [];
  
  if (level && level !== 'ALL') {
    query += ' WHERE level = ?';
    params.push(level);
  }
  
  query += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  
  return db.prepare(query).all(...params);
}

export function clearLogs(): void {
  db.prepare('DELETE FROM logs').run();
}

export type VideoTaskStatus = 'QUEUED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

export interface VideoTaskRecord {
  id?: number;
  task_id: string;
  history_id?: string | null;
  status: VideoTaskStatus;
  model: string;
  prompt: string;
  token: string;
  token_hash: string;
  token_preview: string;
  request?: any;
  result_url?: string | null;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
}

export interface CreateVideoTaskInput {
  taskId: string;
  historyId?: string | null;
  status: VideoTaskStatus;
  model: string;
  prompt: string;
  token: string;
  request?: any;
}

export interface UpdateVideoTaskInput {
  historyId?: string | null;
  status?: VideoTaskStatus;
  resultUrl?: string | null;
  error?: string | null;
  request?: any;
  finished?: boolean;
}

function mapVideoTask(row: any): VideoTaskRecord | null {
  if (!row) return null;
  let request: any = {};
  if (row.request_json) {
    try {
      request = JSON.parse(row.request_json);
    } catch {
      request = {};
    }
  }
  return {
    id: row.id,
    task_id: row.task_id,
    history_id: row.history_id,
    status: row.status,
    model: row.model,
    prompt: row.prompt,
    token: row.token,
    token_hash: row.token_hash,
    token_preview: row.token_preview,
    request,
    result_url: row.result_url,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  };
}

export function createVideoTask(input: CreateVideoTaskInput): VideoTaskRecord {
  db.prepare(`
    INSERT INTO video_tasks (
      task_id, history_id, status, model, prompt, token, token_hash,
      token_preview, request_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    input.historyId || null,
    input.status,
    input.model,
    input.prompt,
    input.token,
    hashKey(input.token),
    keyPreview(input.token),
    JSON.stringify(input.request || {})
  );
  return getVideoTask(input.taskId)!;
}

export function getVideoTask(taskId: string): VideoTaskRecord | null {
  const row = db.prepare('SELECT * FROM video_tasks WHERE task_id = ?').get(taskId);
  return mapVideoTask(row);
}

export function updateVideoTask(taskId: string, input: UpdateVideoTaskInput): VideoTaskRecord | null {
  const fields: string[] = ['updated_at = datetime(\'now\', \'localtime\')'];
  const params: any[] = [];

  if (Object.prototype.hasOwnProperty.call(input, 'historyId')) {
    fields.push('history_id = ?');
    params.push(input.historyId || null);
  }
  if (input.status) {
    fields.push('status = ?');
    params.push(input.status);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'resultUrl')) {
    fields.push('result_url = ?');
    params.push(input.resultUrl || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'error')) {
    fields.push('error = ?');
    params.push(input.error || null);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'request')) {
    fields.push('request_json = ?');
    params.push(JSON.stringify(input.request || {}));
  }
  if (input.finished) {
    fields.push('finished_at = datetime(\'now\', \'localtime\')');
  }

  params.push(taskId);
  db.prepare(`UPDATE video_tasks SET ${fields.join(', ')} WHERE task_id = ?`).run(...params);
  return getVideoTask(taskId);
}

export function listUnfinishedVideoTasks(limit: number = 20): VideoTaskRecord[] {
  const rows = db.prepare(`
    SELECT * FROM video_tasks
    WHERE status IN ('QUEUED', 'IN_PROGRESS')
    ORDER BY updated_at ASC, id ASC
    LIMIT ?
  `).all(limit);
  return rows.map(mapVideoTask).filter(Boolean) as VideoTaskRecord[];
}

export default {
  isSetupComplete,
  createUser,
  validateUser,
  changePassword,
  createSession,
  validateSession,
  deleteSession,
  recordCall,
  getStats,
  saveMedia,
  getMedia,
  addLog,
  getLogs,
  clearLogs,
  createVideoTask,
  getVideoTask,
  updateVideoTask,
  listUnfinishedVideoTasks
};
