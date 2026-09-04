export { WorkflowEngine } from './engine.js';
export type { Workflow, WorkflowStep, WorkflowTrigger, WorkflowExecution, WorkflowDefinition } from './engine.js';
export { WorkflowParser } from './parser.js';
export { AgentStep } from './steps/agent.step.js';
export type { AgentStepConfig } from './steps/agent.step.js';
export { ToolStep } from './steps/tool.step.js';
export type { ToolStepConfig } from './steps/tool.step.js';
export { ConditionStep } from './steps/condition.step.js';
export type { ConditionStepConfig } from './steps/condition.step.js';
export { ParallelStep } from './steps/parallel.step.js';
export type { ParallelStepConfig } from './steps/parallel.step.js';

export interface WorkflowContext {
  input: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  variables: Map<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  previousResults: Map<string, any>;
}