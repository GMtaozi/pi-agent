
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
        constructor();
        createTask(name: string, nodes: any[], edges: any[]): OrchestrationTask;
        runTask(taskId: string): Promise<OrchestrationResult>;
        listTasks(): OrchestrationTask[];
        getTask(taskId: string): OrchestrationTask | undefined;
        cancelTask(taskId: string): boolean;
        getWorkerStats(): any;
      }
    