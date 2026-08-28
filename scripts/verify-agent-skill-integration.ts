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
  console.log('=== V5 Agent Integration Verification ===\n');

  // 1. Create a market skill with a distinctive prompt
  const promptText = '你是一个专门的代码审查专家。只关注代码质量问题。这是 SKILL_MARKET_TEST_PROMPT。';
  const created = await req('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '集成测试技能',
      description: '验证市场技能能被 Agent 加载',
      version: '1.0.0',
      category: 'developer',
      author: 'test',
      manifest: {
        capabilities: ['code-review'],
        tools: ['read_file'],
        prompt: promptText,
        config: {},
      },
    }),
  });
  console.log('1. POST /api/skills:', created.status, JSON.stringify(created.body));
  const skillId = created.body.id;

  // 2. Get skill detail - confirm it exists and is enabled
  const detail = await req('/api/skills/' + skillId);
  console.log('2. GET /api/skills/:id:', detail.status, 'enabled=', detail.body.enabled, 'prompt=', JSON.stringify(detail.body.prompt).slice(0, 60));

  // 3. Create a session and send a message (agent should load the skill prompt)
  const session = await req('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', mode: 'standard', workspaceId: 'skill-test' }),
  });
  console.log('3. POST /api/sessions:', session.status, session.body.session?.id);
  const sessionId = session.body.session.id;

  await req('/api/sessions/' + sessionId + '/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '请执行代码审查' }),
  });
  console.log('4. Message sent, waiting for agent...');

  await new Promise((r) => setTimeout(r, 3000));

  // 5. Check trajectory - should have assistant response
  const traj = await req('/api/sessions/' + sessionId + '/trajectory');
  const nodes = traj.body?.nodes || [];
  const assistant = nodes.filter((n: any) => n.type === 'assistant');
  console.log('5. Trajectory nodes:', nodes.length, '| assistant responses:', assistant.length);
  if (assistant.length > 0) {
    console.log('   Assistant response:', JSON.stringify(assistant[assistant.length - 1].summary).slice(0, 120));
  }

  // 6. Cleanup
  await req('/api/skills/' + skillId, { method: 'DELETE' });
  console.log('6. DELETE skill cleanup done');

  console.log('\n=== Done ===');
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
