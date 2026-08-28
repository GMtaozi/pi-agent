import { SkillRegistry, SkillManifest, Skill } from './skill-registry.js';
import { SkillLoader } from './skill-loader.js';
import { Logger } from '@workforge/logging';

export class SkillsService {
  private registry = new SkillRegistry();
  private loader: SkillLoader;
  private logger: Logger;

  constructor(skillsDir?: string) {
    this.loader = new SkillLoader(skillsDir);
    this.logger = new Logger({ service: 'skills', level: 'info' });

    // Load skills on init
    this.reload();
  }

  reload(): void {
    this.registry.reset();
    const skills = this.loader.loadAll();

    for (const skill of skills) {
      this.registry.register(skill);
    }

    this.logger.info('Skills reloaded', { count: skills.length });
  }

  list() {
    return this.registry.list();
  }

  listEnabled() {
    return this.registry.listEnabled();
  }

  get(id: string) {
    return this.registry.get(id);
  }

  enable(id: string): boolean {
    const skill = this.registry.get(id);
    if (!skill) return false;

    this.registry.enable(id);
    this.logger.info('Skill enabled', { id });
    return true;
  }

  disable(id: string): boolean {
    const skill = this.registry.get(id);
    if (!skill) return false;

    this.registry.disable(id);
    this.logger.info('Skill disabled', { id });
    return true;
  }

  /** Register a skill directly from a manifest (e.g. loaded from the market database). */
  registerManifest(manifest: SkillManifest): Skill {
    const skill: Skill = {
      manifest,
      config: { enabled: true },
      loadedAt: new Date().toISOString()
    };
    this.registry.register(skill);
    this.logger.info('Skill registered from manifest', { id: manifest.id, name: manifest.name });
    return skill;
  }

  /** Remove a previously registered manifest-based skill. */
  unregisterManifest(id: string): boolean {
    const skill = this.registry.get(id);
    if (!skill) return false;
    this.registry.unregister(id);
    this.logger.info('Skill unregistered', { id });
    return true;
  }

  getEnabledCapabilities(): string[] {
    return this.registry.getEnabledCapabilities();
  }

  /** 已启用且带沙箱代码的技能，可注册为 Agent 可调用工具。 */
  getExecutableSkills(): Array<{
    id: string;
    name: string;
    description: string;
    code: string;
    parameters?: Record<string, unknown>;
  }> {
    return this.listEnabled()
      .filter(s => !!s.manifest.code)
      .map(s => ({
        id: s.manifest.id,
        name: s.manifest.name,
        description: s.manifest.description,
        code: s.manifest.code!,
        parameters: s.manifest.parameters,
      }));
  }

  getEnabledTools(): string[] {
    return this.registry.getEnabledTools();
  }

  isEnabled(id: string): boolean {
    return this.registry.isEnabled(id);
  }
}