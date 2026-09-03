import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Logger } from '../src/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log info message', () => {
    logger = new Logger({ service: 'test' });
    logger.info('Hello world');
    expect(console.info).toHaveBeenCalled();
  });

  it('should log warn message', () => {
    logger = new Logger({ service: 'test' });
    logger.warn('Warning message');
    expect(console.warn).toHaveBeenCalled();
  });

  it('should log error message', () => {
    logger = new Logger({ service: 'test' });
    logger.error('Error occurred');
    expect(console.error).toHaveBeenCalled();
  });

  it('should log debug message when level is debug', () => {
    logger = new Logger({ service: 'test', level: 'debug' });
    logger.debug('Debug message');
    expect(console.debug).toHaveBeenCalled();
  });

  it('should not log debug when level is info', () => {
    logger = new Logger({ service: 'test', level: 'info' });
    logger.debug('Should not appear');
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('should call onLog callback', () => {
    const onLog = vi.fn();
    logger = new Logger({ service: 'test', onLog });
    logger.info('Test callback');
    expect(onLog).toHaveBeenCalled();
    expect(onLog.mock.calls[0][0].level).toBe('info');
    expect(onLog.mock.calls[0][0].message).toBe('Test callback');
  });

  it('should include context in log', () => {
    const onLog = vi.fn();
    logger = new Logger({ service: 'test', onLog });
    logger.info('Test', { foo: 'bar' });
    expect(onLog.mock.calls[0][0].context).toEqual({ foo: 'bar' });
  });

  it('should include error message', () => {
    const onLog = vi.fn();
    logger = new Logger({ service: 'test', onLog });
    logger.error('Error', undefined, new Error('test error'));
    expect(onLog.mock.calls[0][0].error).toBe('test error');
  });

  it('should set default level to info', () => {
    logger = new Logger({ service: 'test' });
    expect(logger['level']).toBe('info');
  });

  it('should include timestamp', () => {
    const onLog = vi.fn();
    logger = new Logger({ service: 'test', onLog });
    logger.info('Test');
    const entry = onLog.mock.calls[0][0];
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
