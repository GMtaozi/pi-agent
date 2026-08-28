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
  console.log('=== ModelRouter Runtime Verification ===\n');

  // Step 1: Set strategy to performance
  console.log('[1] POST /api/tools/routing-strategy (performance)');
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

  // Step 2: Create a session
  console.log('[2] POST /api/sessions');
  const sessionRes = await request('/api/sessions', 'POST', {
    model: 'deepseek-chat',
    mode: 'standard',
    workspaceId: 'default',
  });
  console.log('Status:', sessionRes.status);
  console.log('Response:', JSON.stringify(sessionRes.data, null, 2));
  if (sessionRes.status !== 200 || !sessionRes.data?.session?.id) {
    console.error('❌ Failed to create session');
    process.exit(1);
  }
  const sessionId = sessionRes.data.session.id;
  console.log('✅ Session created:', sessionId, '\n');

  // Step 3: Send a prompt that triggers tool usage
  console.log('[3] POST /api/sessions/' + sessionId + '/prompt');
  const promptRes = await request('/api/sessions/' + sessionId + '/prompt', 'POST', {
    text: 'List the files in the current directory and read the README.md file if it exists.',
  });
  console.log('Status:', promptRes.status);
  console.log('Response:', JSON.stringify(promptRes.data, null, 2));
  if (promptRes.status !== 200) {
    console.error('❌ Failed to send prompt');
    process.exit(1);
  }
  console.log('✅ Prompt sent\n');

  // Step 4: Wait for processing
  console.log('[4] Waiting for agent processing...');
  await sleep(5000);
  console.log('✅ Wait complete\n');

  console.log('=== Verification Steps Complete ===');
  console.log('\nPlease check the server logs for:');
  console.log('1. [ModelRouter] rerankTools');
  console.log('2. originalOrder and rerankedOrder');
  console.log('3. changed: true');
  console.log('\nIf you see these logs, the ModelRouter is working correctly.');
  console.log('If not, check:');
  console.log('  - Server logs for "Tool routing strategy skipped"');
  console.log('  - Ensure tools.length > 1 in the context');
  console.log('  - Verify GET /api/tools/routing-strategy returns the saved strategy');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
