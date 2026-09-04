import { describe, it, expect } from 'vitest';
import { WorkflowParser } from '../parser';

describe('WorkflowParser', () => {
  it('should parse valid JSON workflow', () => {
    const json = JSON.stringify({
      id: 'test-workflow',
      name: 'Test Workflow',
      description: 'A test workflow',
      steps: [
        { id: 'step1', type: 'agent', config: { prompt: 'Hello' } },
        { id: 'step2', type: 'tool', config: { tool: 'readFile' }, next: 'step1' }
      ],
      triggers: [{ type: 'manual' }]
    });

    const workflow = WorkflowParser.fromJSON(json);
    expect(workflow.id).toBe('test-workflow');
    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.triggers).toHaveLength(1);
  });

  it('should reject workflow without id', () => {
    const json = JSON.stringify({
      name: 'Test',
      steps: []
    });

    expect(() => WorkflowParser.fromJSON(json)).toThrow('must have an id');
  });

  it('should reject workflow without name', () => {
    const json = JSON.stringify({
      id: 'test',
      steps: []
    });

    expect(() => WorkflowParser.fromJSON(json)).toThrow('must have a name');
  });

  it('should reject workflow without steps', () => {
    const json = JSON.stringify({
      id: 'test',
      name: 'Test'
    });

    expect(() => WorkflowParser.fromJSON(json)).toThrow('at least one step');
  });

  it('should reject invalid step references', () => {
    const json = JSON.stringify({
      id: 'test',
      name: 'Test',
      steps: [
        { id: 'step1', type: 'agent', config: {}, next: 'nonexistent' }
      ]
    });

    expect(() => WorkflowParser.fromJSON(json)).toThrow('references non-existent step');
  });

  it('should convert workflow back to JSON', () => {
    const json = JSON.stringify({
      id: 'test',
      name: 'Test',
      steps: [{ id: 'step1', type: 'agent', config: { prompt: 'Hello' } }],
      triggers: []
    });

    const workflow = WorkflowParser.fromJSON(json);
    const output = WorkflowParser.toJSON(workflow);
    const parsed = JSON.parse(output);

    expect(parsed.id).toBe('test');
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.triggers).toHaveLength(0);
  });
});

describe('WorkflowParser YAML', () => {
  it('should parse simple YAML workflow', () => {
    const yaml = `
      id: test-workflow
      name: Test Workflow
      description: A test
      steps:
        - id: step1
          type: agent
          config:
            prompt: Hello
    `;

    const workflow = WorkflowParser.fromYAML(yaml);
    expect(workflow.id).toBe('test-workflow');
    expect(workflow.name).toBe('Test Workflow');
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0].type).toBe('agent');
  });
});
