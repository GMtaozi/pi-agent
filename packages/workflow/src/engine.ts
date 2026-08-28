export interface WorkflowContext {
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  variables: Map<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  previousResults: Map<string, any>;
}

import { Logger } from '@workforge/logging';
import { Orchestrator } from './types/orchestrator.js';

export interface WorkflowStep {
  id: string;
  type: 'agent' | 'tool' | 'condition' | 'parallel';
  config: Record<string, unknown>;
  next?: string | string[];
  condition?: string;
}

export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event';
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  steps: Array<{
    id: string;
    type: 'agent' | 'tool' | 'condition' | 'parallel';
    config: Record<string, unknown>;
    next?: string | string[];
    condition?: string;
  }>;
  triggers: WorkflowTrigger[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export class WorkflowEngine {
  private workflows = new Map<string, Workflow>();
  private executions = new Map<string, WorkflowExecution>();
  private orchestrator: Orchestrator;
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'workflow', level: 'info' });
    this.orchestrator = new Orchestrator();
  }

  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
    this.logger.info('Workflow registered', { id: workflow.id, name: workflow.name, steps: workflow.steps.length });
  }

  async executeWorkflow(workflowId: string, input: Record<string, unknown> = {}): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found: ' + workflowId);
    }

    const executionId = 'exec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      status: 'running',
      input,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString()
    };

    this.executions.set(executionId, execution);
    this.logger.info('Workflow execution started', { executionId, workflowId });

    try {
      // Convert workflow steps to task graph
      const nodes = workflow.steps.map(step => ({
        id: step.id,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
        type: step.type as any,
        config: { ...step.config, input },
        dependencies: this.findDependencies(step.id, workflow.steps)
      }));

      const edges = workflow.steps.flatMap(step => {
        const next = step.next || [];
        const targets = Array.isArray(next) ? next : [next];
        return targets.map(target => ({
          from: step.id,
          to: target,
          condition: step.condition
        }));
      });

      const task = this.orchestrator.createTask(workflow.name, nodes, edges);
      const result = await this.orchestrator.runTask(task.id);

      execution.status = result.status === 'success' ? 'completed' : 'failed';
      execution.result = result.results;
      execution.error = result.status === 'failed' ? 'Task execution failed' : undefined;
      execution.completedAt = new Date().toISOString();

      this.logger.info('Workflow execution completed', { 
        executionId, 
        status: execution.status, 
        duration: Date.now() - new Date(execution.startedAt!).getTime()
      });

      return execution;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date().toISOString();

      this.logger.error('Workflow execution failed', { executionId, error: execution.error });
      return execution;
    }
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  listExecutions(workflowId?: string): WorkflowExecution[] {
    const executions = Array.from(this.executions.values());
    if (workflowId) {
      return executions.filter(e => e.workflowId === workflowId);
    }
    return executions;
  }

  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    this.logger.info('Workflow execution cancelled', { executionId });
    return true;
  }

  private findDependencies(stepId: string, steps: WorkflowStep[]): string[] {
    const deps: string[] = [];
    for (const step of steps) {
      const next = Array.isArray(step.next) ? step.next : step.next ? [step.next] : [];
      if (next.includes(stepId)) {
        deps.push(step.id);
      }
    }
    return deps;
  }
}