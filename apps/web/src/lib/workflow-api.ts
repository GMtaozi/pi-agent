import { authedFetch } from '../lib/api';

// Workflow management
export async function listWorkflows(): Promise<any[]> {
  const res = await authedFetch('/workflows');
  if (!res.ok) return [];
  const data = await res.json();
  return data.workflows || [];
}

export async function getWorkflow(id: string): Promise<any> {
  const res = await authedFetch(`/workflows/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Workflow not found');
  return res.json();
}

export async function saveWorkflow(workflow: {
  id?: string;
  name: string;
  description?: string;
  steps: any[];
  triggers?: any[];
}): Promise<any> {
  const url = workflow.id ? `/workflows/${encodeURIComponent(workflow.id)}` : '/workflows';
  const method = workflow.id ? 'PUT' : 'POST';
  const res = await authedFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) throw new Error('Failed to save workflow');
  return res.json();
}

export async function deleteWorkflow(id: string): Promise<void> {
  await authedFetch(`/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function executeWorkflow(id: string, input: Record<string, any> = {}): Promise<any> {
  const res = await authedFetch(`/workflows/${encodeURIComponent(id)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error('Failed to execute workflow');
  return res.json();
}

export async function getWorkflowExecution(workflowId: string, executionId: string): Promise<any> {
  const res = await authedFetch(
    `/workflows/${encodeURIComponent(workflowId)}/executions/${encodeURIComponent(executionId)}`
  );
  if (!res.ok) throw new Error('Execution not found');
  return res.json();
}

export async function listWorkflowExecutions(workflowId: string): Promise<any[]> {
  const res = await authedFetch(`/workflows/${encodeURIComponent(workflowId)}/executions`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.executions || [];
}

// Orchestrator
export async function listOrchestratorTasks(): Promise<any[]> {
  const res = await authedFetch('/orchestrator/tasks');
  if (!res.ok) return [];
  const data = await res.json();
  return data.tasks || [];
}

export async function createOrchestratorTask(name: string, nodes: any[], edges: any[]): Promise<any> {
  const res = await authedFetch('/orchestrator/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, nodes, edges }),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function runOrchestratorTask(taskId: string): Promise<any> {
  const res = await authedFetch(`/orchestrator/tasks/${encodeURIComponent(taskId)}/run`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to run task');
  return res.json();
}
