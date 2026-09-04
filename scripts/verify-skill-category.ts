import http from 'http';

function req(path: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3001');
    const opts: any = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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
  console.log('=== Category Filter Verification ===\n');

  const mk = (name: string, category: string) =>
    req('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: name,
        version: '1.0.0',
        category,
        author: 'test',
        manifest: { capabilities: ['general'], tools: [], prompt: 'prompt ' + name, config: {} },
      }),
    });

  const a = await mk('技能A', 'developer');
  const b = await mk('技能B', 'product');
  const c = await mk('技能C', 'developer');
  console.log('1. Created 3 skills:', a.body.id, b.body.id, c.body.id);

  // Filter by developer
  const dev = await req('/api/skills?category=developer');
  const devList = Array.isArray(dev.body) ? dev.body.filter((s: any) => s.source === 'market').map((s: any) => s.name) : [];
  console.log('2. category=developer:', devList.join(', '), '(expect 技能A, 技能C)');

  // Filter by product
  const prod = await req('/api/skills?category=product');
  const prodList = Array.isArray(prod.body) ? prod.body.filter((s: any) => s.source === 'market').map((s: any) => s.name) : [];
  console.log('3. category=product:', prodList.join(', '), '(expect 技能B)');

  // Categories endpoint
  const cats = await req('/api/skills/categories');
  console.log('4. categories:', JSON.stringify(cats.body));

  // Combined category + sort
  const devSorted = await req('/api/skills?category=developer&sort=newest');
  const devSortedList = Array.isArray(devSorted.body) ? devSorted.body.filter((s: any) => s.source === 'market').map((s: any) => s.name) : [];
  console.log('5. category=developer&sort=newest:', devSortedList.join(', '));

  // Unknown category -> empty
  const none = await req('/api/skills?category=nonexistent');
  const noneList = Array.isArray(none.body) ? none.body.filter((s: any) => s.source === 'market').map((s: any) => s.name) : [];
  console.log('6. category=nonexistent:', noneList.length, '(expect 0)');

  // Cleanup
  await req('/api/skills/' + a.body.id, { method: 'DELETE' });
  await req('/api/skills/' + b.body.id, { method: 'DELETE' });
  await req('/api/skills/' + c.body.id, { method: 'DELETE' });
  console.log('7. Cleanup done');

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});