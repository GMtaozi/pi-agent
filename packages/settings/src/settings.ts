import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AppSettings {
  apiKeys: Record<string, string>;
  theme: 'light' | 'dark';
  workspacePath?: string;
  customProviders?: Array<{
    id: string;
    name: string;
    baseURL: string;
    api?: string;
    models: Array<{ id: string; name: string }>;
  }>;
}

interface EncryptedPayload {
  iv: string;
  data: string;
  authTag: string;
}

export class SettingsService {
  private settings: AppSettings = {
    apiKeys: {},
    theme: 'dark',
    customProviders: []
  };

  private readonly configPath: string;
  private readonly saltPath: string;
  private readonly masterKey: Buffer;
  /** 是否完成过一次成功加载。失败时拒绝 save()，防止用内存默认值覆盖磁盘上的有效配置 */
  private loadedOk = false;
  private loadAttempted = false;

  constructor() {
    // Use app data directory for config storage
    const appDataDir = join(homedir(), '.workforge');
    if (!existsSync(appDataDir)) {
      mkdirSync(appDataDir, { recursive: true });
    }
    this.configPath = join(appDataDir, 'config.json.enc');
    this.saltPath = join(appDataDir, 'config.salt');

    // Derive master key from a per-install random salt (persisted) and an
    // optional operator-provided secret. A static salt would let identical
    // machines decrypt each other's config, so we generate a unique one.
    const salt = this.loadOrCreateSalt();
    const passphrase = process.env.CONFIG_MASTER_SECRET
      ? 'workforge-' + process.env.CONFIG_MASTER_SECRET
      : 'workforge-' + this.getMachineId();
    this.masterKey = scryptSync(passphrase, salt, 32);
    // 启动时加载已持久化的配置，否则 getSettings() 在首次 getApiKey() 之前
    // 一直返回内存默认值，导致已保存的主题/供应商等配置"丢失"。
    this.load();
  }

  private loadOrCreateSalt(): Buffer {
    try {
      if (existsSync(this.saltPath)) {
        const stored = readFileSync(this.saltPath);
        if (stored.length >= 16) return stored;
      }
    } catch {
      // fall through to (re)create
    }
    const salt = randomBytes(16);
    try {
      writeFileSync(this.saltPath, salt);
    } catch {
      // Non-fatal: an in-memory salt still avoids the static-salt weakness.
    }
    return salt;
  }

  private getMachineId(): string {
    // Simple machine identifier
    // In production, use a proper machine ID
    return process.platform + '-' + process.arch + '-' + (process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown');
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  setTheme(theme: 'light' | 'dark') {
    this.settings.theme = theme;
    this.save();
  }

  setApiKey(provider: string, key: string) {
    this.settings.apiKeys[provider] = key.trim();
    this.save();
  }

  getApiKey(provider: string): string | undefined {
    // Try memory first
    if (this.settings.apiKeys[provider]) {
      return this.settings.apiKeys[provider].trim();
    }
    // Load from disk (仅尝试一次，失败后不再反复触发)
    this.load();
    const key = this.settings.apiKeys[provider];
    return key ? key.trim() : undefined;
  }

  removeApiKey(provider: string): boolean {
    if (!(provider in this.settings.apiKeys)) {
      return false;
    }
    delete this.settings.apiKeys[provider];
    this.save();
    return true;
  }

  removeCustomProvider(providerId: string): boolean {
    if (!this.settings.customProviders) {
      return false;
    }
    const index = this.settings.customProviders.findIndex(p => p.id === providerId);
    if (index >= 0) {
      this.settings.customProviders.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  addCustomProvider(provider: { id: string; name: string; baseURL: string; apiKey?: string; api?: string; models: Array<{ id: string; name: string }> }) {
    if (!this.settings.customProviders) {
      this.settings.customProviders = [];
    }
    const index = this.settings.customProviders.findIndex(p => p.id === provider.id);
    const entry = {
      id: provider.id,
      name: provider.name,
      baseURL: provider.baseURL,
      api: provider.api,
      models: provider.models
    };
    if (index >= 0) {
      this.settings.customProviders[index] = entry;
    } else {
      this.settings.customProviders.push(entry);
    }
    this.save();
  }

  private save(): void {
    // 防护：磁盘上存在配置但本进程从未成功解密过时，绝不能用内存默认值覆盖它
    if (!this.loadedOk && existsSync(this.configPath)) {
      console.error('[settings] 拒绝保存：现有配置在本进程中无法解密，避免用默认值覆盖。请检查 config.salt / CONFIG_MASTER_SECRET 是否变更。');
      return;
    }
    try {
      const payload = JSON.stringify(this.settings);
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);

      let encrypted = cipher.update(payload, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag().toString('hex');

      const encryptedPayload: EncryptedPayload = {
        iv: iv.toString('hex'),
        data: encrypted,
        authTag: authTag
      };

      // 原子写入（临时文件 + 重命名），并保留上一份可用副本用于恢复
      const tmpPath = this.configPath + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(encryptedPayload), 'utf8');
      if (existsSync(this.configPath)) {
        try {
          copyFileSync(this.configPath, this.configPath + '.bak');
        } catch {
          // 备份失败不阻塞主写入
        }
      }
      renameSync(tmpPath, this.configPath);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  private load(): void {
    if (this.loadAttempted) {
      return;
    }
    this.loadAttempted = true;
    try {
      if (!existsSync(this.configPath)) {
        this.loadedOk = true;
        return;
      }

      const encryptedPayload = JSON.parse(readFileSync(this.configPath, 'utf8')) as EncryptedPayload;
      const decipher = createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(encryptedPayload.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(encryptedPayload.authTag, 'hex'));

      let decrypted = decipher.update(encryptedPayload.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // 与默认值合并，兼容缺少新增字段的历史配置文件
      const parsed = JSON.parse(decrypted) as Partial<AppSettings>;
      this.settings = {
        ...this.settings,
        ...parsed,
        apiKeys: parsed.apiKeys ?? this.settings.apiKeys,
        theme: parsed.theme === 'light' ? 'light' : 'dark'
      };
      this.loadedOk = true;
    } catch (_error) {
      // 无法解密/损坏的文件按"无配置"继续运行，但必须保护磁盘原文件：
      // 留存一份损坏副本供人工恢复，且 loadedOk=false 会阻止 save() 覆盖它。
      console.warn('Settings file could not be decrypted; starting with defaults. The original file is preserved and will NOT be overwritten.');
      try {
        if (existsSync(this.configPath)) {
          const preserved = this.configPath + '.undecryptable-' + Date.now();
          copyFileSync(this.configPath, preserved);
          console.warn('A copy of the unreadable config was saved to:', preserved);
        }
      } catch {
        // 保留失败也不影响默认启动
      }
    }
  }
}