import { SkillManifest, Skill } from './skill-registry.js';
import { Logger } from '@workforge/logging';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SkillDirectory {
  id: string;
  path: string;
  manifest: SkillManifest;
}

export class SkillLoader {
  private logger: Logger;
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.logger = new Logger({ service: 'skill-loader', level: 'info' });
    this.skillsDir = skillsDir || join(__dirname, '..', '..', 'skills');
  }

  loadAll(): Skill[] {
    const skills: Skill[] = [];

    if (!existsSync(this.skillsDir)) {
      this.logger.warn('Skills directory not found', { path: this.skillsDir });
      return skills;
    }

    const directories = readdirSync(this.skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of directories) {
      try {
        const skill = this.loadSkill(join(this.skillsDir, dir));
        if (skill) {
          skills.push(skill);
          this.logger.info('Loaded skill', { id: skill.manifest.id, name: skill.manifest.name });
        }
      } catch (err) {
        this.logger.error('Failed to load skill', { dir, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return skills;
  }

  loadSkill(skillPath: string): Skill | null {
    const manifestPath = join(skillPath, 'skill.json');

    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifestRaw = readFileSync(manifestPath, 'utf8');
      const manifest: SkillManifest = JSON.parse(manifestRaw);

      return {
        manifest,
        config: { enabled: true },
        loadedAt: new Date().toISOString()
      };
    } catch (err) {
      this.logger.error('Failed to parse skill manifest', { path: skillPath, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  loadFromDirectory(dir: string): Skill[] {
    const skills: Skill[] = [];

    if (!existsSync(dir)) {
      return skills;
    }

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skill = this.loadSkill(join(dir, entry.name));
        if (skill) {
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }
}