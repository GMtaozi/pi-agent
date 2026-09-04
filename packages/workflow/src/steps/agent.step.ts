import { WorkflowStep, WorkflowContext } from '../engine.js';

export interface AgentStepConfig {
  prompt: string;
  model?: string;
  capabilities?: string[];
}

export class AgentStep {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(step: WorkflowStep, _context: WorkflowContext): Promise<any> {
    const config = step.config as unknown as AgentStepConfig;
    
    // In real implementation, this would call AgentEngine
    // For now, simulate agent execution
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          type: 'agent_result',
          prompt: config.prompt,
          model: config.model || 'deepseek-chat',
          content: 'Agent executed: ' + config.prompt,
          timestamp: new Date().toISOString()
        });
      }, 1000);
    });
  }
}