import http from 'http';

function request(path: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:3001');
    const opts: any = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  // Create session
  const created = await request('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', mode: 'standard', workspaceId: 'test-debug' }),
  });
  console.log('Session created:', created.body.session?.id);

  const sessionId = created.body.session.id;

  // Send message
  await request('/api/sessions/' + sessionId + '/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '请简单介绍一下你自己' }),
  });

  // Wait for agent to complete
  await new Promise(r => setTimeout(r, 3000));

  // Get trajectory
  const traj = await request('/api/sessions/' + sessionId + '/trajectory');
  console.log('Trajectory:', JSON.stringify(traj.body, null, 2));
}

main().catch(console.error);