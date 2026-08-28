// Smoke test for approval flow + auto-retry
import { EventSource } from 'eventsource';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createSession() {
  const body = JSON.stringify({ model: 'step-3.7-flash', mode: 'standard', providerId: 'stepfun', workspaceId: 'test-workspace' });
  const res = await fetch('http://127.0.0.1:3001/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  return data.session.id;
}

async function sendMessage(sessionId, text) {
  const body = JSON.stringify({ text });
  const res = await fetch(`http://127.0.0.1:3001/api/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return res.json();
}

async function getApprovals() {
  const res = await fetch('http://127.0.0.1:3001/api/approvals');
  const data = await res.json();
  return data;
}

async function approveRequest(approvalId) {
  const res = await fetch(`http://127.0.0.1:3001/api/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decidedBy: 'user' }),
  });
  return res.json();
}

async function runSmokeTest() {
  console.log('=== Approval Flow Smoke Test ===\n');

  const sessionId = await createSession();
  console.log(`[1] Created session: ${sessionId}`);

  const eventSource = new EventSource(`http://127.0.0.1:3001/api/sessions/${sessionId}/stream`);
  const events = [];
  
  eventSource.addEventListener('connected', () => {
    console.log('[2] SSE connected');
  });

  eventSource.addEventListener('agent_event', (event) => {
    try {
      const data = JSON.parse(event.data);
      const agentEvent = data.event;
      if (agentEvent) {
        events.push(agentEvent);
        console.log(`[EVENT] ${agentEvent.type}`);
        
        if (agentEvent.type === 'tool_execution_end' && agentEvent.result?.requiresApproval) {
          console.log(`[3] Approval required: ${agentEvent.result.approvalId}`);
        }
      }
    } catch (e) {
      // ignore
    }
  });

  eventSource.addEventListener('done', (event) => {
    console.log('[DONE] Stream completed');
    try {
      const data = JSON.parse(event.data);
      console.log('[DONE DATA]', JSON.stringify(data).slice(0, 200));
    } catch (e) {
      console.log('[DONE RAW]', event.data?.slice?.(0, 200) || event.data);
    }
    eventSource.close();
  });

  eventSource.addEventListener('error', (event) => {
    console.log('[ERROR] Stream error');
    try {
      const data = JSON.parse(event.data);
      console.log('[ERROR DATA]', JSON.stringify(data).slice(0, 200));
    } catch (e) {
      console.log('[ERROR RAW]', event.data?.slice?.(0, 200) || event.data);
    }
    eventSource.close();
  });

  console.log('[4] Sending message: 运行 ls -la');
  await sendMessage(sessionId, '运行 ls -la');

  await sleep(3000);
  const approvals = await getApprovals();
  console.log(`[5] Pending approvals: ${approvals.length}`);
  
  if (approvals.length > 0) {
    const approval = approvals[0];
    console.log(`[6] Approving request: ${approval.id}`);
    await approveRequest(approval.id);
    console.log(`[7] Approval granted`);
    
    await sleep(5000);
    console.log(`[8] Total events received: ${events.length}`);
    console.log('[9] Event types:', events.map(e => e.type).join(', '));
    
    const hasApprovalEvent = events.some(e => e.type === 'tool_execution_end' && e.result?.requiresApproval);
    const hasDoneEvent = events.some(e => e.type === 'done');
    const hasErrorEvent = events.some(e => e.type === 'error');
    
    console.log(`[10] Has approval event: ${hasApprovalEvent}`);
    console.log(`[11] Has done event: ${hasDoneEvent}`);
    console.log(`[12] Has error event: ${hasErrorEvent}`);
    
    if (hasApprovalEvent) {
      console.log('\n✅ Approval event detected correctly');
    } else {
      console.log('\n❌ Approval event missing');
    }
    
    if (hasDoneEvent) {
      console.log('✅ Stream completed successfully');
    } else if (hasErrorEvent) {
      console.log('⚠️  Stream ended with error (check error details above)');
    } else {
      console.log('⚠️  Stream did not complete within timeout');
    }
  } else {
    console.log('❌ No pending approvals found');
  }

  eventSource.close();
  process.exit(0);
}

runSmokeTest().catch(console.error);
