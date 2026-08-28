import { WorkflowStep, WorkflowContext } from '../engine.js';

export interface ToolStepConfig {
  tool: string;
  params: Record<string, unknown>;
}

export class ToolStep {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(step: WorkflowStep, _context: WorkflowContext): Promise<any> {
    const config = step.config as unknown as ToolStepConfig;
    
    // In real implementation, this would call the tool service
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          type: 'tool_result',
          tool: config.tool,
          params: config.params,
          result: 'Tool ' + config.tool + ' executed',
          timestamp: new Date().toISOString()
        });
      }, 500);
    });
  }
}