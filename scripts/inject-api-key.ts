/**
 * 一键注入 Provider API Key
 *
 * 把真实 API key 写入 SettingsService（持久化到 ~/.workforge/config.json.enc，AES-256-GCM 加密）。
 * 仅对以「非 testMode」正常运行的 server 生效；testMode 下 setApiKey 是空操作。
 *
 * 用法（推荐环境变量，避免 key 进入 shell 历史）：
 *   DEEPSEEK_API_KEY=sk-xxxx npx tsx scripts/inject-api-key.ts
 *   DEEPSEEK_API_KEY=sk-xxxx npx tsx scripts/inject-api-key.ts deepseek
 *   npx tsx scripts/inject-api-key.ts deepseek sk-xxxx
 *   npx tsx scripts/inject-api-key.ts openai sk-xxxx
 */

import http from 'http';

const BASE = process.env.SERVER_URL || 'http://localhost:3001';

function request(path: string, options: any = {}): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts: any = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function mask(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '…' + key.slice(-4);
}

async function main() {
  const provider = (process.argv[2] || process.env.PROVIDER || 'deepseek').toLowerCase();
  const key =
    process.argv[3] ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env[`${provider.toUpperCase()}_API_KEY`];

  if (!key) {
    console.error('缺少 API key。请通过环境变量或参数提供：');
    console.error('  DEEPSEEK_API_KEY=sk-xxxx npx tsx scripts/inject-api-key.ts');
    console.error('  npx tsx scripts/inject-api-key.ts deepseek sk-xxxx');
    process.exit(1);
  }

  // 先确认 server 在线
  try {
    const health = await request('/health');
    if (health.status !== 200) throw new Error('health status ' + health.status);
  } catch (err) {
    console.error(`无法连接 server（${BASE}）。请确认 server 已以真实模式启动。`);
    console.error('  错误: ' + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  const res = await request('/api/settings/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key }),
  });

  if (res.status === 200 && res.data?.ok) {
    console.log(`已注入 provider=${provider} key=${mask(key)} → ${BASE}`);
    console.log('下一步：以真实模式启动 server 后，运行 npx tsx scripts/verification-scenarios.ts 看真实输出');
  } else {
    console.error(`注入失败 status=${res.status} body=${JSON.stringify(res.data)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('注入脚本异常:', err instanceof Error ? err.message : err);
  process.exit(1);
});
