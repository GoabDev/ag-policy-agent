import { SSEEvent, SSEEventType } from '../types';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// SSE clients (Express response objects)
const sseClients: Set<any> = new Set();

export function addSSEClient(res: any) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function broadcast(event: SSEEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function emitEvent(type: SSEEventType, data: any) {
  const event: SSEEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };
  broadcast(event);
  // Also log to console
  const icon = type.includes('failed') ? '❌' : type.includes('completed') ? '✅' : '📡';
  console.log(`${icon} [${type}]`, typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200));
}

export function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌' }[level];
  console.log(`${prefix} [${timestamp}] ${message}`);
  emitEvent('log', { message, level });
}

// Save task log to file
export function saveTaskLog(taskId: string, data: any) {
  try {
    if (!fs.existsSync(config.logsPath)) {
      fs.mkdirSync(config.logsPath, { recursive: true });
    }
    const logFile = path.join(config.logsPath, `${taskId}.json`);
    fs.writeFileSync(logFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save task log:', err);
  }
}

// Load all task logs
export function loadTaskLogs(): any[] {
  try {
    if (!fs.existsSync(config.logsPath)) return [];
    const files = fs.readdirSync(config.logsPath).filter(f => f.endsWith('.json'));
    return files
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(config.logsPath, f), 'utf-8'));
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}