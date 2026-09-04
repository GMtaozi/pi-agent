import http from 'http';

const BASE = 'http://localhost:3001';

async function request(path: string, options: any = {}) {
  return new Promise<any>((resolve, reject) => {
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
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function main() {
  console.log('=== Model Routing API Verification ===\n');

  // 1. Get initial strategy
  console.log('1. GET /api/model-routing/strategy');
  const getRes = await request('/api/model-routing/strategy');
  console.log(`   Status: ${getRes.status}`);
  console.log(`   Response: ${JSON.stringify(getRes.data, null, 2)}\n`);

  // 2. Update strategy
  console.log('2. PUT /api/model-routing/strategy');
  const putRes = await request('/api/model-routing/strategy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'performance',
      maxCost: 1.5,
      preferredModels: ['gpt-4o'],
      fallbackModel: 'deepseek-chat',
      autoFallback: true,
    }),
  });
  console.log(`   Status: ${putRes.status}`);
  console.log(`   Response: ${JSON.stringify(putRes.data, null, 2)}\n`);

  // 3. Verify persistence
  console.log('3. GET /api/model-routing/strategy (verify persistence)');
  const getRes2 = await request('/api/model-routing/strategy');
  console.log(`   Status: ${getRes2.status}`);
  console.log(`   Response: ${JSON.stringify(getRes2.data, null, 2)}\n`);

  // 4. Reset to default
  console.log('4. PUT /api/model-routing/strategy (reset to default)');
  const putRes2 = await request('/api/model-routing/strategy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'balanced',
      fallbackModel: 'deepseek-chat',
      autoFallback: true,
    }),
  });
  console.log(`   Status: ${putRes2.status}`);
  console.log(`   Response: ${JSON.stringify(putRes2.data, null, 2)}\n`);

  console.log('=== Verification Complete ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
