import { authedFetch } from '../lib/api';
import { useState, useEffect } from 'react';

interface FileVersion {
  id: string;
  path: string;
  timestamp: string;
  author: 'user' | 'agent';
  changeType: 'create' | 'update' | 'delete';
  size: number;
}

interface VersionHistoryProps {
  workspaceId: string;
  filePath: string;
  onRollback?: (versionId: string) => void;
  onClose?: () => void;
}

export default function VersionHistory({ workspaceId, filePath, onRollback, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVersions();
  }, [workspaceId, filePath]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authedFetch('/workspaces/' + workspaceId + '/versions/' + encodeURIComponent(filePath));
      if (!res.ok) throw new Error('Failed to fetch versions');
      const data = await res.json();
      setVersions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    try {
      const res = await authedFetch('/workspaces/' + workspaceId + '/versions/' + encodeURIComponent(filePath) + '/' + versionId + '/rollback', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to rollback');
      onRollback?.(versionId);
      fetchVersions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rollback');
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'create': return '#16a34a';
      case 'update': return '#2563eb';
      case 'delete': return '#dc2626';
      default: return '#666';
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading version history...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Version History</h3>
        {onClose && (
          <button onClick={onClose} style={{ padding: '4px 12px' }}>Close</button>
        )}
      </div>

      {versions.length === 0 ? (
        <p style={{ color: '#666' }}>No version history available</p>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {versions.map((version) => (
            <div
              key={version.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: getChangeTypeColor(version.changeType),
                    color: 'white'
                  }}>
                    {version.changeType}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {formatDate(version.timestamp)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  By {version.author} • {version.size} bytes
                </div>
              </div>
              <button
                onClick={() => handleRollback(version.id)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  background: '#f3f4f6',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Rollback
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
