import { authedFetch } from '../lib/api';
import { useState, useEffect, useCallback } from 'react';
import { useWorkspaceRefresh } from '../hooks/useWorkspaceRefresh';
import VersionHistory from '../components/VersionHistory';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { getFriendlyMessage, AppError } from '../lib/errors';
import { Folder, Globe, Paintbrush, FileCode, FileJson, FileText, Image, Video, Music } from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  size?: number;
  type?: 'file' | 'directory';
  children?: FileItem[];
}

type PreviewType = 'none' | 'html' | 'image' | 'video' | 'audio' | 'text' | 'markdown';

export default function WorkspacePage({ workspaceId = 'default' }: { workspaceId?: string } = {}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('none');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  const [_selectedVersion, setSelectedVersion] = useState<any>(null);
  const [_showDiff, setShowDiff] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [breadcrumb, setBreadcrumb] = useState<Array<{ name: string; path: string }>>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  const loadFiles = async (folderPath = '') => {
    try {
      setError(null);
      const url = folderPath 
        ? '/api/workspaces/' + workspaceId + '/files?path=' + encodeURIComponent(folderPath)
        : '/api/workspaces/' + workspaceId + '/files';
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '加载文件列表失败' }));
        throw new AppError(data.error || '加载文件列表失败', res.status, 'HTTP_ERROR');
      }
      const data = await res.json();

      // Enhance files with type detection
      const enhancedFiles = (data.files || []).map((f: FileItem) => ({
        ...f,
        type: f.name.includes('.') ? 'file' : 'directory'
      }));

      setFiles(enhancedFiles);
      setCurrentFolder(folderPath);

      // Update breadcrumb
      if (folderPath) {
        const parts = folderPath.split('/').filter(Boolean);
        const crumbs = parts.map((part, index) => ({
          name: part,
          path: '/' + parts.slice(0, index + 1).join('/')
        }));
        setBreadcrumb([{ name: 'Root', path: '' }, ...crumbs]);
      } else {
        setBreadcrumb([{ name: 'Root', path: '' }]);
      }
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const loadContent = async (filePath: string) => {
    try {
      setError(null);
      setPreviewHtml(null);
      setPreviewType('none');
      setShowVersionHistory(false);
      setSelectedVersion(null);
      setShowDiff(false);

      // Determine preview type based on file extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext || '')) {
        setPreviewType('image');
        setSelected(filePath);
        return;
      }
      if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
        setPreviewType('video');
        setSelected(filePath);
        return;
      }
      if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext || '')) {
        setPreviewType('audio');
        setSelected(filePath);
        return;
      }
      if (['html', 'htm'].includes(ext || '')) {
        const res = await authedFetch('/workspaces/' + workspaceId + '/preview?path=' + encodeURIComponent(filePath));
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: '预览文件失败' }));
          throw new AppError(data.error || '预览文件失败', res.status, 'HTTP_ERROR');
        }
        const text = await res.text();
        setPreviewHtml(text);
        setPreviewType('html');
      } else if (ext === 'md') {
        const res = await authedFetch('/workspaces/' + workspaceId + '/files/content?path=' + encodeURIComponent(filePath));
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: '加载文件内容失败' }));
          throw new AppError(data.error || '加载文件内容失败', res.status, 'HTTP_ERROR');
        }
        const text = await res.text();
        setContent(text);
        setPreviewType('markdown');
      } else {
        const res = await authedFetch('/workspaces/' + workspaceId + '/files/content?path=' + encodeURIComponent(filePath));
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: '加载文件内容失败' }));
          throw new AppError(data.error || '加载文件内容失败', res.status, 'HTTP_ERROR');
        }
        const text = await res.text();
        setContent(text);
        setPreviewType('text');
      }
      setSelected(filePath);
      setEditing(false);
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const previewFile = async () => {
    if (!selected) return;
    try {
      setError(null);
      const res = await authedFetch('/workspaces/' + workspaceId + '/preview?path=' + encodeURIComponent(selected));
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '预览文件失败' }));
        throw new AppError(data.error || '预览文件失败', res.status, 'HTTP_ERROR');
      }
      const text = await res.text();
      setPreviewHtml(text);
      setPreviewType('html');
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const closePreview = () => {
    setPreviewHtml(null);
    setPreviewType('none');
  };

  const saveContent = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      setError(null);
      const res = await authedFetch('/workspaces/' + workspaceId + '/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected, content })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '保存文件失败' }));
        throw new AppError(data.error || '保存文件失败', res.status, 'HTTP_ERROR');
      }
      setEditing(false);
      loadFiles(currentFolder);
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async () => {
    if (!selected || !confirmDeletePath) return;

    try {
      setError(null);
      const res = await authedFetch('/workspaces/' + workspaceId + '/files?path=' + encodeURIComponent(selected), {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '删除文件失败' }));
        throw new AppError(data.error || '删除文件失败', res.status, 'HTTP_ERROR');
      }
      setConfirmDeletePath(null);
      setSelected(null);
      setPreviewHtml(null);
      setPreviewType('none');
      loadFiles(currentFolder);
    } catch (e) {
      const message = getFriendlyMessage(e);
      setError(message);
    }
  };

  const handleFileChange = useCallback((changedPath: string) => {
    loadFiles(currentFolder);
    if (selected && (changedPath === selected || changedPath.endsWith(selected))) {
      loadContent(selected);
    }
  }, [selected, currentFolder, loadFiles, loadContent]);

  useWorkspaceRefresh(handleFileChange);

  useEffect(() => {
    loadFiles();
  }, []);

  const isHtmlFile = selected?.endsWith('.html') || selected?.endsWith('.htm');
  const _isImageFile = selected ? /.(png|jpg|jpeg|webp|gif|bmp)$/i.test(selected) : false;
  const _isVideoFile = selected ? /.(mp4|webm|mov|avi)$/i.test(selected) : false;
  const _isAudioFile = selected ? /.(mp3|wav|ogg|m4a|flac)$/i.test(selected) : false;

  const getMediaUrl = (path: string) => {
    return '/api/workspaces/' + workspaceId + '/files/content?path=' + encodeURIComponent(path);
  };

  const getFileIcon = (fileName: string, type?: string) => {
    if (type === 'directory') return Folder;
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'html':
      case 'htm':
        return Globe;
      case 'css':
        return Paintbrush;
      case 'js':
      case 'ts':
        return FileCode;
      case 'json':
        return FileJson;
      case 'md':
        return FileText;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
      case 'gif':
        return Image;
      case 'mp4':
      case 'webm':
      case 'mov':
        return Video;
      case 'mp3':
      case 'wav':
      case 'ogg':
        return Music;
      default:
        return FileText;
    }
  };

  // Filter files based on search
  const filteredFiles = searchQuery 
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {error && (
        <div style={{
          padding: '10px 12px',
          marginBottom: 12,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          borderRadius: 6,
          fontSize: 13
        }}>
          {error}
        </div>
      )}
      
      {/* Breadcrumb and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {breadcrumb.map((crumb, index) => (
            <div key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {index > 0 && <span style={{ color: '#999' }}>/</span>}
              <button
                onClick={() => loadFiles(crumb.path)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: index === breadcrumb.length - 1 ? '#2563eb' : '#666',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '4px 8px'
                }}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>
        
        <input
          type="text"
          placeholder="搜索文件..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            padding: '6px 12px',
            border: '1px solid #ddd',
            borderRadius: 4,
            fontSize: 13,
            width: 200
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>工作台</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isHtmlFile && !previewHtml) && (
            <button onClick={previewFile} style={{ padding: '6px 12px' }}>预览</button>
          )}
          {previewHtml && (
            <button onClick={closePreview} style={{ padding: '6px 12px' }}>关闭预览</button>
          )}
          {selected && (
            <>
              <button onClick={() => setShowVersionHistory(!showVersionHistory)} style={{ padding: '6px 12px' }}>
                {showVersionHistory ? 'Hide History' : 'Version History'}
              </button>
              <button onClick={() => setConfirmDeletePath(selected || '')} style={{ padding: '6px 12px', color: '#dc2626' }}>删除</button>
              {confirmDeletePath === selected && (
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000
                }}>
                  <div style={{
                    background: 'white',
                    padding: 24,
                    borderRadius: 8,
                    maxWidth: 400,
                    width: '90%'
                  }}>
                    <p style={{ margin: '0 0 16px' }}>确定要删除 {selected} 吗？</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setConfirmDeletePath(null)} style={{ padding: '6px 12px' }}>取消</button>
                      <button onClick={deleteFile} style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4 }}>删除</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <button onClick={() => loadFiles(currentFolder)} style={{ padding: '6px 12px' }}>刷新</button>
        </div>
      </div>
      
      <div style={{ display: 'flex', flex: 1, gap: 12, minHeight: 0 }}>
        <div style={{ width: 260, border: '1px solid #eee', borderRadius: 8, overflow: 'auto', background: '#fafafa' }}>
          {filteredFiles.length === 0 ? (
            <div style={{ padding: 12, color: '#888' }}>
              {searchQuery ? '没有找到匹配的文件' : '暂无文件'}
            </div>
          ) : (
            filteredFiles.map((f, i) => (
              <div
                key={i}
                onClick={() => f.type === 'directory' ? loadFiles(f.path) : loadContent(f.path)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: selected === f.path ? '#e5e7eb' : 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                  {(() => { const Icon = getFileIcon(f.name, f.type); return <Icon size={16} />; })()}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
              </div>
            ))
          )}
        </div>
        
        <div style={{ flex: 1, border: '1px solid #eee', borderRadius: 8, padding: 12, overflow: 'auto', background: '#fff' }}>
          {previewHtml && previewType === 'html' ? (
            <iframe
              srcDoc={previewHtml}
              style={{ width: '100%', height: '70vh', border: '1px solid #ddd', borderRadius: 4 }}
              sandbox="allow-scripts allow-same-origin"
              title="Preview"
            />
          ) : previewType === 'image' && selected ? (
            <div style={{ textAlign: 'center' }}>
              <img
                src={getMediaUrl(selected)}
                alt={selected}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 4 }}
              />
            </div>
          ) : previewType === 'video' && selected ? (
            <div style={{ textAlign: 'center' }}>
              <video
                src={getMediaUrl(selected)}
                controls
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 4 }}
              />
            </div>
          ) : previewType === 'audio' && selected ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <audio
                src={getMediaUrl(selected)}
                controls
                style={{ width: '100%', maxWidth: 500 }}
              />
            </div>
          ) : previewType === 'markdown' && selected ? (
            <>
              <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>{selected}</div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <MarkdownRenderer content={content} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(true)}>编辑</button>
              </div>
            </>
          ) : selected ? (
            <>
              <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>{selected}</div>
              {editing ? (
                <>
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    style={{ width: '100%', height: '70vh', fontFamily: 'monospace', fontSize: 13 }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <button
                      onClick={saveContent}
                      disabled={saving}
                      style={{ marginRight: 8 }}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                    <button onClick={() => setEditing(false)}>取消</button>
                  </div>
                </>
              ) : (
                <>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}>{content}</pre>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditing(true)}>编辑</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
              选择文件查看内容
            </div>
          )}
        </div>
      </div>

      {showVersionHistory && selected && (
        <VersionHistory
          workspaceId={workspaceId}
          filePath={selected}
          onRollback={(versionId) => {
            console.log('Rolled back to version:', versionId);
            loadContent(selected);
          }}
          onClose={() => setShowVersionHistory(false)}
        />
      )}
    </div>
  );
}
