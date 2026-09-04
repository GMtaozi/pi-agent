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
  console.log('=== Skill Rating & Ranking Verification ===\n');

  // Create two skills for ranking test
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
  const idA = a.body.id;
  const idB = b.body.id;
  console.log('1. Created skills:', idA, idB);

  // Rate skill A twice: 5 then 3 -> avg should be 4
  const r1 = await req('/api/skills/' + idA + '/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }) });
  console.log('2. Rate A=5:', r1.status, JSON.stringify(r1.body));
  const r2 = await req('/api/skills/' + idA + '/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 3 }) });
  console.log('   Rate A=3:', r2.status, JSON.stringify(r2.body), '(avg should be 4)');

  // Rate skill B once: 1
  const r3 = await req('/api/skills/' + idB + '/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 1 }) });
  console.log('3. Rate B=1:', r3.status, JSON.stringify(r3.body));

  // Invalid rating
  const bad = await req('/api/skills/' + idA + '/rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 9 }) });
  console.log('4. Invalid rating 9:', bad.status, JSON.stringify(bad.body));

  // Install skill B twice
  await req('/api/skills/' + idB + '/install', { method: 'POST' });
  const inst2 = await req('/api/skills/' + idB + '/install', { method: 'POST' });
  console.log('5. Install B x2:', inst2.status, JSON.stringify(inst2.body), '(downloads should be 2)');

  // Sort by rating
  const byRating = await req('/api/skills?sort=rating');
  const ratingList = Array.isArray(byRating.body) ? byRating.body.filter((s: any) => s.source === 'market').map((s: any) => `${s.name}:${s.rating}`) : [];
  console.log('6. Sort by rating:', ratingList.join(' | '), '(A should be first)');

  // Sort by downloads
  const byDownloads = await req('/api/skills?sort=downloads');
  const dlList = Array.isArray(byDownloads.body) ? byDownloads.body.filter((s: any) => s.source === 'market').map((s: any) => `${s.name}:${s.downloads}`) : [];
  console.log('7. Sort by downloads:', dlList.join(' | '), '(B should be first)');

  // Sort by newest
  const byNewest = await req('/api/skills?sort=newest');
  const newestList = Array.isArray(byNewest.body) ? byNewest.body.filter((s: any) => s.source === 'market').map((s: any) => s.name) : [];
  console.log('8. Sort by newest:', newestList.join(' | '), '(B should be first)');

  // Detail includes ratingCount
  const detail = await req('/api/skills/' + idA);
  console.log('9. Detail A:', 'rating=', detail.body.rating, 'ratingCount=', detail.body.ratingCount, 'downloads=', detail.body.downloads);

  // Cleanup
  await req('/api/skills/' + idA, { method: 'DELETE' });
  await req('/api/skills/' + idB, { method: 'DELETE' });
  console.log('10. Cleanup done');

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
