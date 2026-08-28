import { useState, useCallback } from 'react';
import { apiFetch, isServerUnavailable } from '../lib/api';
import { getFriendlyMessage } from '../lib/errors';

export interface Provider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; contextLength?: number; supportsReasoning?: boolean }>;
}

export interface ApiKey {
  provider: string;
  configured: boolean;
}

export interface SettingsData {
  theme?: 'light' | 'dark';
  apiKeys?: Record<string, boolean>;
}

export interface ModelsData {
  providers: Provider[];
}

export interface UseSettingsApiReturn {
  settings: SettingsData | null;
  providers: Provider[];
  apiKeys: ApiKey[];
  serverError: string | null;
  fetchSettings: () => Promise<void>;
  fetchModels: () => Promise<void>;
  updateTheme: (theme: 'light' | 'dark') => Promise<void>;
  saveApiKey: (provider: string, key: string) => Promise<void>;
  deleteApiKey: (provider: string) => Promise<void>;
  addProvider: (provider: { id: string; name: string; baseURL: string; apiKey: string; api?: string; models: Array<{ id: string; name: string }> }) => Promise<void>;
  testConnection: (baseURL: string, apiKey: string, protocol?: string) => Promise<{ success: boolean; message: string }>;
  discoverModels: (baseURL: string, apiKey: string, protocol?: string) => Promise<Array<{ id: string; name?: string }>>;
}

export function useSettingsApi(): UseSettingsApiReturn {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleApiError = useCallback((e: unknown, context: string) => {
    const msg = getFriendlyMessage(e);
    if (isServerUnavailable(e)) {
      setServerError('无法连接到服务器，请确保后端服务已启动 (localhost:3001)');
    } else {
      setServerError(`${context}: ${msg}`);
    }
    console.error(`Failed to ${context}:`, e);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiFetch<SettingsData>('/settings');
      setServerError(null);
      setSettings(data);
      if (data.apiKeys) {
        setApiKeys(Object.entries(data.apiKeys).map(([provider, configured]) => ({
          provider,
          configured
        })));
      }
    } catch (e) {
      handleApiError(e, '加载设置');
    }
  }, [handleApiError]);

  const fetchModels = useCallback(async () => {
    try {
      const data = await apiFetch<ModelsData>('/models');
      setServerError(null);
      setProviders(data.providers || []);
    } catch (e) {
      handleApiError(e, '加载模型列表');
    }
  }, [handleApiError]);

  const updateTheme = useCallback(async (theme: 'light' | 'dark') => {
    setSettings(prev => prev ? { ...prev, theme } : null);
    document.documentElement.setAttribute('data-theme', theme);
    try {
      await apiFetch('/settings/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme })
      });
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  }, []);

  const saveApiKey = useCallback(async (provider: string, key: string) => {
    await apiFetch('/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key })
    });
  }, []);

  const deleteApiKey = useCallback(async (provider: string) => {
    await apiFetch(`/settings/api-keys?provider=${encodeURIComponent(provider)}`, {
      method: 'DELETE'
    });
  }, []);

  const addProvider = useCallback(async (provider: { id: string; name: string; baseURL: string; apiKey: string; models: Array<{ id: string; name: string }> }) => {
    await apiFetch('/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    });
  }, []);

  // 通过服务端代理发现模型：浏览器直连第三方 API 会被 CORS 拦截，必须走后端转发
  const discoverModels = useCallback(async (baseURL: string, apiKey: string, protocol?: string) => {
    const params = new URLSearchParams({ baseURL, apiKey });
    if (protocol) params.set('protocol', protocol);
    const data = await apiFetch<{ models?: Array<{ id?: string; name?: string }> }>(
      `/llm/discover-models?${params.toString()}`
    );
    const models = data.models || [];
    return models.map(m => ({
      id: m.id || m.name || '',
      name: m.name || m.id || ''
    }));
  }, []);

  const testConnection = useCallback(async (baseURL: string, apiKey: string, protocol?: string) => {
    try {
      await discoverModels(baseURL, apiKey, protocol);
      return { success: true, message: '连接成功' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : '连接失败' };
    }
  }, [discoverModels]);

  return {
    settings,
    providers,
    apiKeys,
    serverError,
    fetchSettings,
    fetchModels,
    updateTheme,
    saveApiKey,
    deleteApiKey,
    addProvider,
    testConnection,
    discoverModels
  };
}
