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
  console.log('=== Custom Models API Verification ===\n');

  // 1. Get initial custom models (should be empty)
  console.log('1. GET /api/models/custom');
  const getRes = await request('/api/models/custom');
  console.log(`   Status: ${getRes.status}`);
  console.log(`   Response: ${JSON.stringify(getRes.data, null, 2)}\n`);

  // 2. Create a custom model
  console.log('2. POST /api/models/custom');
  const postRes = await request('/api/models/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Custom Model',
      provider: 'custom',
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test-key-123',
      modelParams: { temperature: 0.7, max_tokens: 2048 }
    }),
  });
  console.log(`   Status: ${postRes.status}`);
  console.log(`   Response: ${JSON.stringify(postRes.data, null, 2)}\n`);

  const createdId = postRes.data.id;

  // 3. Get custom models (should have 1)
  console.log('3. GET /api/models/custom (verify create)');
  const getRes2 = await request('/api/models/custom');
  console.log(`   Status: ${getRes2.status}`);
  console.log(`   Response: ${JSON.stringify(getRes2.data, null, 2)}\n`);

  // 4. Update the custom model
  console.log('4. PUT /api/models/custom/:id');
  const putRes = await request(`/api/models/custom/${createdId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Updated Custom Model',
      apiKey: 'sk-updated-key-456'
    }),
  });
  console.log(`   Status: ${putRes.status}`);
  console.log(`   Response: ${JSON.stringify(putRes.data, null, 2)}\n`);

  // 5. Verify the custom model
  console.log('5. POST /api/models/custom/:id/verify');
  const verifyRes = await request(`/api/models/custom/${createdId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test-key-123'
    }),
  });
  console.log(`   Status: ${verifyRes.status}`);
  console.log(`   Response: ${JSON.stringify(verifyRes.data, null, 2)}\n`);

  // 6. Delete the custom model
  console.log('6. DELETE /api/models/custom/:id');
  const deleteRes = await request(`/api/models/custom/${createdId}`, {
    method: 'DELETE',
  });
  console.log(`   Status: ${deleteRes.status}`);
  console.log(`   Response: ${JSON.stringify(deleteRes.data, null, 2)}\n`);

  // 7. Verify deletion
  console.log('7. GET /api/models/custom (verify delete)');
  const getRes3 = await request('/api/models/custom');
  console.log(`   Status: ${getRes3.status}`);
  console.log(`   Response: ${JSON.stringify(getRes3.data, null, 2)}\n`);

  console.log('=== Verification Complete ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
