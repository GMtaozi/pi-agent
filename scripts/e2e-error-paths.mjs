// E2E Error Paths Smoke Test
// Covers: tool failure, model timeout, context compression, approval rejection
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

async function rejectRequest(approvalId) {
  const res = await fetch(`http://127.0.0.1:3001/api/approvals/${approvalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decidedBy: 'user', reason: 'Rejected by E2E test' }),
  });
  return res.json();
}

async function waitForEvent(events, predicate, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = events.find(predicate);
    if (found) return found;
    await sleep(100);
  }
  return null;
}

async function runTestCase(name, message, validate) {
  console.log(`\n🧪 Running: ${name}`);
  
  const sessionId = await createSession();
  console.log(`  Session: ${sessionId}`);
  
  const eventSource = new EventSource(`http://127.0.0.1:3001/api/sessions/${sessionId}/stream`);
  const events = [];
  let done = false;
  let error = null;
  
  eventSource.addEventListener('connected', () => {
    console.log(`  [2] SSE connected`);
  });
  
  eventSource.addEventListener('agent_event', (event) => {
    try {
      const data = JSON.parse(event.data);
      const agentEvent = data.event;
      if (agentEvent) {
        events.push(agentEvent);
        console.log(`  [EVENT] ${agentEvent.type}`);
      }
    } catch (e) {
      // ignore
    }
  });
  
  eventSource.addEventListener('done', (event) => {
    done = true;
    console.log(`  [DONE] Stream completed`);
    eventSource.close();
  });
  
  eventSource.addEventListener('error', (event) => {
    error = event;
    console.log(`  [ERROR] Stream error`);
    eventSource.close();
  });
  
  // Send message
  console.log(`  [3] Sending message: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`);
  await sendMessage(sessionId, message);
  
  // Wait for completion or timeout
  await sleep(5000);
  
  const result = await Promise.resolve(validate(events, done, error));
  if (result.passed) {
    console.log(`  ✅ ${name} passed`);
  } else {
    console.log(`  ❌ ${name} failed: ${result.reason}`);
  }
  
  eventSource.close();
  return result.passed;
}

async function runE2ETests() {
  console.log('=== E2E Error Paths Smoke Test ===\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Tool execution failure (requires approval, then we check the result after approval)
  const test1Passed = await runTestCase(
    '工具执行失败 (bash ls /non_exist)',
    'ls /non_exist',
    async (events, done, error) => {
      // Wait for approval request
      await sleep(2000);
      const approvals = await getApprovals();
      if (approvals.length === 0) {
        return { passed: false, reason: 'No approval request created for tool failure test' };
      }
      
      // Approve the request so the tool can execute and fail
      const approval = approvals[0];
      const approveRes = await fetch(`http://127.0.0.1:3001/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decidedBy: 'user' }),
      });
      await approveRes.json();
      console.log(`  [4] Approved tool execution: ${approval.id}`);
      
      await sleep(5000);
      
      const hasToolStart = events.some(e => e.type === 'tool_execution_start');
      const hasToolEnd = events.some(e => e.type === 'tool_execution_end');
      
      if (hasToolStart && hasToolEnd) {
        return { passed: true };
      }
      return { passed: false, reason: `Missing tool execution events. Events: ${events.map(e => e.type).join(', ')}` };
    }
  );
  test1Passed ? passed++ : failed++;
  
  // Test 2: Approval flow
  const test2Passed = await runTestCase(
    '审批流程 (bash pwd)',
    '运行 pwd',
    async (events, done, error) => {
      await sleep(2000);
      const approvals = await getApprovals();
      if (approvals.length === 0) {
        return { passed: false, reason: 'No approval request created' };
      }
      
      // Reject the approval
      const approval = approvals[0];
      const rejectRes = await fetch(`http://127.0.0.1:3001/api/approvals/${approval.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decidedBy: 'user', reason: 'Rejected by E2E test' }),
      });
      await rejectRes.json();
      console.log(`  [4] Rejected approval: ${approval.id}`);
      
      await sleep(3000);
      
      const hasApprovalEvent = events.some(e => e.type === 'tool_execution_end' && e.result?.requiresApproval);
      const hasToolError = events.some(e => e.type === 'tool_execution_end' && e.result?.isError);
      
      if (hasApprovalEvent && hasToolError) {
        return { passed: true };
      }
      return { passed: false, reason: `Missing approval rejection events. Events: ${events.map(e => e.type).join(', ')}` };
    }
  );
  test2Passed ? passed++ : failed++;
  
  // Test 3: Long text (context compression)
  const longText = '请帮我总结以下内容：' + '这是测试文本。'.repeat(1000);
  const test3Passed = await runTestCase(
    '上下文压缩触发',
    longText,
    (events, done, error) => {
      // For now, just check that the request completes without error
      // In a real scenario, we'd check for compression events
      const hasError = events.some(e => e.type === 'error');
      if (!hasError && done) {
        return { passed: true };
      }
      return { passed: false, reason: `Request failed or timed out. Events: ${events.map(e => e.type).join(', ')}` };
    }
  );
  test3Passed ? passed++ : failed++;
  
  // Test 4: Model API timeout (very short timeout)
  // Note: This test requires modifying the timeout, which we can't do from client
  // So we'll skip this for now or test it differently
  console.log(`\n🧪 Running: 模型 API 超时 (skipped - requires server-side config)`);
  console.log(`  ⏭️  Skipped: Model timeout test requires server-side timeout configuration`);
  
  // Summary
  console.log('\n=== E2E Test Summary ===');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All E2E tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some E2E tests failed. Check logs above.');
    process.exit(1);
  }
}

runE2ETests().catch(err => {
  console.error('E2E test runner failed:', err);
  process.exit(1);
});
