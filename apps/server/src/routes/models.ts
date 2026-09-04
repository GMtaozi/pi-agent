import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from './deps.js';
import 'path';
import { encryptSecret, decryptSecret } from '../encryption.js';

export function registerModelsRoutes(server: FastifyInstance, deps: ServerDeps): void {
  server.get('/api/models', async () => {
    const settings = deps.settingsService.getSettings();

    // 不再内置任何硬编码模型目录：仅返回用户显式添加的供应商
    //（「添加供应商」与「添加自定义供应商」都会写入 customProviders）
    const customProviders = (settings.customProviders || []).map((cp) => ({
      id: cp.id,
      name: cp.name,
      models: (cp.models || []).map((m) => ({
        ...m,
        contextLength: m.contextLength || 0,
        supportsReasoning: m.supportsReasoning || false,
        supportsVision: m.supportsVision || false,
        input: m.supportsVision ? ['text', 'image'] : ['text']
      }))
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    let customModels: any[] = [];
    if (deps.database) {
      const customModelsResult = await deps.database.query('custom_models', 'SELECT * FROM custom_models WHERE enabled = 1 ORDER BY createdAt DESC');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      customModels = customModelsResult.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        provider: 'custom',
        endpoint: row.endpoint,
        modelParams: row.modelParams ? JSON.parse(row.modelParams) : {},
        contextLength: 0,
        supportsReasoning: false,
        supportsVision: false,
        input: ['text']
      }));
    }

    // 仅当存在自定义模型时才追加「自定义模型」分组，避免把空数组混入 providers
    const providers = [...customProviders];
    if (customModels.length > 0) {
      providers.push({ id: 'custom', name: '自定义模型', models: customModels });
    }
    return { providers };
  });

  // 模型 provider 健康探活（熔断状态只读快照 + 可选主动探测）
  server.get('/api/models/health', async (req, res) => {
    const modelRuntime = deps.modelRuntime;
    if (!modelRuntime || typeof modelRuntime.getHealth !== 'function') {
      return res.code(503).send({ error: 'Model runtime unavailable' });
    }
    try {
      // ?probe=1 触发真实探活；缺省仅返回熔断器快照（不发请求）
      const query = (req.query as any) || {};
      const doProbe = query.probe === '1' || query.probe === 'true';
      const body = doProbe
        ? { health: await modelRuntime.probe(), probed: true }
        : { health: modelRuntime.getHealth(), probed: false };
      return res.send(body);
    } catch (error) {
      req.log.error({ error }, 'Model health check failed');
      return res.code(500).send({ error: 'Internal server error' });
    }
  });

  // 根据 baseURL 与协议智能选择 models 候选路径
  function buildCandidatePaths(normalizedBase: string, protocol?: string): string[] {
    const paths: string[] = [];
    if (normalizedBase.endsWith('/v1')) {
      paths.push(`${normalizedBase}/models`);
    } else if (normalizedBase.endsWith('/openai')) {
      paths.push(`${normalizedBase}/v1/models`);
    } else if (protocol === 'anthropic') {
      // Anthropic 没有标准 /models 列表接口，直接尝试 openai 兼容路径
      paths.push(`${normalizedBase}/v1/models`);
      paths.push(`${normalizedBase}/models`);
    } else {
      // openai 兼容：优先当前路径下的 /models，再试 /v1/models
      paths.push(`${normalizedBase}/models`);
      paths.push(`${normalizedBase}/v1/models`);
    }
    return paths;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  function extractModels(data: any): Array<{ id: string; name?: string }> {
    let raw: Array<{ id?: string; name?: string }> = [];
    if (data?.data && Array.isArray(data.data)) {
      raw = data.data;
    } else if (data?.models && Array.isArray(data.models)) {
      raw = data.models;
    } else if (Array.isArray(data)) {
      raw = data;
    }
    return raw
      .map((m) => ({ id: m.id || m.name || '', name: m.name || m.id || '' }))
      .filter((m) => m.id);
  }

  server.get('/api/llm/discover-models', async (req, res) => {
    const { baseURL, apiKey, protocol } = req.query as { baseURL?: string; apiKey?: string; protocol?: string };
    if (!baseURL || !apiKey) {
      return res.status(400).send({ error: 'baseURL and apiKey are required' });
    }
    const normalizedBase = baseURL.replace(/\/$/, '');
    const candidatePaths = buildCandidatePaths(normalizedBase, protocol);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      // 并发探测所有候选路径，取第一个返回非空模型列表的结果。
      // 顺序探测会在慢/挂起的错误路径上耗满整个超时窗口（实测可达数十秒），
      // 并发则只要任一正确路径先返回即可立即响应。
      const found: { models: Array<{ id: string; name?: string }> | null } = { models: null };
      let lastError: string | undefined;
      await new Promise<void>((resolve) => {
        let remaining = candidatePaths.length;
        let finished = false;
        const finish = () => {
          if (!finished) {
            finished = true;
            resolve();
          }
        };
        candidatePaths.forEach((modelsUrl) => {
          fetch(modelsUrl, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          })
            .then(async (response) => {
              if (!response.ok) {
                lastError = `${response.status} ${await response.text().catch(() => response.statusText)}`;
                if (--remaining === 0) finish();
                return;
              }
              const models = extractModels(await response.json());
              if (!finished && models.length > 0) {
                found.models = models;
                finish();
              } else if (--remaining === 0) {
                finish();
              }
            })
            .catch((err) => {
              lastError = err instanceof Error ? err.message : String(err);
              if (--remaining === 0) finish();
            });
        });
      });

      clearTimeout(timeout);
      if (found.models && found.models.length > 0) {
        return { models: found.models };
      }
      return res.status(500).send({ error: `Failed to discover models from any path. Last error: ${lastError || 'no models found'}` });
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        return res.status(408).send({ error: 'Request timeout - provider took too long to respond' });
      }
      return res.status(500).send({ error: error instanceof Error ? error.message : 'Failed to discover models' });
    }
  });

  server.get('/api/models/custom', async () => {
    try {
      if (!deps.database) {
        return { models: [] };
      }
      const result = await deps.database.query('custom_models', 'SELECT * FROM custom_models WHERE enabled = 1 ORDER BY createdAt DESC');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const models = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        endpoint: row.endpoint,
        modelParams: row.modelParams ? JSON.parse(row.modelParams) : {},
        enabled: row.enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
      return { models };
    } catch (err) {
      server.log.error(err);
      return { models: [] };
    }
  });

  server.post('/api/models/custom', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { name, provider, endpoint, apiKey, modelParams } = req.body as {
        name?: string;
        provider?: string;
        endpoint?: string;
        apiKey?: string;
        modelParams?: Record<string, unknown>;
      };

      if (!name || !provider || !endpoint || !apiKey) {
        return res.status(400).send({ error: 'name, provider, endpoint, and apiKey are required' });
      }

      const id = 'custom-model-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const now = new Date().toISOString();

      await deps.database.query('custom_models', 'INSERT INTO custom_models (id, name, provider, endpoint, apiKey, modelParams, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        id,
        name,
        provider,
        endpoint,
        encryptSecret(apiKey),
        JSON.stringify(modelParams || {}),
        1,
        now,
        now
      ]);

      return { ok: true, id, name, provider, endpoint, modelParams: modelParams || {} };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to create custom model' });
    }
  });

  server.put('/api/models/custom/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      const { name, provider, endpoint, apiKey, modelParams, enabled } = req.body as {
        name?: string;
        provider?: string;
        endpoint?: string;
        apiKey?: string;
        modelParams?: Record<string, unknown>;
        enabled?: boolean;
      };

      const updates: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      const values: any[] = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (provider !== undefined) { updates.push('provider = ?'); values.push(provider); }
      if (endpoint !== undefined) { updates.push('endpoint = ?'); values.push(endpoint); }
      if (apiKey !== undefined) { updates.push('apiKey = ?'); values.push(encryptSecret(apiKey)); }
      if (modelParams !== undefined) { updates.push('modelParams = ?'); values.push(JSON.stringify(modelParams)); }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }

      updates.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      await deps.database.query('custom_models', `UPDATE custom_models SET ${updates.join(', ')} WHERE id = ?`, values);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to update custom model' });
    }
  });

  server.delete('/api/models/custom/:id', async (req, res) => {
    try {
      if (!deps.database) {
        return res.status(500).send({ error: 'Database not available' });
      }
      const { id } = req.params as { id: string };
      await deps.database.query('custom_models', 'DELETE FROM custom_models WHERE id = ?', [id]);
      return { ok: true };
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to delete custom model' });
    }
  });

  server.post('/api/models/custom/:id/verify', async (req, res) => {
    try {
      const { id } = req.params as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      let customModel: any = null;

      if (deps.database) {
        const result = await deps.database.query('custom_models', 'SELECT * FROM custom_models WHERE id = ?', [id]);
        customModel = result.rows[0];
      }

      if (!customModel) {
        return res.status(404).send({ error: 'Custom model not found' });
      }

      const { endpoint, apiKey: bodyApiKey } = (req.body || {}) as { endpoint?: string; apiKey?: string };
      const apiKey = bodyApiKey || decryptSecret(customModel?.apiKey || '');
      if (!endpoint || !apiKey) {
        return res.status(400).send({ error: 'endpoint and apiKey are required' });
      }

      const normalizedBase = endpoint.replace(/\/$/, '');

      // 尝试多个可能的 models 路径（不同 provider 的路径结构不同）
      const candidatePaths = [
        `${normalizedBase}/models`,
        `${normalizedBase}/v1/models`,
      ];
      if (normalizedBase.endsWith('/v1')) {
        const baseWithoutV1 = normalizedBase.slice(0, -3);
        candidatePaths.push(`${baseWithoutV1}/models`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        let lastError: string | undefined;
        for (const modelsUrl of candidatePaths) {
          try {
            const response = await fetch(modelsUrl, {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              signal: controller.signal
            });

            if (response.ok) {
              return { ok: true, message: 'API key is valid' };
            }
            lastError = `${response.status} ${await response.text().catch(() => response.statusText)}`;
          } catch {
            // 继续尝试下一个路径
          }
        }

        clearTimeout(timeout);
        return res.status(500).send({ error: `Failed to verify: ${lastError || 'all paths failed'}` });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === 'AbortError') {
          return res.status(408).send({ error: 'Request timeout - provider took too long to respond (30s limit)' });
        }
        throw error;
      }
    } catch (err) {
      server.log.error(err);
      res.status(500).send({ error: 'Failed to verify custom model: ' + (err instanceof Error ? err.message : String(err)) });
    }
  });
}
