import { Logger } from '@workforge/logging';
import type { BillingService } from './billing-service.js';

/**
 * 计费定时任务调度器
 *
 * 使用 setInterval 实现简单调度：
 *   - 每小时执行一次计量归集（aggregateUsage）
 *   - 每月 1 日执行出账（generateInvoices）
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface BillingScheduler {
  stop: () => void;
}

export function startBillingScheduler(billingService: BillingService): BillingScheduler {
  const logger = new Logger({ service: 'scheduler', level: 'info' });

  // --- 每小时：计量归集 ---
  // 立即执行一次，然后每小时重复
  billingService.aggregateUsage().catch(err => {
    logger.error('Initial usage aggregation failed', { error: err });
  });

  const hourlyInterval = setInterval(() => {
    billingService.aggregateUsage().catch(err => {
      logger.error('Scheduled usage aggregation failed', { error: err });
    });
  }, HOUR_MS);

  // 月度调度句柄（初始为 null，首次调度后赋值）
  let monthlyInterval: ReturnType<typeof setInterval> | null = null;
  let monthlyTimeout: ReturnType<typeof setTimeout> | null = null;

  // --- 每月 1 日：出账 ---
  // 计算到下个月 1 号的时间间隔，然后每月重复
  // 注意：setTimeout 最大延迟为 2^31-1ms（约24.8天），超过会立即执行
  const scheduleMonthlyInvoice = (): void => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    let delay = nextMonth.getTime() - now.getTime();

    // 安全处理：如果延迟超过 setTimeout 最大值（约24.8天），分阶段等待
    const MAX_TIMEOUT = 2147483647; // 2^31 - 1

    if (delay > MAX_TIMEOUT) {
      // 先等待 MAX_TIMEOUT，然后重新计算
      monthlyTimeout = setTimeout(() => {
        scheduleMonthlyInvoice();
      }, MAX_TIMEOUT);
      return;
    }

    monthlyTimeout = setTimeout(() => {
      // 到达下个月 1 号，执行出账
      billingService.generateInvoices().catch(err => {
        logger.error('Scheduled invoice generation failed', { error: err });
      });

      // 之后每 30 天执行一次（近似月度调度）
      monthlyInterval = setInterval(() => {
        billingService.generateInvoices().catch(err => {
          logger.error('Scheduled invoice generation failed', { error: err });
        });
      }, 30 * DAY_MS);
    }, delay);
  };

  const scheduler: BillingScheduler = {
    stop: () => {
      clearInterval(hourlyInterval);
      if (monthlyInterval !== null) {
        clearInterval(monthlyInterval);
      }
      if (monthlyTimeout !== null) {
        clearTimeout(monthlyTimeout);
      }
      logger.info('Billing scheduler stopped');
    },
  };

  // 启动月度调度
  scheduleMonthlyInvoice();

  logger.info('Billing scheduler started', {
    hourlyAggregation: 'every 1 hour',
    monthlyInvoice: '1st of each month',
  });

  return scheduler;
}
