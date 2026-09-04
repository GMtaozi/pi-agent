import http from 'http';

function req(path: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3001');
    const opts: any = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d) });
        } catch {
          resolve({ status: res.statusCode, body: d });
        }
      });
    });
    r.on('error', reject);
    if (options.body) r.write(options.body);
    r.end();
  });
}

async function main() {
  console.log('=== Market Skills API Verification ===\n');

  // 1. Create
  const created = await req('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'PR 审查助手',
      description: '自动审查 Pull Request 的代码质量和潜在问题',
      version: '1.0.0',
      category: 'developer',
      author: 'market-user',
      manifest: {
        capabilities: ['code-review'],
        tools: ['read_file', 'bash'],
        prompt: '你是一个资深的代码审查专家...',
        config: { maxFiles: 10 },
      },
    }),
  });
  console.log('1. POST /api/skills:', created.status, JSON.stringify(created.body));
  const id = created.body.id;

  // 2. List
  const list = await req('/api/skills');
  console.log('2. GET /api/skills: count =', Array.isArray(list.body) ? list.body.length : 'n/a');
  if (Array.isArray(list.body)) {
    console.log('   market:', JSON.stringify(list.body.filter((s: any) => s.source === 'market')));
  }

  // 3. Detail
  const detail = await req('/api/skills/' + id);
  console.log('3. GET /api/skills/:id:', detail.status, JSON.stringify(detail.body).slice(0, 200));

  // 4. Toggle
  const toggled = await req('/api/skills/' + id + '/toggle', { method: 'PATCH' });
  console.log('4. PATCH toggle:', toggled.status, JSON.stringify(toggled.body));

  // 5. Categories
  const cats = await req('/api/skills/categories');
  console.log('5. GET /api/skills/categories:', cats.status, JSON.stringify(cats.body));

  // 6. Delete
  const deleted = await req('/api/skills/' + id, { method: 'DELETE' });
  console.log('6. DELETE:', deleted.status, JSON.stringify(deleted.body));

  // 7. Verify deletion
  const list2 = await req('/api/skills');
  const market2 = Array.isArray(list2.body) ? list2.body.filter((s: any) => s.source === 'market') : [];
  console.log('7. After delete, market count:', market2.length);

  console.log('\n=== Verification Complete ===');
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
