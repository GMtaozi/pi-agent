import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Database, FileText, Plus, RefreshCw, Search, Trash2, Upload,
  CheckCircle, Clock, XCircle, Filter, Layers, AlertTriangle, X, ArrowLeft, File
} from 'lucide-react';
import {
  listKnowledgeBases, getKnowledgeBase, createKnowledgeBase, deleteKnowledgeBase,
  listDocuments, uploadDocument, deleteDocument, searchKnowledgeBase,
  type KnowledgeBase, type Document
} from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const formatTime = (ts: string) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const DOC_STATUS_META: Record<string, { color: string; label: string; icon: typeof CheckCircle }> = {
  ready: { color: '#81c995', label: '已就绪', icon: CheckCircle },
  processing: { color: '#06b6d4', label: '处理中', icon: Clock },
  pending: { color: '#fdd663', label: '等待中', icon: Clock },
  error: { color: '#f28b82', label: '失败', icon: XCircle },
};

export default function KnowledgeBasePage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Create KB modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; content: string; score: number; documentName: string; chunkIndex: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const fetchKbs = async () => {
    try {
      const data = await listKnowledgeBases();
      setKbs(data);
      setError(null);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchKbs(); }, []);

  const fetchDetail = useCallback(async (kb: KnowledgeBase) => {
    setDetailLoading(true);
    try {
      const [kbDetail, docs] = await Promise.all([
        getKnowledgeBase(kb.id),
        listDocuments(kb.id),
      ]);
      setSelectedKb(kbDetail);
      setDocuments(docs);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(async () => {
    if (selectedKb) fetchDetail(selectedKb);
  }, [selectedKb, fetchDetail]);

  useEffect(() => { refreshDetail(); }, [refreshDetail]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createKnowledgeBase({ name: newName.trim(), description: newDesc.trim() || undefined });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      await fetchKbs();
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (kb: KnowledgeBase) => {
    if (!confirm(`确定删除知识库「${kb.name}」吗？`)) return;
    try {
      await deleteKnowledgeBase(kb.id);
      if (selectedKb?.id === kb.id) setSelectedKb(null);
      await fetchKbs();
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !selectedKb) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          await uploadDocument(selectedKb.id, uploadFile.name, base64, uploadFile.type);
          setShowUpload(false);
          setUploadFile(null);
          await fetchDetail(selectedKb);
        } catch (e) {
          setError(getFriendlyMessage(e));
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(uploadFile);
    } catch (e) {
      setError(getFriendlyMessage(e));
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc: Document) => {
    if (!confirm(`确定删除文档「${doc.name}」吗？`)) return;
    try {
      await deleteDocument(doc.kb_id, doc.id);
      if (selectedKb) fetchDetail(selectedKb);
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedKb) return;
    setSearching(true);
    try {
      const res = await searchKnowledgeBase(selectedKb.id, searchQuery.trim(), 10, true);
      setSearchResults(res.results);
      setShowSearch(true);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="monitoring-page" role="status">
        <div className="monitoring-header"><h1 className="monitoring-title">知识库</h1></div>
        <div className="kb-grid">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="kb-card skeleton" style={{ height: 160 }} />)}</div>
      </div>
    );
  }

  return (
    <div className="monitoring-page">
      <div className="monitoring-header">
        <div className="monitoring-title-group">
          <h1 className="monitoring-title">知识库</h1>
          <span className="monitoring-subtitle">管理文档知识库，增强 Agent 检索能力</span>
        </div>
        <div className="monitoring-header-right">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} style={{ marginRight: 6 }} />新建知识库</button>
          <button className="monitoring-time-btn" onClick={() => { setRefreshing(true); fetchKbs(); }} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ margin: '0 20px' }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      {selectedKb ? (
        /* ===== Detail View ===== */
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button className="monitoring-time-btn" onClick={() => { setSelectedKb(null); setShowSearch(false); }}><ArrowLeft size={16} /></button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{selectedKb.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedKb.description || '暂无描述'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="kb-stat"><Layers size={14} />{selectedKb.document_count} 文档</div>
              <div className="kb-stat"><FileText size={14} />{selectedKb.total_chunks} 分块</div>
            </div>
          </div>

          {/* Search bar */}
          <div className="kb-search-bar">
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input className="input" placeholder="搜索知识库..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ border: 'none', background: 'transparent', flex: 1 }} />
            <button className="btn btn-primary" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? '搜索中...' : '搜索'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowUpload(true)}><Upload size={16} style={{ marginRight: 4 }} />上传文档</button>
          </div>

          {/* Search results */}
          {showSearch && searchResults.length > 0 && (
            <div className="kb-search-results">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>搜索结果 ({searchResults.length})</div>
                <button className="monitoring-time-btn" onClick={() => setShowSearch(false)}><X size={14} /></button>
              </div>
              {searchResults.map((r, i) => (
                <div key={r.id || i} className="kb-search-result">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.documentName} #{(r.chunkIndex ?? 0) + 1}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--success-color)' }}>{(r.score * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{r.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* Document list */}
          <div className="monitoring-table-card" style={{ marginTop: 16 }}>
            <div className="monitoring-table-header">
              <div className="monitoring-table-title">文档列表</div>
              <div className="monitoring-table-count">{documents.length} 个文档</div>
            </div>
            {documents.length === 0 ? (
              <div className="monitoring-empty"><FileText size={32} /><div className="monitoring-empty-title">暂无文档</div><div className="monitoring-empty-desc">上传文档以填充知识库</div></div>
            ) : (
              <div className="table-container">
                <table className="monitoring-table" role="table">
                  <thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>分块</th><th>状态</th><th>上传时间</th><th></th></tr></thead>
                  <tbody>
                    {documents.map(doc => {
                      const st = DOC_STATUS_META[doc.status] || DOC_STATUS_META.pending;
                      const StIcon = st.icon;
                      return (
                        <tr key={doc.id}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><File size={14} style={{ color: 'var(--text-muted)' }} /><span style={{ fontSize: 13, fontWeight: 500 }}>{doc.name}</span></div></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.mime_type || '-'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{formatBytes(doc.size)}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{doc.chunk_count}</td>
                          <td><span className="status-badge" style={{ background: st.color + '20', color: st.color }}><StIcon size={12} style={{ marginRight: 4 }} />{st.label}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatTime(doc.created_at)}</td>
                          <td><button className="row-icon-btn" onClick={() => handleDeleteDoc(doc)} title="删除"><Trash2 size={14} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== KB List ===== */
        <>
          {kbs.length === 0 ? (
            <div className="monitoring-empty" style={{ paddingTop: 80 }}>
              <Database size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
              <h3 style={{ margin: '0 0 8px' }}>暂无知识库</h3>
              <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)' }}>创建知识库并上传文档，增强 Agent 的知识检索能力</p>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} style={{ marginRight: 6 }} />创建第一个知识库</button>
            </div>
          ) : (
            <div className="kb-grid">
              {kbs.map(kb => (
                <div key={kb.id} className="kb-card" onClick={() => fetchDetail(kb)}>
                  <div className="kb-card-header">
                    <BookOpen size={20} style={{ color: 'var(--accent-color)' }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div className="kb-card-title">{kb.name}</div>
                      <div className="kb-card-desc">{kb.description || '暂无描述'}</div>
                    </div>
                    <button className="row-icon-btn" onClick={e => { e.stopPropagation(); handleDelete(kb); }} title="删除"><Trash2 size={14} /></button>
                  </div>
                  <div className="kb-card-stats">
                    <span><Layers size={12} /> {kb.document_count} 文档</span>
                    <span><FileText size={12} /> {kb.total_chunks} 分块</span>
                    <span><Search size={12} /> {kb.embedding_model || 'default'}</span>
                  </div>
                  <div className="kb-card-footer">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>更新于 {formatTime(kb.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== Create KB Modal ===== */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">新建知识库</h3>
            <div className="modal-body">
              <div className="form-item">
                <label className="form-label">名称 *</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="我的知识库" />
              </div>
              <div className="form-item">
                <label className="form-label">描述</label>
                <textarea className="input" rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="知识库用途描述（可选）" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>取消</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>{creating ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Upload Modal ===== */}
      {showUpload && selectedKb && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">上传文档</h3>
            <div className="modal-body">
              <div className="form-item">
                <label className="form-label">知识库</label>
                <input className="input" value={selectedKb.name} disabled />
              </div>
              <div className="form-item">
                <label className="form-label">选择文件 *</label>
                <div className="kb-upload-zone">
                  <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.xlsx,.xls,.md,.txt,.csv" />
                  {uploadFile ? (
                    <div className="kb-upload-preview">
                      <File size={20} />
                      <span>{uploadFile.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatBytes(uploadFile.size)}</span>
                    </div>
                  ) : (
                    <div className="kb-upload-placeholder">
                      <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                      <div>点击或拖拽文件到此处</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>支持 PDF / Word / Excel / MD / TXT / CSV</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowUpload(false); setUploadFile(null); }} disabled={uploading}>取消</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !uploadFile}>{uploading ? '上传中...' : '上传'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
