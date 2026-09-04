import { WorkflowStep, WorkflowContext } from '../engine.js';

export interface ConditionStepConfig {
  expression: string;
  trueNext?: string;
  falseNext?: string;
}

export class ConditionStep {
  async evaluate(expression: string, context: WorkflowContext): Promise<boolean> {
    // Simple condition evaluation
    // In production, use a proper expression evaluator
    try {
      const sanitized = expression.replace(/[^a-zA-Z0-9_$.]/g, '');
      const parts = sanitized.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let value: any = context;
      
      for (const part of parts) {
        value = value?.[part];
      }
      
      return Boolean(value);
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  async execute(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const config = step.config as unknown as ConditionStepConfig;
    const result = await this.evaluate(config.expression, context);
    
    return {
      type: 'condition_result',
      expression: config.expression,
      result,
      next: result ? config.trueNext : config.falseNext,
      timestamp: new Date().toISOString()
    };
  }
}