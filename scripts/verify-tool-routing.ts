import http from 'http';

const BASE = 'http://localhost:3001';

function request(path: string, method = 'GET', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verify() {
  console.log('=== Tool Routing Verification ===\n');

  // Step 1: Check default strategy
  console.log('[1] GET /api/tools/routing-strategy');
  const defaultRes = await request('/api/tools/routing-strategy');
  console.log('Status:', defaultRes.status);
  console.log('Response:', JSON.stringify(defaultRes.data, null, 2));
  if (defaultRes.status !== 200 || !defaultRes.data?.strategy) {
    console.error('❌ Failed to get default strategy');
    process.exit(1);
  }
  console.log('✅ Default strategy retrieved\n');

  // Step 2: Save performance strategy
  console.log('[2] POST /api/tools/routing-strategy (performance)');
  const saveRes = await request('/api/tools/routing-strategy', 'POST', {
    strategy: 'performance',
    threshold: 0.7,
    preferredTools: [],
    fallbackTool: 'default',
  });
  console.log('Status:', saveRes.status);
  console.log('Response:', JSON.stringify(saveRes.data, null, 2));
  if (saveRes.status !== 200 || !saveRes.data?.ok) {
    console.error('❌ Failed to save strategy');
    process.exit(1);
  }
  console.log('✅ Strategy saved\n');

  // Step 3: Verify saved strategy
  console.log('[3] GET /api/tools/routing-strategy (verify)');
  await sleep(500);
  const verifyRes = await request('/api/tools/routing-strategy');
  console.log('Status:', verifyRes.status);
  console.log('Response:', JSON.stringify(verifyRes.data, null, 2));
  if (verifyRes.data?.strategy?.strategy !== 'performance') {
    console.error('❌ Strategy not persisted correctly');
    process.exit(1);
  }
  console.log('✅ Strategy persisted as performance\n');

  // Step 4: Save cost strategy
  console.log('[4] POST /api/tools/routing-strategy (cost)');
  const costRes = await request('/api/tools/routing-strategy', 'POST', {
    strategy: 'cost',
    threshold: 0.6,
    preferredTools: ['read_file'],
    fallbackTool: 'default',
  });
  console.log('Status:', costRes.status);
  console.log('Response:', JSON.stringify(costRes.data, null, 2));
  if (costRes.status !== 200 || !costRes.data?.ok) {
    console.error('❌ Failed to save cost strategy');
    process.exit(1);
  }
  console.log('✅ Cost strategy saved\n');

  // Step 5: Verify routing-stats endpoint
  console.log('[5] GET /api/tools/routing-stats');
  const statsRes = await request('/api/tools/routing-stats');
  console.log('Status:', statsRes.status);
  console.log('Response:', JSON.stringify(statsRes.data, null, 2));
  if (statsRes.status !== 200 || !statsRes.data?.tools) {
    console.error('❌ Failed to get routing stats');
    process.exit(1);
  }
  console.log('✅ Routing stats endpoint works\n');

  // Step 6: Reset to default
  console.log('[6] POST /api/tools/routing-strategy (reset to balanced)');
  const resetRes = await request('/api/tools/routing-strategy', 'POST', {
    strategy: 'balanced',
    threshold: 0.7,
    preferredTools: [],
    fallbackTool: 'default',
  });
  console.log('Status:', resetRes.status);
  console.log('Response:', JSON.stringify(resetRes.data, null, 2));
  if (resetRes.status !== 200 || !resetRes.data?.ok) {
    console.error('❌ Failed to reset strategy');
    process.exit(1);
  }
  console.log('✅ Strategy reset\n');

  console.log('=== All Verification Passed ===');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
