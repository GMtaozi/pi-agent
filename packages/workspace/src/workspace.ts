import fs from 'fs/promises';
import { watch } from 'chokidar';
import { Logger } from '@workforge/logging';
import { join, dirname, basename, normalize, sep, resolve } from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
}

export interface FileVersion {
  id: string;
  path: string;
  timestamp: string;
  author: 'user' | 'agent';
  changeType: 'create' | 'update' | 'delete';
  size: number;
  snapshotPath: string;
}

export interface Workspace {
  id: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export class WorkspaceService {
  private logger!: Logger;
  private fileCache = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  private watchers = new Map<string, any>();
  private changeListeners = new Map<string, Set<(path: string) => void>>();
  private versions = new Map<string, FileVersion[]>();
  private versionsDir = '.versions';
  private readonly maxVersionsPerFile = 50;
  private workspacePaths = new Map<string, string>();
  private workspaces = new Map<string, Workspace>();
  private persistencePath: string;
  private archive: Set<string> = new Set();

  constructor(persistencePath?: string) {
    this.logger = new Logger({ service: 'workspace', level: 'info' });
    this.persistencePath = persistencePath || join(__dirname, '..', '..', 'workspaces.json');
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  async register(workspaceId: string, workspacePath: string, title?: string): Promise<Workspace> {
    const normalizedPath = normalize(workspacePath);
    this.workspacePaths.set(workspaceId, normalizedPath);

    // Create versions directory
    const versionsPath = join(normalizedPath, this.versionsDir);
    try {
      await fs.mkdir(versionsPath, { recursive: true });
    } catch {
      // Ignore if exists
    }

    // Watch for file changes
    if (this.watchers.has(workspaceId)) {
      this.watchers.get(workspaceId).close();
    }

    const watcher = watch(normalizedPath, {
      ignored: /(^|[/\\])([.]git|node_modules|dist|[.]versions|[.]gitignore)/,
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', (filePath: string) => {
      const relativePath = normalize(filePath).replace(normalizedPath, '').replace(/^[/]/, '');
      this.notifyChange(workspaceId, relativePath);
    });

    watcher.on('add', (filePath: string) => {
      const relativePath = normalize(filePath).replace(normalizedPath, '').replace(/^[/]/, '');
      this.notifyChange(workspaceId, relativePath);
    });

    watcher.on('unlink', (filePath: string) => {
      const relativePath = normalize(filePath).replace(normalizedPath, '').replace(/^[/]/, '');
      this.notifyChange(workspaceId, relativePath);
    });

    this.watchers.set(workspaceId, watcher);

    const workspace: Workspace = {
      id: workspaceId,
      path: normalizedPath,
      title: title || basename(normalizedPath) || workspaceId,
      sessionIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.workspaces.set(workspaceId, workspace);
    await this.save();

    this.logger.info('Workspace registered', { workspaceId, path: normalizedPath });
    return workspace;
  }

  async create(path: string, title?: string): Promise<Workspace> {
    const normalizedPath = normalize(path);
    // 使用目录名作为 workspaceId，若已存在则追加数字后缀
    let workspaceId = basename(normalizedPath) || 'workspace';
    if (this.workspaces.has(workspaceId)) {
      let suffix = 2;
      while (this.workspaces.has(`${workspaceId}-${suffix}`)) {
        suffix++;
      }
      workspaceId = `${workspaceId}-${suffix}`;
    }
    
    // Ensure directory exists
    try {
      await fs.mkdir(normalizedPath, { recursive: true });
    } catch {
      // Ignore if exists
    }

    return this.register(workspaceId, normalizedPath, title || basename(normalizedPath) || workspaceId);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return Array.from(this.workspaces.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return aTime - bTime;
    });
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.workspaces.get(workspaceId) || null;
  }

  async renameWorkspace(workspaceId: string, title: string): Promise<Workspace | null> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;

    workspace.title = title.trim() || workspace.title;
    workspace.updatedAt = new Date().toISOString();
    await this.save();
    return workspace;
  }

  async deleteWorkspace(workspaceId: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Close watcher
    const watcher = this.watchers.get(workspaceId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(workspaceId);
    }

    this.workspacePaths.delete(workspaceId);
    this.workspaces.delete(workspaceId);
    await this.save();
    return true;
  }

  async reorderWorkspaces(workspaceIds: string[]): Promise<string[]> {
    const workspaceMap = new Map(this.workspaces.entries());
    const ordered: Workspace[] = [];
    
    for (const id of workspaceIds) {
      const ws = workspaceMap.get(id);
      if (ws) {
        ws.updatedAt = new Date().toISOString();
        ordered.push(ws);
      }
    }

    // Add any workspaces not in the reorder list
    for (const [id, ws] of workspaceMap.entries()) {
      if (!workspaceIds.includes(id)) {
        ordered.push(ws);
      }
    }

    this.workspaces.clear();
    for (const ws of ordered) {
      this.workspaces.set(ws.id, ws);
    }

    await this.save();
    return ordered.map(w => w.id);
  }

  async addSessionToWorkspace(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<Workspace | null> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return null;

    // Remove from archived if present
    this.archive.delete(sessionId);

    // Remove from existing position if present
    workspace.sessionIds = workspace.sessionIds.filter(id => id !== sessionId);

    if (beforeSessionId) {
      const beforeIndex = workspace.sessionIds.indexOf(beforeSessionId);
      if (beforeIndex >= 0) {
        workspace.sessionIds.splice(beforeIndex, 0, sessionId);
      } else {
        workspace.sessionIds.push(sessionId);
      }
    } else {
      workspace.sessionIds.push(sessionId);
    }

    workspace.updatedAt = new Date().toISOString();
    await this.save();
    return workspace;
  }

  async archiveSession(sessionId: string): Promise<string[]> {
    this.archive.add(sessionId);
    
    // Remove from all workspaces
    for (const workspace of this.workspaces.values()) {
      workspace.sessionIds = workspace.sessionIds.filter(id => id !== sessionId);
    }
    
    await this.save();
    return Array.from(this.archive);
  }

  async unarchiveSession(sessionId: string): Promise<string[]> {
    this.archive.delete(sessionId);
    await this.save();
    return Array.from(this.archive);
  }

  async getArchivedSessionIds(): Promise<string[]> {
    return Array.from(this.archive);
  }

  async listFiles(workspaceId: string, dirPath: string = ''): Promise<FileInfo[]> {
    const workspacePath = this.getWorkspacePath(workspaceId);
    const targetPath = this.validatePath(workspaceId, dirPath);

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = join(targetPath, entry.name);
      const relativePath = normalize(fullPath).replace(workspacePath, '').replace(/^[/]/, '');

      if (entry.isDirectory()) {
        files.push({
          path: relativePath,
          name: entry.name,
          isDirectory: true
        });
      } else {
        const stats = await fs.stat(fullPath);
        files.push({
          path: relativePath,
          name: entry.name,
          isDirectory: false,
          size: stats.size
        });
      }
    }

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return files;
  }

  async readFile(workspaceId: string, filePath: string): Promise<string> {
    // Check cache first
    const cacheKey = workspaceId + ':' + filePath;
    const cached = this.fileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    // Read file content
    const fullPath = this.validatePath(workspaceId, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    // Cache the result
    this.fileCache.set(cacheKey, content);

    return content;
  }

  async writeFile(workspaceId: string, filePath: string, content: string): Promise<void> {
    const fullPath = this.validatePath(workspaceId, filePath);
    const dir = dirname(fullPath);

    // Ensure directory exists
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Ignore if exists
    }

    await fs.writeFile(fullPath, content, 'utf-8');

    // Invalidate cache
    const cacheKey = workspaceId + ':' + filePath;
    this.fileCache.delete(cacheKey);

    // Record version
    this.recordVersion(workspaceId, filePath, 'update', content);
  }

  async deleteFile(workspaceId: string, filePath: string): Promise<void> {
    const fullPath = this.validatePath(workspaceId, filePath);
    await fs.unlink(fullPath);

    // Invalidate cache
    const cacheKey = workspaceId + ':' + filePath;
    this.fileCache.delete(cacheKey);
  }

  async createDirectory(workspaceId: string, dirPath: string): Promise<void> {
    const fullPath = this.validatePath(workspaceId, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  async getVersions(workspaceId: string, filePath: string): Promise<FileVersion[]> {
    const key = workspaceId + ':' + filePath;
    return this.versions.get(key) || [];
  }

  async getVersion(workspaceId: string, filePath: string, versionId: string): Promise<FileVersion | null> {
    const key = workspaceId + ':' + filePath;
    const versions = this.versions.get(key) || [];
    return versions.find(v => v.id === versionId) || null;
  }

  async rollback(workspaceId: string, filePath: string, versionId: string): Promise<void> {
    const key = workspaceId + ':' + filePath;
    const versions = this.versions.get(key) || [];
    const version = versions.find(v => v.id === versionId);
    
    if (!version) {
      throw new Error('Version not found: ' + versionId);
    }

    await this.writeFile(workspaceId, filePath, version.snapshotPath);
  }

  onFileChange(workspaceId: string, callback: (path: string) => void): () => void {
    if (!this.changeListeners.has(workspaceId)) {
      this.changeListeners.set(workspaceId, new Set());
    }

    this.changeListeners.get(workspaceId)!.add(callback);

    return () => {
      this.changeListeners.get(workspaceId)?.delete(callback);
    };
  }

  private getWorkspacePath(workspaceId: string): string {
    const workspacePath = this.workspacePaths.get(workspaceId);
    if (!workspacePath) {
      throw new Error('Workspace not found: ' + workspaceId);
    }
    return workspacePath;
  }

  validatePath(workspaceId: string, filePath: string): string {
    const workspacePath = this.getWorkspacePath(workspaceId);
    const workspaceRoot = normalize(workspacePath);

    // Resolve the requested path relative to the workspace root, collapsing any
    // `..` segments, then ensure the result is still contained within it.
    const targetPath = resolve(workspaceRoot, filePath);

    // Security: ensure path is within workspace
    if (targetPath !== workspaceRoot && !targetPath.startsWith(workspaceRoot + sep)) {
      throw new Error('Path traversal detected: ' + filePath);
    }

    return targetPath;
  }

  private notifyChange(workspaceId: string, filePath: string): void {
    const listeners = this.changeListeners.get(workspaceId);
    if (listeners) {
      for (const callback of listeners) {
        callback(filePath);
      }
    }
  }

  private recordVersion(workspaceId: string, filePath: string, changeType: 'create' | 'update' | 'delete', content: string): void {
    const key = workspaceId + ':' + filePath;
    const versions = this.versions.get(key) || [];
    
    const version: FileVersion = {
      id: Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8),
      path: filePath,
      timestamp: new Date().toISOString(),
      author: 'agent',
      changeType,
      size: content.length,
      snapshotPath: content
    };

    versions.push(version);
    
    // Keep only last N versions
    if (versions.length > this.maxVersionsPerFile) {
      versions.shift();
    }

    this.versions.set(key, versions);
  }

  private async save(): Promise<void> {
    try {
      const data = {
        workspaces: Array.from(this.workspaces.entries()).map(([_id, ws]) => ({
          id: ws.id,
          path: ws.path,
          title: ws.title,
          sessionIds: ws.sessionIds,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        })),
        archive: Array.from(this.archive)
      };
      await fs.writeFile(this.persistencePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save workspaces', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.persistencePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.workspaces && Array.isArray(data.workspaces)) {
        for (const ws of data.workspaces) {
          this.workspaces.set(ws.id, ws);
          this.workspacePaths.set(ws.id, ws.path);
        }
      }

      if (data.archive && Array.isArray(data.archive)) {
        this.archive = new Set(data.archive);
      }

      this.logger.info('Workspaces loaded', { count: this.workspaces.size });
    } catch (_error) {
      // File doesn't exist yet or is invalid
      this.logger.info('No existing workspaces file, starting fresh');
    }
  }
}
