import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';

export function registerSettingsRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/settings', async () => {
    const settings = deps.settingsService.getSettings();
    // Never expose raw API keys; only reveal whether a provider is configured.
    const maskedApiKeys: Record<string, boolean> = {};
    for (const provider of Object.keys(settings.apiKeys || {})) {
      maskedApiKeys[provider] = true;
    }
    return {
      ...settings,
      apiKeys: maskedApiKeys,
      customProviders: settings.customProviders || []
    };
  });

  server.post('/api/settings/theme', async (req, res) => {
    const { theme } = req.body as { theme?: string };
    if (theme !== 'light' && theme !== 'dark') {
      return res.status(400).send({ error: 'theme must be "light" or "dark"' });
    }
    deps.settingsService.setTheme(theme);
    return { ok: true, theme };
  });

  server.post('/api/settings/api-keys', async (req, res) => {
    const { provider, key } = req.body as { provider?: string; key?: string };
    if (!provider || !key) {
      return res.status(400).send({ error: 'provider and key are required' });
    }
    deps.settingsService.setApiKey(provider, key);
    // 配置变更后重建模型运行时，使新密钥立即生效
    await deps.agentEngine?.syncProviders?.();
    return { ok: true };
  });

  server.delete('/api/settings/api-keys', async (req, res) => {
    const { provider } = req.query as { provider?: string };
    if (!provider) {
      return res.status(400).send({ error: 'provider is required' });
    }
    deps.settingsService.removeApiKey(provider);
    deps.settingsService.removeCustomProvider(provider);
    await deps.agentEngine?.syncProviders?.();
    return { ok: true };
  });

  server.post('/api/settings/providers', async (req, res) => {
    const provider = req.body as {
      id: string;
      name: string;
      baseURL: string;
      apiKey: string;
      models: Array<{ id: string; name: string }>;
    };
    if (!provider?.id || !provider?.name || !provider?.baseURL || !provider?.apiKey) {
      return res.status(400).send({ error: 'id, name, baseURL, and apiKey are required' });
    }
    deps.settingsService.addCustomProvider(provider);
    // Also save the API key
    deps.settingsService.setApiKey(provider.id, provider.apiKey);
    await deps.agentEngine?.syncProviders?.();
    return { ok: true };
  });
}
