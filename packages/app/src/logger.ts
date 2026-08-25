import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

export interface LoggerOptions {
  logsDir: string;
  retentionDays?: number;
  minLevel?: LogLevel;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private logsDir: string;
  private retentionDays: number;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions) {
    this.logsDir = options.logsDir;
    this.retentionDays = options.retentionDays ?? 30;
    this.minLevel = options.minLevel ?? 'debug';
    this.ensureLogsDir();
    this.cleanOldLogs();
  }

  public getLogsDirectory(): string {
    return this.logsDir;
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getLogFilePath(): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.logsDir, `gst-ledger-${today}.log`);
  }

  /**
   * Cleans up log files older than the retention period (default: 30 days).
   */
  public cleanOldLogs(): void {
    try {
      if (!fs.existsSync(this.logsDir)) {
        return;
      }
      const files = fs.readdirSync(this.logsDir);
      const now = Date.now();
      const maxAgeMs = this.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file.startsWith('gst-ledger-') && file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (err) {
      console.error('Failed to clean old log files:', err);
    }
  }

  /**
   * Sanitizes metadata to ensure financial sensitive fields (bill amounts, party names, GSTIN)
   * never leak into info or higher log levels.
   */
  private sanitizeMeta(
    level: LogLevel,
    meta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!meta) return undefined;
    if (level === 'debug') return meta;

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'billamount',
      'partyname',
      'gstin',
      'totalamount',
      'gstamount',
      'taxableamount',
    ];

    for (const [key, value] of Object.entries(meta)) {
      const lower = key.toLowerCase();
      if (sensitiveKeys.some(s => lower.includes(s))) {
        sanitized[key] = '[REDACTED_FINANCIAL_DETAIL]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const cleanMeta = this.sanitizeMeta(level, meta);
    const entry: LogEntry = {
      timestamp,
      level,
      message,
      ...(cleanMeta && Object.keys(cleanMeta).length > 0 ? { meta: cleanMeta } : {}),
    };

    const formattedLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
      entry.meta ? ' ' + JSON.stringify(entry.meta) : ''
    }\n`;

    try {
      this.ensureLogsDir();
      fs.appendFileSync(this.getLogFilePath(), formattedLine, 'utf8');
    } catch (err) {
      console.error('Failed writing to log file:', err);
    }

    if (level === 'error') {
      console.error(formattedLine.trimEnd());
    } else if (level === 'warn') {
      console.warn(formattedLine.trimEnd());
    } else {
      console.log(formattedLine.trimEnd());
    }
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  public error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }
}

let defaultLogger: Logger | null = null;

export function initLogger(logsDir: string): Logger {
  defaultLogger = new Logger({ logsDir });
  return defaultLogger;
}

export function getLogger(): Logger {
  if (!defaultLogger) {
    throw new Error('Logger has not been initialized. Call initLogger() first.');
  }
  return defaultLogger;
}
