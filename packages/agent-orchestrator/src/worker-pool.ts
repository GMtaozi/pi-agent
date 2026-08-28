import { Logger } from '@workforge/logging';

export interface WorkerConfig {
  id: string;
  type: 'general' | 'code' | 'research' | 'analysis';
  capabilities: string[];
  maxConcurrentTasks?: number;
}

export interface WorkerTask {
  id: string;
  config: WorkerConfig;
  input: Record<string, unknown>;
  priority?: number;
}

export interface WorkerResult {
  taskId: string;
  workerId: string;
  status: 'success' | 'failed';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
  duration: number;
}

export class WorkerPool {
  private workers = new Map<string, WorkerConfig>();
  private busyWorkers = new Set<string>();
  private taskQueue: WorkerTask[] = [];
  private logger: Logger;
  private results = new Map<string, WorkerResult>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private agentEngine: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(agentEngine?: any) {
    this.logger = new Logger({ service: 'worker-pool', level: 'info' });
    this.agentEngine = agentEngine;
  }

  registerWorker(config: WorkerConfig): void {
    this.workers.set(config.id, config);
    this.logger.info('Worker registered', { id: config.id, type: config.type, capabilities: config.capabilities });
  }

  unregisterWorker(id: string): boolean {
    const result = this.workers.delete(id);
    this.busyWorkers.delete(id);
    this.results.delete(id);
    return result;
  }

  getAvailableWorker(type?: WorkerConfig['type']): string | null {
    for (const [id, config] of this.workers) {
      if (type && config.type !== type) continue;
      if (this.busyWorkers.has(id)) continue;
      return id;
    }
    return null;
  }

  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    const startTime = Date.now();
    const workerId = this.getAvailableWorker(task.config.type);
    
    if (!workerId) {
      this.taskQueue.push(task);
      this.logger.info('Task queued', { taskId: task.id, workerType: task.config.type });
      return {
        taskId: task.id,
        workerId: 'queued',
        status: 'failed',
        error: 'No available workers, task queued',
        duration: 0
      };
    }

    this.busyWorkers.add(workerId);
    this.logger.info('Task started', { taskId: task.id, workerId });

    try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let result: any;
      
      if (this.agentEngine && typeof this.agentEngine.createSession === 'function') {
        // Real execution via AgentEngine
        const sessionId = await this.agentEngine.createSession('deepseek-chat', 'standard', 'default');
        const promptText = task.input?.prompt || task.input?.text || JSON.stringify(task.input);
        const response = await this.agentEngine.prompt(sessionId, promptText);
        result = {
          type: 'agent_result',
          workerId,
          workerType: task.config.type,
          input: task.input,
          output: response,
          timestamp: new Date().toISOString()
        };
      } else {
        // Simulation fallback
        await new Promise(resolve => setTimeout(resolve, 500));
        result = {
          type: 'worker_result',
          workerId,
          workerType: task.config.type,
          input: task.input,
          output: 'Task executed by worker ' + workerId,
          timestamp: new Date().toISOString()
        };
      }

      const workerResult: WorkerResult = {
        taskId: task.id,
        workerId,
        status: 'success',
        result,
        duration: Date.now() - startTime
      };

      this.results.set(task.id, workerResult);
      this.logger.info('Task completed', { taskId: task.id, workerId, duration: workerResult.duration });
      return workerResult;
    } catch (error) {
      const result: WorkerResult = {
        taskId: task.id,
        workerId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
      this.results.set(task.id, result);
      this.logger.error('Task failed', { taskId: task.id, workerId, error: result.error });
      return result;
    } finally {
      this.busyWorkers.delete(workerId);
      this.processQueue();
    }
  }

  async executeBatch(tasks: WorkerTask[], concurrency = 3): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    const executing: Promise<WorkerResult>[] = [];

    for (const task of tasks) {
      const promise = this.executeTask(task);
      executing.push(promise);

      if (executing.length >= concurrency) {
        const result = await Promise.race(executing);
        results.push(result);
        const idx = executing.indexOf(promise);
        if (idx >= 0) {
          executing.splice(idx, 1);
        }
      }
    }

    while (executing.length > 0) {
      const result = await Promise.race(executing);
      results.push(result);
      // Remove the first executing promise (it's the one that resolved)
      executing.shift();
    }

    return results;
  }

  getResult(taskId: string): WorkerResult | undefined {
    return this.results.get(taskId);
  }

  getStats(): { total: number; busy: number; idle: number; queued: number } {
    return {
      total: this.workers.size,
      busy: this.busyWorkers.size,
      idle: this.workers.size - this.busyWorkers.size,
      queued: this.taskQueue.length
    };
  }

  getWorkers(): WorkerConfig[] {
    return Array.from(this.workers.values());
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const task = this.taskQueue.shift();
    if (task) {
      this.executeTask(task);
    }
  }
}