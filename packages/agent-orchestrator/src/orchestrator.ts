import { Logger } from '@workforge/logging';
import { TaskGraph, TaskNode, TaskGraphBuilder, TaskGraphExecutor } from './task-graph.js';
import { WorkerPool, WorkerTask, WorkerConfig } from './worker-pool.js';

export interface OrchestrationTask {
  id: string;
  name: string;
  graph: TaskGraph;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
}

export interface OrchestrationResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  results: Record<string, unknown>;
  errors: Array<{ nodeId: string; error: string }>;
  duration: number;
}

export class Orchestrator {
  private tasks = new Map<string, OrchestrationTask>();
  private workerPool: WorkerPool;
  private logger: Logger;
  private defaultWorkers: WorkerConfig[] = [
    { id: 'worker-general', type: 'general', capabilities: ['read', 'write', 'edit', 'bash'] },
    { id: 'worker-code', type: 'code', capabilities: ['read', 'write', 'edit', 'bash', 'generate_image'] },
    { id: 'worker-research', type: 'research', capabilities: ['read', 'web_search'] }
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  constructor(agentEngine?: any) {
    this.logger = new Logger({ service: 'orchestrator', level: 'info' });
    this.workerPool = new WorkerPool(agentEngine);
    this.registerDefaultWorkers();
  }

  private registerDefaultWorkers(): void {
    for (const worker of this.defaultWorkers) {
      this.workerPool.registerWorker(worker);
    }
    this.logger.info('Default workers registered', { count: this.defaultWorkers.length });
  }

  registerWorker(config: WorkerConfig): void {
    this.workerPool.registerWorker(config);
  }

  createTask(name: string, nodes: Omit<TaskNode, 'status'>[], edges: Array<{ from: string; to: string; condition?: string }>): OrchestrationTask {
    const id = 'orch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const builder = new TaskGraphBuilder(id, name);
    
    for (const node of nodes) {
      builder.addNode(node);
    }
    
    for (const edge of edges) {
      builder.addEdge(edge.from, edge.to, edge.condition);
    }

    const task: OrchestrationTask = {
      id,
      name,
      graph: builder.build(),
      status: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(id, task);
    this.logger.info('Orchestration task created', { id, name, nodes: nodes.length });
    return task;
  }

  async runTask(taskId: string): Promise<OrchestrationResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found: ' + taskId);
    }

    const startTime = Date.now();
    task.status = 'running';
    task.updatedAt = new Date().toISOString();

    this.logger.info('Orchestration task started', { taskId, name: task.name });

    try {
      const executor = new TaskGraphExecutor(task.graph);
      const result = await executor.execute(async (node: TaskNode) => {
        this.logger.info('Executing node', { taskId, nodeId: node.id, type: node.type });
        
        const workerTask: WorkerTask = {
          id: node.id,
          config: {
            id: 'worker-' + node.id,
            type: node.type === 'agent' ? 'general' : 'general',
            capabilities: Object.keys(node.config)
          },
          input: node.config
        };

        const workerResult = await this.workerPool.executeTask(workerTask);
        
        if (workerResult.status === 'failed') {
          throw new Error(workerResult.error || 'Worker execution failed');
        }

        return workerResult.result;
      });

      task.result = executor.getResults();
      task.status = result.status === 'completed' ? 'completed' : 'failed';
      task.updatedAt = new Date().toISOString();

      const orchestrationResult: OrchestrationResult = {
        taskId,
        status: result.status === 'completed' ? 'success' : 'failed',
        results: Object.fromEntries(executor.getResults()),
        errors: [],
        duration: Date.now() - startTime
      };

      this.logger.info('Orchestration task completed', { 
        taskId, 
        status: orchestrationResult.status, 
        duration: orchestrationResult.duration 
      });

      return orchestrationResult;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date().toISOString();

      this.logger.error('Orchestration task failed', { taskId, error: task.error });

      return {
        taskId,
        status: 'failed',
        results: {},
        errors: [{ nodeId: 'unknown', error: task.error }],
        duration: Date.now() - startTime
      };
    }
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') {
      return false;
    }

    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();
    this.logger.info('Orchestration task cancelled', { taskId });
    return true;
  }

  getTask(taskId: string): OrchestrationTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): OrchestrationTask[] {
    return Array.from(this.tasks.values());
  }

  getWorkerStats() {
    return this.workerPool.getStats();
  }
}