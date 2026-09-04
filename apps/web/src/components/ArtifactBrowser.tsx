import { useState, useEffect, useCallback } from 'react';
import { FileText, Image, Code, File, Download, Trash2, RefreshCw } from 'lucide-react';
import { listArtifacts, deleteArtifact, type Artifact } from '../lib/api';

const TYPE_ICONS: Record<string, any> = {
  'text': FileText,
  'image': Image,
  'code': Code,
  'file': File,
};

export default function ArtifactBrowser({ sessionId }: { sessionId?: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listArtifacts({ sessionId, type: selectedType || undefined, limit: 100 });
      setArtifacts(data.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedType]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此产物？')) return;
    try {
      await deleteArtifact(id);
      setArtifacts(prev => prev.filter(a => a.id !== id));
    } catch {
      alert('删除失败');
    }
  };

  return (
    <div className="artifact-browser">
      <div className="browser-header">
        <div className="type-filters">
          {['', 'text', 'image', 'code', 'file'].map(t => (
            <button
              key={t}
              className={`filter-chip ${selectedType === t ? 'active' : ''}`}
              onClick={() => setSelectedType(t)}
            >
              {t || '全部'}
            </button>
          ))}
        </div>
        <button className="btn-icon" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading && artifacts.length === 0 ? (
        <div className="skeleton-list">
          {[1,2,3].map(i => <div key={i} className="skeleton-row" />)}
        </div>
      ) : artifacts.length === 0 ? (
        <div className="empty-state">
          <File size={32} />
          <p>暂无产物</p>
          <span>Agent 执行后会自动记录产物</span>
        </div>
      ) : (
        <div className="artifact-grid">
          {artifacts.map(a => {
            const Icon = TYPE_ICONS[a.type] || File;
            return (
              <div key={a.id} className="artifact-card">
                <div className="artifact-icon"><Icon size={20} /></div>
                <div className="artifact-info">
                  <span className="artifact-name" title={a.name}>{a.name}</span>
                  <span className="artifact-meta">{a.type} · {a.size ? `${(a.size / 1024).toFixed(1)}KB` : '-'}</span>
                </div>
                <div className="artifact-actions">
                  {a.path && (
                    <a href={`/api/artifacts/${a.id}/download`} download className="btn-icon">
                      <Download size={14} />
                    </a>
                  )}
                  <button className="btn-icon" onClick={() => handleDelete(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
