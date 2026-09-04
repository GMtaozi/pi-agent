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
  console.log('=== Skill Version Management Verification ===\n');

  // 1. Create skill with initial version 1.0.0 + changelog
  const created = await req('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '版本测试技能',
      description: '用于版本管理验证',
      version: '1.0.0',
      changelog: '首个版本',
      category: 'developer',
      author: 'tester',
      manifest: { capabilities: ['general'], tools: [], prompt: 'v1 prompt', config: {} },
    }),
  });
  const skillId = created.body.id;
  console.log('1. Created skill:', created.status, skillId);

  // 2. List versions - should have initial 1.0.0
  const v1 = await req('/api/skills/' + skillId + '/versions');
  console.log('2. Initial versions:', v1.status, JSON.stringify(v1.body));

  // 3. Publish v2.0.0 with new manifest
  const pub = await req('/api/skills/' + skillId + '/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '2.0.0',
      changelog: '重构提示词',
      manifest: { capabilities: ['code-review'], tools: ['read_file'], prompt: 'v2 prompt', config: { mode: 'strict' } },
    }),
  });
  console.log('3. Publish v2.0.0:', pub.status, JSON.stringify(pub.body));
  const v2Id = pub.body.versionId;

  // 4. Detail should show currentVersion 2.0.0 and new manifest
  const detail = await req('/api/skills/' + skillId);
  console.log('4. Detail after publish:', 'currentVersion=', detail.body.currentVersion, 'prompt=', JSON.stringify(detail.body.prompt), 'capabilities=', JSON.stringify(detail.body.capabilities));

  // 5. Version history should have 2
  const v2 = await req('/api/skills/' + skillId + '/versions');
  console.log('5. Version history count:', JSON.stringify(v2.body.versions.map((v: any) => v.version)));

  // 6. Get specific version detail (v1)
  const v1Detail = await req('/api/skills/' + skillId + '/versions/' + v1.body.versions[0].id);
  console.log('6. Version 1.0.0 detail: prompt=', JSON.stringify(v1Detail.body.manifest?.prompt), 'changelog=', JSON.stringify(v1Detail.body.changelog));

  // 7. Rollback to v1.0.0
  const roll = await req('/api/skills/' + skillId + '/rollback/' + v1.body.versions[0].id, { method: 'POST' });
  console.log('7. Rollback:', roll.status, JSON.stringify(roll.body));

  // 8. Detail after rollback - should show 1.0.0 with v1 prompt
  const detail2 = await req('/api/skills/' + skillId);
  console.log('8. Detail after rollback: currentVersion=', detail2.body.currentVersion, 'prompt=', JSON.stringify(detail2.body.prompt));

  // 9. Publish without version -> auto bump from current (1.0.0 -> 1.0.1)
  const autoPub = await req('/api/skills/' + skillId + '/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changelog: '自动递增版本' }),
  });
  console.log('9. Auto-bump publish:', autoPub.status, JSON.stringify(autoPub.body), '(expect 1.0.1)');

  // 10. Cleanup
  await req('/api/skills/' + skillId, { method: 'DELETE' });
  console.log('10. Cleanup done');

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});