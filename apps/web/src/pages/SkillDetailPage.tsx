import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, Download, Star, Pencil, Trash2, X, History, RotateCcw, Plus, Activity, MessageSquare, Send } from 'lucide-react';
import { apiFetch, getSkillVersions, publishSkillVersion, rollbackSkill, getSkillComments, createSkillComment, deleteSkillComment, type SkillVersion, type SkillComment } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';
import type { MarketSkill } from './SkillMarketPage';

const ANON_ID_KEY = 'workforge_anon_id';
const NICKNAME_KEY = 'workforge_nick_name';

function getOrCreateAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function displayName(comment: SkillComment): string {
  if (comment.userName) return comment.userName;
  const short = (comment.sessionId || '').slice(-6);
  return short ? `匿名用户 ${short}` : '匿名用户';
}

interface SkillUsageStats {
  totalCalls: number;
  successCount: number;
  successRate: number;
  avgDurationMs: number | null;
  trend: Array<{ day: string; calls: number }>;
}

export default function SkillDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<MarketSkill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [rated, setRated] = useState(false);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newChangelog, setNewChangelog] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [stats, setStats] = useState<SkillUsageStats | null>(null);
  const [comments, setComments] = useState<SkillComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [nickName, setNickName] = useState(localStorage.getItem(NICKNAME_KEY) || '');
  const [myRating, setMyRating] = useState<number | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [anonId] = useState(getOrCreateAnonId);

  useEffect(() => {
    let cancelled = false;
    setCommentsLoading(true);
    getSkillComments(id)
      .then(data => { if (!cancelled) setComments(data.comments || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCommentsLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    setError(null);
    try {
      localStorage.setItem(NICKNAME_KEY, nickName.trim());
      const result = await createSkillComment(id, {
        sessionId: anonId,
        content: newComment.trim(),
        userName: nickName.trim() || undefined,
        rating: myRating ?? undefined,
      });
      setComments(prev => [result.comment, ...prev]);
      setNewComment('');
      setMyRating(null);
      if (result.comment.rating != null && skill) {
        const fresh = await apiFetch<MarketSkill>(`/skills/${encodeURIComponent(id)}`);
        setSkill(fresh);
      }
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteSkillComment(id, commentId, anonId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiFetch<SkillUsageStats>(`/skills/${encodeURIComponent(id)}/stats`)
      .then(data => { if (!cancelled) setStats(data); })
      .catch(() => {
        // Stats are supplementary — never block the detail page.
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<MarketSkill>(`/skills/${encodeURIComponent(id)}`)
      .then(data => {
        if (!cancelled) setSkill(data);
      })
      .catch(err => {
        if (!cancelled) setError(getFriendlyMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const handleToggle = async () => {
    if (!skill) return;
    setToggling(true);
    setError(null);
    try {
      const updated = await apiFetch<{ enabled: boolean }>(`/skills/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
      setSkill({ ...skill, enabled: updated.enabled });
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!skill) return;
    if (!window.confirm(`确定删除技能「${skill.name}」吗？`)) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/skills');
    } catch (e) {
      setError(getFriendlyMessage(e));
      setDeleting(false);
    }
  };

  const _handleInstall = async () => {
    if (!skill || skill.enabled) return;
    await handleToggle();
  };

  const handleRate = async (value: number) => {
    if (!skill || rated) return;
    setRatingSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; rating: number; ratingCount: number }>(`/skills/${encodeURIComponent(id)}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: value }),
      });
      setSkill({ ...skill, rating: result.rating, ratingCount: result.ratingCount });
      setRated(true);
    } catch (e) {
      setError(getFriendlyMessage(e));
    } finally {
      setRatingSaving(false);
    }
  };

  const handleInstallClick = async () => {
    if (!skill) return;
    try {
      const result = await apiFetch<{ ok: boolean; downloads: number }>(`/skills/${encodeURIComponent(id)}/install`, { method: 'POST' });
      setSkill({ ...skill, downloads: result.downloads });
      if (!skill.enabled) {
        await handleToggle();
      }
    } catch (e) {
      setError(getFriendlyMessage(e));
    }
  };

  const loadVersions = async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const data = await getSkillVersions(id);
      setVersions(data.versions || []);
      setVersionsOpen(true);
    } catch (e) {
      setVersionsError(getFriendlyMessage(e));
    } finally {
      setVersionsLoading(false);
    }
  };

  const toggleVersions = () => {
    if (versionsOpen) {
      setVersionsOpen(false);
      return;
    }
    loadVersions();
  };

  const handlePublish = async () => {
    if (!skill) return;
    setPublishing(true);
    setVersionsError(null);
    try {
      await publishSkillVersion(id, {
        version: newVersion || undefined,
        changelog: newChangelog,
        createdBy: 'admin',
      });
      setPublishOpen(false);
      setNewVersion('');
      setNewChangelog('');
      // Refresh detail + versions
      const fresh = await apiFetch<MarketSkill>(`/skills/${encodeURIComponent(id)}`);
      setSkill(fresh);
      await loadVersions();
    } catch (e) {
      setVersionsError(getFriendlyMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!window.confirm('确定回滚到该版本吗？当前 manifest 将被替换。')) return;
    setRollingBack(versionId);
    setVersionsError(null);
    try {
      const result = await rollbackSkill(id, versionId);
      setError('已回滚到 ' + result.version);
      const fresh = await apiFetch<MarketSkill>(`/skills/${encodeURIComponent(id)}`);
      setSkill(fresh);
      await loadVersions();
    } catch (e) {
      setVersionsError(getFriendlyMessage(e));
    } finally {
      setRollingBack(null);
    }
  };

  if (loading) {
    return <div className="settings-loading">加载技能详情...</div>;
  }

  if (!skill) {
    return (
      <div className="skills-page">
        <div className="settings-empty" style={{ padding: '60px 0' }}>
          <h3>技能不存在</h3>
          <button className="btn btn-secondary" onClick={() => navigate('/skills')}>返回市场</button>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-page">
      <div className="skills-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="settings-back-btn" onClick={() => navigate('/skills')} title="返回市场">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>技能详情</h1>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

      <div className="config-card" style={{ padding: 20, maxWidth: 720 }}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', flexShrink: 0 }}>
              <Sparkles size={28} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{skill.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                {skill.version} · {skill.author || 'unknown'} · {skill.source === 'market' ? '市场技能' : '本地技能'}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={14} /> {skill.downloads || 0} 下载</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={14} /> {skill.rating || 0} 评分</span>
                <span className="tag">{skill.category}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {skill.source === 'market' ? (
              <>
                <button className="btn btn-primary" onClick={handleInstallClick} disabled={toggling}>
                  <Download size={14} /> {skill.enabled ? '已安装' : '安装'}
                </button>
                <button className="btn btn-secondary" onClick={() => navigate(`/skills/new?edit=${encodeURIComponent(skill.id)}`)}>
                  <Pencil size={14} /> 编辑
                </button>
                <button className="btn btn-secondary" onClick={handleDelete} disabled={deleting}>
                  <Trash2 size={14} /> 删除
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={handleToggle} disabled={toggling}>
                {skill.enabled ? '停用' : '启用'}
              </button>
            )}
          </div>
        </div>

        {/* 评分 */}
        <div className="skill-detail-section" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div className="skill-detail-label">评分</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(star => {
                  const active = (ratingHover || Math.round(skill.rating || 0)) >= star;
                  return (
                    <button
                      key={star}
                      onClick={() => handleRate(star)}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      disabled={ratingSaving || rated}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: rated ? 'default' : 'pointer',
                        padding: 0,
                        color: active ? '#f5b301' : 'var(--border-color)',
                      }}
                      title={`${star} 星`}
                    >
                      <Star size={22} fill={active ? '#f5b301' : 'none'} />
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{skill.rating || '0'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{skill.ratingCount ? `${skill.ratingCount} 人评分` : '暂无评分'}</span>
            </div>
          </div>
          {rated && <span className="tag success">已评分</span>}
        </div>

        {/* 使用统计 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label"><Activity size={14} style={{ verticalAlign: -2, marginRight: 4 }} />使用统计</div>
          {!stats || stats.totalCalls === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>暂无使用记录 — 技能被会话使用后将在此展示统计。</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{stats.totalCalls}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>总调用次数</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>{stats.successRate}%</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>成功率</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 600 }}>
                    {stats.avgDurationMs != null ? (stats.avgDurationMs >= 1000 ? (stats.avgDurationMs / 1000).toFixed(1) + 's' : stats.avgDurationMs + 'ms') : '-'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>平均耗时</div>
                </div>
              </div>
              {stats.trend.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>近 14 天趋势</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
                    {stats.trend.map(t => {
                      const max = Math.max(...stats.trend.map(x => x.calls)) || 1;
                      return (
                        <div key={t.day} title={`${t.day}: ${t.calls} 次`} style={{
                          width: 16,
                          height: `${Math.max(12, (t.calls / max) * 100)}%`,
                          background: 'var(--accent-color)',
                          opacity: 0.75,
                          borderRadius: 2,
                        }} />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 描述 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label">描述</div>
          <div className="skill-detail-value">{skill.description || '(无描述)'}</div>
        </div>

        {/* 提示词 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label">提示词（System Prompt）</div>
          <pre className="code-block" style={{ padding: 12, fontSize: 13, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{skill.prompt || '(无提示词)'}</pre>
        </div>

        {/* 能力 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label">能力</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(skill.capabilities || []).map(c => <span key={c} className="tag info">{c}</span>)}
            {(skill.capabilities || []).length === 0 && <span style={{ color: 'var(--text-secondary)' }}>暂无</span>}
          </div>
        </div>

        {/* 工具 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label">工具</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(skill.tools || []).map(t => <span key={t} className="tag success">{t}</span>)}
            {(skill.tools || []).length === 0 && <span style={{ color: 'var(--text-secondary)' }}>暂无</span>}
          </div>
        </div>

        {/* 配置 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label">配置</div>
          <pre className="code-block" style={{ padding: 12, fontSize: 13, overflow: 'auto' }}>{JSON.stringify(skill.config || {}, null, 2)}</pre>
        </div>

        {/* 版本历史 */}
        {skill.source === 'market' && (
          <div className="skill-detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="skill-detail-label" style={{ marginBottom: 0 }}>版本历史</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={toggleVersions} disabled={versionsLoading}>
                  <History size={14} /> {versionsOpen ? '收起' : '查看'}
                </button>
                <button className="btn btn-primary" onClick={() => setPublishOpen(!publishOpen)}>
                  <Plus size={14} /> 发布新版本
                </button>
              </div>
            </div>

            {versionsError && <p style={{ color: 'var(--error-color)', fontSize: 13 }}>{versionsError}</p>}

            {/* 发布表单 */}
            {publishOpen && (
              <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 'var(--radius-md)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    placeholder="版本号（留空自动 +1，如 1.1.0）"
                    value={newVersion}
                    onChange={e => setNewVersion(e.target.value)}
                    style={{ width: 200 }}
                  />
                  <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
                    {publishing ? '发布中...' : '发布'}
                  </button>
                </div>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="变更日志（本次改了什么）"
                  value={newChangelog}
                  onChange={e => setNewChangelog(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}

            {/* 版本列表 */}
            {versionsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {versions.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>暂无版本历史</p>
                ) : (
                  versions.map(v => (
                    <div
                      key={v.id}
                      style={{
                        padding: 10,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="tag success">{v.version}</span>
                          {skill.currentVersion === v.version && <span className="tag">当前</span>}
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(v.createdAt).toLocaleString()}</span>
                        </div>
                        {v.changelog && (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{v.changelog}</div>
                        )}
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleRollback(v.id)}
                        disabled={rollingBack === v.id || skill.currentVersion === v.version}
                        title="回滚到该版本"
                      >
                        <RotateCcw size={14} /> 回滚
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 评论区 */}
        <div className="skill-detail-section">
          <div className="skill-detail-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={14} /> 评论 ({comments.length})
          </div>

          {/* 输入区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                placeholder="昵称（可选，将记住）"
                value={nickName}
                onChange={e => setNickName(e.target.value)}
                style={{ width: 180 }}
              />
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {[1, 2, 3, 4, 5].map(star => {
                  const active = (myRating || 0) >= star;
                  return (
                    <button
                      key={star}
                      onClick={() => setMyRating(myRating === star ? null : star)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: active ? '#f5b301' : 'var(--border-color)' }}
                      title={myRating === star ? '取消评分' : `${star} 星`}
                    >
                      <Star size={16} fill={active ? '#f5b301' : 'none'} />
                    </button>
                  );
                })}
                {myRating != null && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>随评论评分</span>}
              </div>
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="写下你的使用体验..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSubmitComment} disabled={!newComment.trim() || submittingComment}>
                <Send size={14} /> {submittingComment ? '发布中...' : '发布评论'}
              </button>
            </div>
          </div>

          {/* 评论列表 */}
          {commentsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>加载评论...</p>
          ) : comments.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>暂无评论，来抢沙发。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.map(c => (
                <div key={c.id} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{displayName(c)}</span>
                      {c.rating != null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, color: '#f5b301' }}>
                          <Star size={12} fill="#f5b301" /> {c.rating}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(c.createdAt).toLocaleString()}</span>
                      {c.sessionId === anonId && (
                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => handleDeleteComment(c.id)} title="删除">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
