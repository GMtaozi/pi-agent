import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import { join, resolve, sep } from 'path';
import { stat, readdir } from 'fs/promises';
import { statSync } from 'fs';
import { homedir } from 'os';
import 'crypto';
// Root directories the directory-picker is allowed to enumerate. Configure via
// PICKER_ALLOWED_ROOTS (comma-separated); defaults to the user's home dir
// (or all drive roots on Windows so users can browse the whole machine).
const _explicitRoots = (process.env.PICKER_ALLOWED_ROOTS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => resolve(s));
const PICKER_ALLOWED_ROOTS: string[] = _explicitRoots;
if (PICKER_ALLOWED_ROOTS.length === 0) {
  if (process.platform === 'win32') {
    // Windows: default to all available drive roots so users can browse freely.
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        statSync(drivePath);
        PICKER_ALLOWED_ROOTS.push(drivePath);
      } catch {
        // drive not present, skip
      }
    }
  }
  // Fallback: if no drives found or non-Windows, use home dir.
  if (PICKER_ALLOWED_ROOTS.length === 0) {
    PICKER_ALLOWED_ROOTS.push(homedir());
  }
}
import { markdownToHtml } from '../markdown.js';

export function registerWorkspacesRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/workspaces/:id/preview', async (req, res) => {
    const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const path = (req.query as any).path as string | undefined;
    if (!path) {
      return res.status(400).send({ error: 'path is required' });
    }
    try {
      const content = await deps.workspaceService.readFile(id, path);
      const ext = path.split('.').pop()?.toLowerCase();
      if (['html', 'htm'].includes(ext || '')) {
        res.header('Content-Type', 'text/html');
        return res.send(content);
      }
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext || '')) {
        return res.redirect('/api/workspaces/' + id + '/files/content?path=' + encodeURIComponent(path));
      }
      if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
        res.header('Content-Type', 'video/' + (ext === 'mp4' ? 'mp4' : ext === 'webm' ? 'webm' : ext === 'mov' ? 'quicktime' : 'avi'));
        return res.send(content);
      }
      if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext || '')) {
        res.header('Content-Type', 'audio/' + (ext === 'mp3' ? 'mpeg' : ext === 'wav' ? 'wav' : ext === 'ogg' ? 'ogg' : ext === 'm4a' ? 'mp4' : ext === 'flac' ? 'flac' : ext));
        return res.send(content);
      }
      if (['md', 'markdown'].includes(ext || '')) {
        const html = markdownToHtml(content);
        res.header('Content-Type', 'text/html');
        return res.send(html);
      }
      return {
        type: ext || 'text',
        content,
        size: content.length
      };
    } catch (err) {
      server.log.error(err);
      res.status(404).send({ error: 'File not found' });
    }
  });

  server.get('/api/workspaces/:id/files/content', async (req, res) => {
    const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const path = (req.query as any).path as string | undefined;
    if (!path) {
      return res.status(400).send({ error: 'path is required' });
    }
    try {
      const content = await deps.workspaceService.readFile(id, path);
      const ext = path.split('.').pop()?.toLowerCase();
      let contentType = 'text/plain';
      if (ext === 'html' || ext === 'htm') contentType = 'text/html';
      else if (ext === 'css') contentType = 'text/css';
      else if (ext === 'js' || ext === 'mjs') contentType = 'application/javascript';
      else if (ext === 'json') contentType = 'application/json';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'mp4') contentType = 'video/mp4';
      else if (ext === 'webm') contentType = 'video/webm';
      else if (ext === 'mp3') contentType = 'audio/mpeg';
      else if (ext === 'wav') contentType = 'audio/wav';
      else if (ext === 'svg') contentType = 'image/svg+xml';
      res.header('Content-Type', contentType);
      res.send(content);
    } catch (err) {
      server.log.error(err);
      res.status(404).send({ error: 'File not found' });
    }
  });

  server.get('/api/workspaces/:id/files', async (req, res) => {
    const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const dirPath = (req.query as any).path as string | undefined;
    try {
      const files = await deps.workspaceService.listFiles(id, dirPath || '');
      return { files };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to list files' });
    }
  });

  server.get('/api/workspaces/:id/versions/:path', async (req, res) => {
    const { id, path } = req.params as { id: string; path: string };
    try {
      const versions = await deps.workspaceService.getVersions(id, path);
      return versions.map(v => ({
        id: v.id,
        timestamp: v.timestamp,
        author: v.author,
        changeType: v.changeType,
        size: v.size
      }));
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get versions' });
    }
  });

  server.get('/api/workspaces/:id/versions/:path/:versionId', async (req, res) => {
    const { id, path, versionId } = req.params as { id: string; path: string; versionId: string };
    try {
      const version = await deps.workspaceService.getVersion(id, path, versionId);
      if (!version) {
        return res.status(404).send({ error: 'Version not found' });
      }
      return version;
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to get version' });
    }
  });

  server.post('/api/workspaces/:id/versions/:path/:versionId/rollback', async (req, res) => {
    const { id, path, versionId } = req.params as { id: string; path: string; versionId: string };
    try {
      await deps.workspaceService.rollback(id, path, versionId);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to rollback' });
    }
  });

  // 获取 Windows 上所有可用的磁盘驱动器根目录
  async function getWindowsDrives(): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> {
    const drives: Array<{ name: string; path: string; isDirectory: boolean }> = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        await stat(drivePath);
        drives.push({ name: `${letter}:`, path: drivePath, isDirectory: true });
      } catch {
        // 驱动器不存在，跳过
      }
    }
    return drives;
  }

  server.get('/api/directory-picker/list', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    const rawPath = ((req.query as any).path as string | undefined) || '';
    // 空字符串或 "/" 均视为"我的电脑"视图：显示所有磁盘驱动器根目录
    const targetPath = rawPath === '/' ? '' : rawPath;
    try {
      // Empty path / root: show all drive roots (Windows) or allowed roots (other platforms).
      if (!targetPath) {
        // Windows: enumerate all available drive roots.
        if (process.platform === 'win32') {
          const drives = await getWindowsDrives();
          return res.send({ path: '/', files: drives });
        }
        const files = await Promise.all(PICKER_ALLOWED_ROOTS.map(async (root) => {
          try {
            const stats = await stat(root);
            return { name: root, path: root, isDirectory: true, size: stats.size, modified: stats.mtime };
          } catch {
            return { name: root, path: root, isDirectory: true, size: 0, modified: new Date().toISOString() };
          }
        }));
        return res.send({ path: '', files });
      }

      // Enforce that the requested path stays within an allowed root.
      const resolvedPath = resolve(targetPath);
      const withinAllowed = PICKER_ALLOWED_ROOTS.some(root => {
        // root 已以分隔符结尾（如 D:\），无需再加 sep，否则会变成 D:\\ 导致匹配失败
        const prefix = root.endsWith(sep) ? root : root + sep;
        return resolvedPath === root || resolvedPath.startsWith(prefix);
      });
      if (!withinAllowed) {
        return res.status(403).send({ error: 'Path is not within an allowed directory' });
      }

      const entries = await readdir(targetPath, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (entry) => {
        const fullPath = join(targetPath, entry.name);
        try {
          const stats = await stat(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size: stats.size,
            modified: stats.mtime
          };
        } catch {
          return null;
        }
      }));
      res.send({ path: targetPath, files: files.filter(Boolean) });
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to list directory' });
    }
  });

  server.get('/api/workspaces', async (req, res) => {
    try {
      const workspaces = await deps.workspaceService.listWorkspaces();
      const archivedSessionIds = await deps.workspaceService.getArchivedSessionIds();
      return {
        items: workspaces.map(ws => ({
          workspaceId: ws.id,
          path: ws.path,
          title: ws.title,
          sessionIds: ws.sessionIds,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt
        })),
        archivedSessionIds
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to list workspaces' });
    }
  });

  server.post('/api/workspaces', async (req, res) => {
    try {
      const { path, title } = req.body as { path?: string; title?: string };
      if (!path) {
        return res.status(400).send({ error: 'path is required' });
      }
      const workspace = await deps.workspaceService.create(path, title);
      return {
        workspace: {
          workspaceId: workspace.id,
          path: workspace.path,
          title: workspace.title,
          sessionIds: workspace.sessionIds,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt
        },
        created: true
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create workspace' });
    }
  });

  server.post('/api/workspaces/:id/rename', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { title } = req.body as { title?: string };
      if (!title || !title.trim()) {
        return res.status(400).send({ error: 'title is required' });
      }
      const workspace = await deps.workspaceService.renameWorkspace(id, title);
      if (!workspace) {
        return res.status(404).send({ error: 'Workspace not found' });
      }
      return {
        workspace: {
          workspaceId: workspace.id,
          path: workspace.path,
          title: workspace.title,
          sessionIds: workspace.sessionIds,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt
        }
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to rename workspace' });
    }
  });

  server.delete('/api/workspaces/:id', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const deleted = await deps.workspaceService.deleteWorkspace(id);
      if (!deleted) {
        return res.status(404).send({ error: 'Workspace not found' });
      }
      return { deleted: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete workspace' });
    }
  });

  server.post('/api/workspaces/reorder', async (req, res) => {
    try {
      const { workspaceIds } = req.body as { workspaceIds?: string[] };
      if (!workspaceIds || !Array.isArray(workspaceIds)) {
        return res.status(400).send({ error: 'workspaceIds is required' });
      }
      const ordered = await deps.workspaceService.reorderWorkspaces(workspaceIds);
      return { workspaceIds: ordered };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to reorder workspaces' });
    }
  });

  server.post('/api/workspaces/:id/sessions/reorder', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { sessionId, beforeSessionId } = req.body as { sessionId?: string; beforeSessionId?: string };
      if (!sessionId) {
        return res.status(400).send({ error: 'sessionId is required' });
      }
      const workspace = await deps.workspaceService.addSessionToWorkspace(id, sessionId, beforeSessionId);
      if (!workspace) {
        return res.status(404).send({ error: 'Workspace not found' });
      }
      return {
        workspace: {
          workspaceId: workspace.id,
          path: workspace.path,
          title: workspace.title,
          sessionIds: workspace.sessionIds,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt
        }
      };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to reorder session' });
    }
  });

  server.post('/api/workspaces/sessions/archive', async (req, res) => {
    try {
      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) {
        return res.status(400).send({ error: 'sessionId is required' });
      }
      const archivedSessionIds = await deps.workspaceService.archiveSession(sessionId);
      return { archivedSessionIds };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to archive session' });
    }
  });
}
