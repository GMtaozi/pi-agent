export interface Preset {
  id: string;
  name: string;
  description: string;
  mode: 'standard' | 'ptc';
  tools: string[];
  systemPrompt: string;
  context: {
    maxFiles: number;
    includeStructure: boolean;
    includeRecentChanges: boolean;
  };
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresetConfig {
  name: string;
  description: string;
  mode: 'standard' | 'ptc';
  tools?: string[];
  systemPrompt?: string;
  context?: Partial<Preset['context']>;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'standard',
    name: '标准模式',
    description: '通用软件工程助手，支持文件操作、Shell 命令和网络搜索',
    mode: 'standard',
    tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'bash', 'web_search', 'web_fetch'],
    systemPrompt: `You are WorkForge, an expert software engineer assistant.

## Core Principles
- You are a professional software engineer assistant specializing in code engineering tasks
- Always read and understand the workspace files before making changes
- Follow project coding standards and conventions
- Make minimal, focused changes - one thing at a time
- Verify your changes by reading the modified files

## Tool Usage
- Use file tools (read_file, write_file, edit_file, list_directory) for file operations
- Use bash for shell commands (git, npm, node, etc.)
- Use web_search for finding documentation or solutions
- Use create_plan for complex tasks

## Safety
- Never execute destructive commands without explicit user approval
- Always confirm before deleting or overwriting files
- Respect workspace boundaries - only operate within the project directory`,
    context: {
      maxFiles: 10,
      includeStructure: true,
      includeRecentChanges: true
    },
    builtin: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'ptc',
    name: 'PTC 模式',
    description: '增强型编程模式，支持 TypeScript 程序化执行',
    mode: 'ptc',
    tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'bash', 'web_search', 'web_fetch', 'runTypeScript'],
    systemPrompt: `You are WorkForge, an expert software engineer assistant with TypeScript programmatic capabilities.

## Core Principles
- You are a professional software engineer assistant specializing in code engineering tasks
- Always read and understand the workspace files before making changes
- Follow project coding standards and conventions
- Make minimal, focused changes - one thing at a time
- Verify your changes by reading the modified files

## Tool Usage
- Use file tools (read_file, write_file, edit_file, list_directory) for file operations
- Use bash for shell commands (git, npm, node, etc.)
- Use web_search for finding documentation or solutions
- Use runTypeScript for complex multi-step operations (PTC mode only)

## TypeScript Execution (PTC Mode)
- You can execute TypeScript code snippets using runTypeScript
- Use this for complex refactoring, batch operations, or data transformation
- Always validate the results of executed code
- Remember: executed code runs in a restricted environment with workspace access

## Safety
- Never execute destructive commands without explicit user approval
- Always confirm before deleting or overwriting files
- Respect workspace boundaries - only operate within the project directory`,
    context: {
      maxFiles: 20,
      includeStructure: true,
      includeRecentChanges: true
    },
    builtin: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export class PresetRegistry {
  private presets: Map<string, Preset> = new Map();
  private userPresets: Map<string, Preset> = new Map();

  constructor() {
    // Register builtin presets
    for (const preset of BUILTIN_PRESETS) {
      this.presets.set(preset.id, preset);
    }
  }

  get(id: string): Preset | undefined {
    return this.presets.get(id) || this.userPresets.get(id);
  }

  list(): Preset[] {
    return [
      ...Array.from(this.presets.values()),
      ...Array.from(this.userPresets.values())
    ];
  }

  listByMode(mode: 'standard' | 'ptc'): Preset[] {
    return this.list().filter(p => p.mode === mode);
  }

  register(preset: Preset): void {
    if (preset.builtin) {
      this.presets.set(preset.id, preset);
    } else {
      this.userPresets.set(preset.id, preset);
    }
  }

  unregister(id: string): boolean {
    if (this.userPresets.has(id)) {
      this.userPresets.delete(id);
      return true;
    }
    return false;
  }

  isBuiltin(id: string): boolean {
    return this.presets.has(id);
  }
}

export const presetRegistry = new PresetRegistry();
