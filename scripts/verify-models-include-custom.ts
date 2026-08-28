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
  console.log('=== Verify /api/models includes custom models ===\n');

  // 1. Create a custom model first
  console.log('1. Create custom model');
  const postRes = await request('/api/models/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Integration Test Model',
      provider: 'custom',
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      modelParams: { temperature: 0.5 }
    }),
  });
  console.log(`   Status: ${postRes.status}`);
  const customId = postRes.data.id;
  console.log(`   Created: ${customId}\n`);

  // 2. Check /api/models
  console.log('2. GET /api/models');
  const modelsRes = await request('/api/models');
  console.log(`   Status: ${modelsRes.status}`);
  
  const customProvider = modelsRes.data.providers?.find((p: any) => p.id === 'custom');
  if (customProvider) {
    console.log(`   Found custom provider with ${customProvider.models.length} model(s)`);
    customProvider.models.forEach((m: any) => {
      console.log(`   - ${m.id}: ${m.name}`);
    });
  } else {
    console.log('   No custom provider found');
  }

  // 3. Clean up
  console.log('\n3. Clean up');
  await request(`/api/models/custom/${customId}`, { method: 'DELETE' });
  console.log('   Deleted custom model\n');

  console.log('=== Verification Complete ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
