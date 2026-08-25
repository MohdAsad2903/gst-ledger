import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from './logger';

describe('Logger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gst-logger-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates log file and writes structured entries', () => {
    const logger = new Logger({ logsDir: tempDir });
    logger.info('Application started', { version: '0.1.0' });

    const files = fs.readdirSync(tempDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^gst-ledger-\d{4}-\d{2}-\d{2}\.log$/);

    const logFile = path.join(tempDir, files[0]!);
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('[INFO] Application started');
    expect(content).toContain('"version":"0.1.0"');
  });

  it('redacts financial details at info level', () => {
    const logger = new Logger({ logsDir: tempDir });
    logger.info('Bill recorded', {
      billAmount: 5000,
      partyName: 'ABC Tool',
      gstin: '09AAOPI4018G1ZP',
    });

    const files = fs.readdirSync(tempDir);
    const logFile = path.join(tempDir, files[0]!);
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('[REDACTED_FINANCIAL_DETAIL]');
    expect(content).not.toContain('5000');
    expect(content).not.toContain('ABC Tool');
  });

  it('preserves financial details at debug level', () => {
    const logger = new Logger({ logsDir: tempDir });
    logger.debug('Calculation trace', { billAmount: 5000 });

    const files = fs.readdirSync(tempDir);
    const logFile = path.join(tempDir, files[0]!);
    const content = fs.readFileSync(logFile, 'utf8');
    expect(content).toContain('"billAmount":5000');
  });
});
