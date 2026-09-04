import { useState, useEffect } from 'react';
import { X, Trash2, Edit3, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useSettingsApi } from '../hooks/useSettingsApi';
import { MAINSTREAM_PROVIDERS } from '../lib/providers';
import {
  getCustomModels,
  createCustomModel,
  updateCustomModel,
  deleteCustomModel,
  verifyCustomModel,
  type CustomModel,
} from '../lib/api';

interface ModelsSettingsProps {
  providers: ReturnType<typeof useSettingsApi>['providers'];
  apiKeys: ReturnType<typeof useSettingsApi>['apiKeys'];
  onSaveKey: (provider: string, key: string) => Promise<void>;
  onDeleteKey: (provider: string) => Promise<void>;
  onAddCustomProvider: (provider: { id: string; name: string; baseURL: string; apiKey: string; api?: string; models: Array<{ id: string; name: string }> }) => Promise<void>;
}

export default function ModelsSettings({
  providers,
  apiKeys,
  onSaveKey,
  onDeleteKey,
  onAddCustomProvider
}: ModelsSettingsProps) {
  const { testConnection, discoverModels } = useSettingsApi();

  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ provider: string; displayName: string } | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | undefined>(undefined);
  const [savedTarget, setSavedTarget] = useState<{ provider: string; displayName: string } | undefined>(undefined);
  const [_dismissedSetup, setDismissedSetup] = useState<ReadonlySet<string>>(() => new Set());

  // 配置表单状态
  const [setupKey, setSetupKey] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupProviderId, setSetupProviderId] = useState('');

  // 编辑表单状态
  const [editKey, setEditKey] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // 自定义提供商表单状态
  const [customRoute, setCustomRoute] = useState('');
  const [customName, setCustomName] = useState('');
  const [customBaseURL, setCustomBaseURL] = useState('');
  const [customProtocol, setCustomProtocol] = useState('openai');
  const [customKey, setCustomKey] = useState('');
  const [customModels, setCustomModels] = useState<Array<{ id: string; name: string }>>([]);
  const [customBusy, setCustomBusy] = useState(false);

  // 获取模型相关状态
  const [candidates, setCandidates] = useState<Array<{ id: string; name?: string }>>([]);
  const [showFetchDialog, setShowFetchDialog] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());

  // 测试连接状态
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | undefined>(undefined);

  // 自定义模型状态
  const [customModelList, setCustomModelList] = useState<CustomModel[]>([]);
  const [customModelsLoading, setCustomModelsLoading] = useState(false);
  const [customModelForm, setCustomModelForm] = useState<{
    id?: string;
    name: string;
    provider: string;
    endpoint: string;
    apiKey: string;
    temperature?: number;
    maxTokens?: number;
  }>({
    name: '',
    provider: 'custom',
    endpoint: '',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 2048,
  });
  const [customModelSaving, setCustomModelSaving] = useState(false);
  const [customModelVerifying, setCustomModelVerifying] = useState(false);
  const [customModelVerifyResult, setCustomModelVerifyResult] = useState<{ success: boolean; message: string } | undefined>(undefined);
  const [customModelError, setCustomModelError] = useState<string | undefined>(undefined);
  const [editingCustomModelId, setEditingCustomModelId] = useState<string | undefined>(undefined);
  // 自定义模型区域默认不展示，点击「添加自定义模型」后才出现表单
  const [showCustomModelForm, setShowCustomModelForm] = useState(false);

  // 计算已配置和未配置的提供商
  // 「自定义模型」来自 custom_models 表，由页面底部专属卡片管理，不在供应商列表中重复展示
  const visibleProviders = providers.filter(p => p.id !== 'custom');
  const providerIds = new Set(visibleProviders.map(p => p.id));
  
  // 可添加的主流供应商（尚未添加的）
  const availableMainstream = MAINSTREAM_PROVIDERS.filter(p => !providerIds.has(p.id));

  useEffect(() => {
    if (savedTarget) {
      const timer = setTimeout(() => setSavedTarget(undefined), 3000);
      return () => clearTimeout(timer);
    }
  }, [savedTarget]);

  useEffect(() => {
    loadCustomModels();
  }, [loadCustomModels]);

  const getProviderName = (id: string) => {
    return providers.find(p => p.id === id)?.name || id;
  };

  const announceSaved = (target: { provider: string; displayName: string }) => {
    setSavedTarget(target);
  };

  const closeEditor = (changed: boolean, target: { provider: string; displayName: string }) => {
    setEditing(undefined);
    setAdding(false);
    setDeclaring(false);
    if (changed) announceSaved(target);
  };

  const closeSetup = (changed: boolean, target: { provider: string; displayName: string }) => {
    setDismissedSetup(previous => new Set([...previous, target.provider]));
    if (changed) announceSaved(target);
  };

  const _handleSetupSave = async (providerId: string) => {
    if (!setupKey.trim()) return;
    setSetupSaving(true);
    setDeleteFailure(undefined);
    try {
      await onSaveKey(providerId, setupKey.trim());
      setSetupKey('');
      closeSetup(true, { provider: providerId, displayName: getProviderName(providerId) });
    } catch (e) {
      setDeleteFailure(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSetupSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!editing || !editKey.trim()) return;
    setEditSaving(true);
    setDeleteFailure(undefined);
    try {
      await onSaveKey(editing, editKey.trim());
      setEditKey('');
      setEditing(undefined);
      announceSaved({ provider: editing, displayName: getProviderName(editing) });
    } catch (e) {
      setDeleteFailure(e instanceof Error ? e.message : '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddMainstream = async () => {
    if (!setupProviderId || !setupKey.trim()) return;
    setSetupSaving(true);
    setDeleteFailure(undefined);
    try {
      const providerConfig = MAINSTREAM_PROVIDERS.find(p => p.id === setupProviderId);
      if (!providerConfig) return;
      
      await onAddCustomProvider({
        id: providerConfig.id,
        name: providerConfig.name,
        baseURL: providerConfig.baseURL,
        apiKey: setupKey.trim(),
        api: providerConfig.api,
        models: providerConfig.models
      });
      
      setSetupKey('');
      setSetupProviderId('');
      setAdding(false);
      announceSaved({ provider: providerConfig.id, displayName: providerConfig.name });
    } catch (e) {
      setDeleteFailure(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSetupSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteFailure(undefined);
    try {
      await onDeleteKey(deleteTarget.provider);
      setDeleteTarget(undefined);
      announceSaved({ provider: deleteTarget.provider, displayName: deleteTarget.displayName });
    } catch (e) {
      setDeleteFailure(e instanceof Error ? e.message : '删除失败');
      setDeleting(false);
    }
  };

  const fetchModels = async () => {
    if (!customBaseURL || !customKey) {
      setFetchError('请先填写 API 地址和 API 密钥');
      setShowFetchDialog(true);
      return;
    }
    setFetching(true);
    setFetchError(undefined);
    try {
      const models = await discoverModels(customBaseURL.trim(), customKey.trim(), customProtocol);
      setCandidates(models);
      setPicked(new Set());
      setShowFetchDialog(true);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '获取模型列表失败');
      setShowFetchDialog(true);
    } finally {
      setFetching(false);
    }
  };

  const adoptPicked = () => {
    const existingIds = new Set(customModels.map(m => m.id));
    const newModels = [...customModels];
    for (const candidate of candidates) {
      if (picked.has(candidate.id) && !existingIds.has(candidate.id)) {
        newModels.push({
          id: candidate.id,
          name: candidate.name || candidate.id
        });
      }
    }
    setCustomModels(newModels);
    setShowFetchDialog(false);
    setCandidates([]);
    setPicked(new Set());
  };

  const handleTestConnection = async () => {
    if (!customBaseURL || !customKey) return;
    setTesting(true);
    setTestResult(undefined);
    try {
      const result = await testConnection(customBaseURL.trim(), customKey.trim(), customProtocol);
      setTestResult(result);
    } catch (_e) {
      setTestResult({ success: false, message: '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddCustom = async () => {
    // 验证必填字段
    if (!customRoute || !customName || !customBaseURL || !customKey) {
      setDeleteFailure('请填写所有必填字段');
      return;
    }
    // 验证每个模型都有 ID 和名称
    for (const model of customModels) {
      if (!model.id || !model.name) {
        setDeleteFailure('请填写所有模型的 ID 和名称');
        return;
      }
    }
    setCustomBusy(true);
    setDeleteFailure(undefined);
    try {
      await onAddCustomProvider({
        id: customRoute,
        name: customName,
        baseURL: customBaseURL.trim(),
        apiKey: customKey.trim(),
        api: customProtocol,
        models: customModels
      });
      // 重置表单
      setCustomRoute('');
      setCustomName('');
      setCustomBaseURL('');
      setCustomProtocol('openai');
      setCustomKey('');
      setCustomModels([]);
      setDeclaring(false);
      setSavedTarget({ provider: customRoute, displayName: customName });
      setTestResult(undefined);
    } catch (e) {
      setDeleteFailure(e instanceof Error ? e.message : '添加失败');
    } finally {
      setCustomBusy(false);
    }
  };

  const renderCredentialDot = (providerId: string) => {
    const configured = apiKeys.some(k => k.provider === providerId && k.configured);
    if (configured) {
      return (
        <span
          className="credential-dot configured"
          role="img"
          aria-label="API 密钥已配置"
          title="API 密钥已配置"
        />
      );
    }
    return (
      <span
        className="credential-dot missing"
        role="img"
        aria-label="API 密钥未配置"
        title="API 密钥未配置"
      />
    );
  };

  async function loadCustomModels() {
    setCustomModelsLoading(true);
    setCustomModelError(undefined);
    try {
      const models = await getCustomModels();
      setCustomModelList(models);
    } catch (e) {
      setCustomModelError(e instanceof Error ? e.message : '加载自定义模型失败');
    } finally {
      setCustomModelsLoading(false);
    }
  }

  const handleSaveCustomModel = async () => {
    if (!customModelForm.name || !customModelForm.endpoint || !customModelForm.apiKey) {
      setCustomModelError('请填写名称、API endpoint 和 API key');
      return;
    }
    setCustomModelSaving(true);
    setCustomModelError(undefined);
    setCustomModelVerifyResult(undefined);
    try {
      if (editingCustomModelId) {
        await updateCustomModel(editingCustomModelId, {
          name: customModelForm.name,
          endpoint: customModelForm.endpoint,
          apiKey: customModelForm.apiKey,
          modelParams: {
            temperature: customModelForm.temperature,
            max_tokens: customModelForm.maxTokens,
          },
        });
      } else {
        await createCustomModel({
          name: customModelForm.name,
          provider: customModelForm.provider,
          endpoint: customModelForm.endpoint,
          apiKey: customModelForm.apiKey,
          modelParams: {
            temperature: customModelForm.temperature,
            max_tokens: customModelForm.maxTokens,
          },
        });
      }
      setCustomModelForm({
        name: '',
        provider: 'custom',
        endpoint: '',
        apiKey: '',
        temperature: 0.7,
        maxTokens: 2048,
      });
      setEditingCustomModelId(undefined);
      await loadCustomModels();
    } catch (e) {
      setCustomModelError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setCustomModelSaving(false);
    }
  };

  const handleEditCustomModel = (model: CustomModel) => {
    setEditingCustomModelId(model.id);
    setShowCustomModelForm(true);
    setCustomModelForm({
      id: model.id,
      name: model.name,
      provider: model.provider,
      endpoint: model.endpoint,
      apiKey: '',
      temperature: model.modelParams?.temperature as number | undefined,
      maxTokens: model.modelParams?.max_tokens as number | undefined,
    });
    setCustomModelVerifyResult(undefined);
  };

  const handleDeleteCustomModel = async (id: string) => {
    if (!confirm('确定要删除这个自定义模型吗？')) return;
    setCustomModelError(undefined);
    try {
      await deleteCustomModel(id);
      if (editingCustomModelId === id) {
        setCustomModelForm({
          name: '',
          provider: 'custom',
          endpoint: '',
          apiKey: '',
          temperature: 0.7,
          maxTokens: 2048,
        });
        setEditingCustomModelId(undefined);
      }
      await loadCustomModels();
    } catch (e) {
      setCustomModelError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleVerifyCustomModel = async () => {
    if (!customModelForm.endpoint || !customModelForm.apiKey) {
      setCustomModelVerifyResult({ success: false, message: '请先填写 endpoint 和 apiKey' });
      return;
    }
    setCustomModelVerifying(true);
    setCustomModelVerifyResult(undefined);
    try {
      const result = await verifyCustomModel(
        editingCustomModelId || '',
        customModelForm.endpoint,
        customModelForm.apiKey
      );
      setCustomModelVerifyResult({
        success: result.ok,
        message: result.message || (result.ok ? '验证成功' : '验证失败'),
      });
    } catch (_e) {
      setCustomModelVerifyResult({ success: false, message: '验证失败' });
    } finally {
      setCustomModelVerifying(false);
    }
  };

  const handleCancelCustomModelEdit = () => {
    setCustomModelForm({
      name: '',
      provider: 'custom',
      endpoint: '',
      apiKey: '',
      temperature: 0.7,
      maxTokens: 2048,
    });
    setEditingCustomModelId(undefined);
    setCustomModelError(undefined);
    setCustomModelVerifyResult(undefined);
    setShowCustomModelForm(false);
  };

  return (
    <div className="models-settings">
      {savedTarget !== undefined && (
        <p className="saved-notice" role="status" aria-live="polite">
          已保存 {savedTarget.displayName || savedTarget.provider}。
        </p>
      )}

      {deleteFailure !== undefined && (
        <p className="error-text">{deleteFailure}</p>
      )}

      <ul className="provider-rows">
        {visibleProviders.map((row) => {
          const target = { provider: row.id, displayName: row.name };
          const open = !adding && !declaring && editing === row.id;
          const _credentialConfigured = apiKeys.some(k => k.provider === row.id && k.configured);

          return (
            <li key={row.id} className="row-card">
              <div className="row-head">
                <span className="row-identity">
                  <span className="row-name">{row.name}</span>
                  {renderCredentialDot(row.id)}
                </span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSavedTarget(undefined);
                      setDeclaring(false);
                      setAdding(false);
                      setEditing(open ? undefined : row.id);
                      setEditKey('');
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setSavedTarget(undefined);
                      setDeleteFailure(undefined);
                      setDeleteTarget(target);
                    }}
                  >
                    删除
                  </button>
                </span>
              </div>
              {open && (
                <div className="editor">
                  <div className="field">
                    <span className="field-label">API 密钥</span>
                    <input
                      className="input"
                      type="password"
                      placeholder="输入 API 密钥，或留空使用环境认证"
                      value={editKey}
                      onChange={e => setEditKey(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditSave(); }}
                    />
                  </div>
                  <div className="editor-actions">
                    <button className="secondary-button" onClick={() => closeEditor(false, target)}>
                      取消
                    </button>
                    <button className="primary-button" onClick={() => handleEditSave()} disabled={editSaving || !editKey.trim()}>
                      {editSaving ? '保存中…' : '应用'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="add-block">
        {adding && (
          <div className="add-card">
            <div className="field">
              <span className="field-label">选择供应商</span>
              <select
                className="input select-input"
                value={setupProviderId}
                onChange={e => setSetupProviderId(e.target.value)}
              >
                <option value="">选择供应商</option>
                {availableMainstream.map(row => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">API 密钥</span>
              <input
                className="input"
                type="password"
                placeholder="输入 API 密钥"
                value={setupKey}
                onChange={e => setSetupKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddMainstream(); }}
              />
            </div>
            <div className="editor-actions">
              <button className="secondary-button" onClick={() => { setAdding(false); setSetupProviderId(''); }}>
                取消
              </button>
              <button className="primary-button" onClick={handleAddMainstream} disabled={setupSaving || !setupProviderId || !setupKey.trim()}>
                {setupSaving ? '添加中…' : '添加'}
              </button>
            </div>
          </div>
        )}

        {declaring && (
          <div className="add-card">
            <div className="editor">
              <div className="editor-header">
                <span className="editor-title">自定义提供商</span>
              </div>
              <div className="field">
                <span className="field-label">提供商 ID</span>
                <input
                  className="input"
                  value={customRoute}
                  onChange={e => setCustomRoute(e.target.value)}
                  placeholder="my-provider"
                />
              </div>
              <div className="field">
                <span className="field-label">显示名称</span>
                <input
                  className="input"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="我的提供商"
                />
              </div>
              <div className="field">
                <span className="field-label">API 地址</span>
                <input
                  className="input"
                  value={customBaseURL}
                  onChange={e => setCustomBaseURL(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <div className="field">
                <span className="field-label">API 协议</span>
                <select
                  className="input select-input"
                  value={customProtocol}
                  onChange={e => setCustomProtocol(e.target.value)}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic 兼容</option>
                </select>
              </div>
              <div className="field">
                <span className="field-label">API 密钥</span>
                <input
                  className="input"
                  type="password"
                  value={customKey}
                  onChange={e => setCustomKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div className="field">
                <span className="field-label">模型列表</span>
                {customModels.length === 0 && (
                  <p className="setting-description">暂无模型，可手动添加或填写密钥后自动获取。</p>
                )}
                {customModels.map((model, index) => (
                  <div key={index} className="model-row">
                    <input
                      className="input"
                      value={model.id}
                      onChange={e => {
                        const newModels = [...customModels];
                        newModels[index] = { ...model, id: e.target.value };
                        setCustomModels(newModels);
                      }}
                      placeholder="模型 ID"
                    />
                    <input
                      className="input"
                      value={model.name}
                      onChange={e => {
                        const newModels = [...customModels];
                        newModels[index] = { ...model, name: e.target.value };
                        setCustomModels(newModels);
                      }}
                      placeholder="显示名称"
                    />
                    {customModels.length > 0 && (
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setCustomModels(customModels.filter((_, i) => i !== index))}
                        aria-label="删除模型"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="link-button"
                  onClick={fetchModels}
                  disabled={fetching || !customBaseURL || !customKey}
                  style={{ alignSelf: 'flex-start', marginTop: 8 }}
                >
                  {fetching ? '获取中…' : '获取可用模型'}
                </button>
                <button
                  className="add-model-button"
                  onClick={() => setCustomModels([...customModels, { id: '', name: '' }])}
                >
                  + 添加模型
                </button>
              </div>
              <div className="field">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleTestConnection}
                  disabled={testing || !customBaseURL || !customKey}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {testing ? '测试中…' : '测试连接'}
                </button>
                {testResult && (
                  <p className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.message}
                  </p>
                )}
              </div>
              <div className="editor-actions">
                <button className="secondary-button" onClick={() => setDeclaring(false)}>
                  取消
                </button>
                <button className="primary-button" onClick={handleAddCustom} disabled={customBusy}>
                  {customBusy ? '创建中…' : '创建提供商'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!adding && !declaring && (
          <div className="add-actions">
            <button
              type="button"
              className="add-button"
              disabled={availableMainstream.length === 0}
              onClick={() => {
                setSavedTarget(undefined);
                setDeclaring(false);
                setAdding(true);
                setSetupProviderId('');
                setSetupKey('');
              }}
            >
              <span className="add-icon">+</span>
              添加供应商
            </button>
            <button
              type="button"
              className="add-button"
              onClick={() => {
                setSavedTarget(undefined);
                setAdding(false);
                setEditing(undefined);
                setDeclaring(true);
              }}
            >
              <span className="add-icon">+</span>
              添加自定义提供商
            </button>
            <button
              type="button"
              className="add-button"
              onClick={() => {
                setSavedTarget(undefined);
                setShowCustomModelForm(true);
              }}
            >
              <span className="add-icon">+</span>
              添加自定义模型
            </button>
          </div>
        )}
      </div>

      {/* 获取模型弹窗 */}
      {showFetchDialog && (
        <div className="modal-overlay" onClick={() => setShowFetchDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">选择要添加的模型</h3>
            <div className="modal-body">
              以下是该提供商可用模型，请勾选要添加的模型。
            </div>
            {fetchError && <p className="error-text">{fetchError}</p>}
            <div className="candidate-list">
              {candidates.map(candidate => (
                <label key={candidate.id} className="candidate-label">
                  <input
                    type="checkbox"
                    checked={picked.has(candidate.id)}
                    onChange={() => {
                      setPicked(current => {
                        const next = new Set(current);
                        if (next.has(candidate.id)) {
                          next.delete(candidate.id);
                        } else {
                          next.add(candidate.id);
                        }
                        return next;
                      });
                    }}
                  />
                  <span className="candidate-id">{candidate.id}</span>
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button className="secondary-button" onClick={() => setShowFetchDialog(false)}>
                取消
              </button>
              <button className="primary-button" onClick={adoptPicked}>
                添加所选
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(undefined)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">删除 {deleteTarget.displayName}？</h3>
            <div className="modal-body">
              删除 {deleteTarget.displayName} 会移除其配置。其使用的凭证（如有）由其他位置管理，将会保留。
            </div>
            <div className="modal-footer">
              <button className="secondary-button" onClick={() => setDeleteTarget(undefined)}>
                取消
              </button>
              <button
                className="danger-button"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定义模型：默认不展示，点击「添加自定义模型」或已有自定义模型时显示 */}
      {(showCustomModelForm || customModelList.length > 0) && (
      <div className="config-card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="title">自定义模型</div>
            <div className="desc">添加独立配置的模型，每个模型可单独设置 endpoint 和 API key</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {customModelList.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                onClick={loadCustomModels}
                disabled={customModelsLoading}
              >
                {customModelsLoading ? '刷新中…' : '刷新'}
              </button>
            )}
            {!showCustomModelForm && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowCustomModelForm(true)}
              >
                添加自定义模型
              </button>
            )}
          </div>
        </div>

        {customModelError && <p className="error-text" style={{ marginBottom: 12 }}>{customModelError}</p>}

        {/* 自定义模型列表 */}
        <div style={{ marginBottom: 20 }}>
          {customModelList.length === 0 ? (
            <p className="setting-description">暂无自定义模型</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customModelList.map((model) => (
                <div
                  key={model.id}
                  style={{
                    padding: 12,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{model.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {model.provider} · {model.endpoint}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleEditCustomModel(model)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDeleteCustomModel(model.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 自定义模型表单 */}
        {showCustomModelForm && (
        <div className="editor">
          <div className="editor-header">
            <span className="editor-title">{editingCustomModelId ? '编辑自定义模型' : '添加自定义模型'}</span>
          </div>
          <div className="field">
            <span className="field-label">模型名称 *</span>
            <input
              className="input"
              value={customModelForm.name}
              onChange={e => setCustomModelForm({ ...customModelForm, name: e.target.value })}
              placeholder="我的自定义模型"
            />
          </div>
          <div className="field">
            <span className="field-label">API Endpoint *</span>
            <input
              className="input"
              value={customModelForm.endpoint}
              onChange={e => setCustomModelForm({ ...customModelForm, endpoint: e.target.value })}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="field">
            <span className="field-label">API Key *</span>
            <input
              className="input"
              type="password"
              value={customModelForm.apiKey}
              onChange={e => setCustomModelForm({ ...customModelForm, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
          <div className="field">
            <span className="field-label">Temperature</span>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={customModelForm.temperature}
              onChange={e => setCustomModelForm({ ...customModelForm, temperature: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <span className="field-label">Max Tokens</span>
            <input
              className="input"
              type="number"
              step="1"
              min="1"
              value={customModelForm.maxTokens}
              onChange={e => setCustomModelForm({ ...customModelForm, maxTokens: parseInt(e.target.value) || 2048 })}
            />
          </div>

          {customModelVerifyResult && (
            <div className={`test-result ${customModelVerifyResult.success ? 'success' : 'error'}`} style={{ marginBottom: 12 }}>
              {customModelVerifyResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {customModelVerifyResult.message}
            </div>
          )}

          <div className="editor-actions">
            <button className="secondary-button" onClick={handleCancelCustomModelEdit}>
              取消
            </button>
            <button
              className="secondary-button"
              onClick={handleVerifyCustomModel}
              disabled={customModelVerifying || !customModelForm.endpoint || !customModelForm.apiKey}
            >
              {customModelVerifying ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> 验证中…</> : '验证连接'}
            </button>
            <button
              className="primary-button"
              onClick={handleSaveCustomModel}
              disabled={customModelSaving}
            >
              {customModelSaving ? '保存中…' : (editingCustomModelId ? '更新' : '添加')}
            </button>
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  );
}