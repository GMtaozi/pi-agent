import pino from 'pino';

export const logger = pino({
  level: 'info',
  formatters: {
    log: (log) => {
      return {
        ts: new Date(log.time as number).toISOString(),
        level: log.level,
        msg: log.msg,
        ...(log.data && typeof log.data === 'object' ? log.data : { data: log.data }),
      };
    },
  },
});

export type VendorLogger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  info: (msg: string, meta?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  error: (msg: string, meta?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  warn: (msg: string, meta?: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  debug: (msg: string, meta?: any) => void;
};

export const createVendorLogger = (sessionId?: string): VendorLogger => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  info: (msg: string, meta?: any) =>
    logger.info({ sessionId, vendor: 'pi', ...meta }, msg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  error: (msg: string, meta?: any) =>
    logger.error({ sessionId, vendor: 'pi', ...meta }, msg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  warn: (msg: string, meta?: any) =>
    logger.warn({ sessionId, vendor: 'pi', ...meta }, msg),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  debug: (msg: string, meta?: any) =>
    logger.debug({ sessionId, vendor: 'pi', ...meta }, msg),
});

export default logger;
