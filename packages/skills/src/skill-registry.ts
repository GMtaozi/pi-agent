export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  capabilities: string[];
  tools: string[];
  config?: Record<string, unknown>;
  prompt?: string;
  category?: string;
  /** 沙箱工具实现：接收 input 的函数表达式字符串 */
  code?: string;
  /** 工具入参 JSON Schema（缺省时使用自由 object 入参） */
  parameters?: Record<string, unknown>;
}

export interface SkillConfig {
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface Skill {
  manifest: SkillManifest;
  config: SkillConfig;
  loadedAt: string;
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private enabledSkills = new Set<string>();

  register(skill: Skill) {
    this.skills.set(skill.manifest.id, skill);
    if (skill.config.enabled) {
      this.enabledSkills.add(skill.manifest.id);
    }
  }

  unregister(id: string) {
    this.skills.delete(id);
    this.enabledSkills.delete(id);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  listEnabled(): Skill[] {
    return this.list().filter(s => s.config.enabled);
  }

  enable(id: string) {
    const skill = this.skills.get(id);
    if (skill) {
      skill.config.enabled = true;
      this.enabledSkills.add(id);
    }
  }

  disable(id: string) {
    const skill = this.skills.get(id);
    if (skill) {
      skill.config.enabled = false;
      this.enabledSkills.delete(id);
    }
  }

  isEnabled(id: string): boolean {
    return this.enabledSkills.has(id);
  }

  getEnabledCapabilities(): string[] {
    const capabilities = new Set<string>();
    for (const skill of this.listEnabled()) {
      for (const cap of skill.manifest.capabilities) {
        capabilities.add(cap);
      }
    }
    return Array.from(capabilities);
  }

  getEnabledTools(): string[] {
    const tools = new Set<string>();
    for (const skill of this.listEnabled()) {
      for (const tool of skill.manifest.tools) {
        tools.add(tool);
      }
    }
    return Array.from(tools);
  }

  reset() {
    this.skills.clear();
    this.enabledSkills.clear();
  }
}
