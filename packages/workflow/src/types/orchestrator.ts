export interface OrchestrationTask {
  id: string;
  name: string;
  status: string;
}
export interface OrchestrationResult {
  taskId: string;
  status: string;
  results: Record<string, unknown>;
}

export class Orchestrator {
  constructor() {}
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  createTask(name: string, _nodes: any[], _edges: any[]): OrchestrationTask {
    return {
      id: 'mock-' + Date.now(),
      name,
      status: 'idle'
    } as OrchestrationTask;
  }
  async runTask(taskId: string): Promise<OrchestrationResult> {
    return {
      taskId,
      status: 'success',
      results: {},
      duration: 0
    } as OrchestrationResult;
  }
  listTasks(): OrchestrationTask[] { return []; }
  getTask(_taskId: string): OrchestrationTask | undefined { return undefined; }
  cancelTask(_taskId: string): boolean { return false; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  getWorkerStats(): any { return {}; }
}