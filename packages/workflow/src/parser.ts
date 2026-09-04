import { Workflow, WorkflowDefinition } from './engine.js';

export class WorkflowParser {
  static fromJSON(json: string): Workflow {
    try {
      const def = JSON.parse(json) as WorkflowDefinition;
      return this.validateAndConvert(def);
    } catch (error) {
      throw new Error('Invalid workflow JSON: ' + (error instanceof Error ? error.message : String(error)), { cause: error });
    }
  }

  static fromYAML(yaml: string): Workflow {
    try {
      const lines = yaml.split('\n');
      const workflow: Partial<WorkflowDefinition> = {
        id: '',
        name: '',
        steps: [],
        triggers: []
      };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let currentStep: any = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (trimmed.startsWith('id:')) {
          if (currentStep) {
            workflow.steps!.push(currentStep);
            currentStep = null;
          }
          workflow.id = trimmed.slice(3).trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('name:')) {
          workflow.name = trimmed.slice(5).trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('description:')) {
          workflow.description = trimmed.slice(12).trim().replace(/['"]/g, '');
        } else if (trimmed.startsWith('- id:')) {
          if (currentStep) {
            workflow.steps!.push(currentStep);
          }
          currentStep = {
            id: trimmed.slice(5).trim().replace(/['"]/g, ''),
            type: 'agent',
            config: {}
          };
        } else if (trimmed.startsWith('type:') && currentStep) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
          currentStep.type = trimmed.slice(5).trim().replace(/['"]/g, '') as any;
        } else if (trimmed.startsWith('next:') && currentStep) {
          const nextValue = trimmed.slice(5).trim().replace(/['"]/g, '');
          currentStep.next = nextValue.split(',').map((s: string) => s.trim());
        } else if (trimmed.startsWith('condition:') && currentStep) {
          currentStep.condition = trimmed.slice(10).trim().replace(/['"]/g, '');
        }
      }

      if (currentStep) {
        workflow.steps!.push(currentStep);
      }

      return this.validateAndConvert(workflow as WorkflowDefinition);
    } catch (error) {
      throw new Error('Invalid workflow YAML: ' + (error instanceof Error ? error.message : String(error)), { cause: error });
    }
  }

  static toJSON(workflow: Workflow): string {
    const def: WorkflowDefinition = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      steps: workflow.steps.map(step => ({
        id: step.id,
        type: step.type,
        config: step.config,
        next: step.next,
        condition: step.condition
      })),
      triggers: workflow.triggers
    };
    return JSON.stringify(def, null, 2);
  }

  private static validateAndConvert(def: WorkflowDefinition): Workflow {
    if (!def.id) throw new Error('Workflow must have an id');
    if (!def.name) throw new Error('Workflow must have a name');
    if (!def.steps || def.steps.length === 0) throw new Error('Workflow must have at least one step');

    // Validate step references
    const stepIds = new Set(def.steps.map(s => s.id));
    for (const step of def.steps) {
      if (step.next) {
        const nextIds = Array.isArray(step.next) ? step.next : [step.next];
        for (const nextId of nextIds) {
          if (!stepIds.has(nextId)) {
            throw new Error('Step ' + step.id + ' references non-existent step: ' + nextId);
          }
        }
      }
    }

    const now = new Date().toISOString();
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      steps: def.steps.map(s => ({
        id: s.id,
        type: s.type,
        config: s.config || {},
        next: s.next,
        condition: s.condition
      })),
      triggers: def.triggers || [],
      createdAt: now,
      updatedAt: now
    };
  }
}