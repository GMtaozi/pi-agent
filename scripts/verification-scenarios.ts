/**
 * 真实场景验证脚本
 * 
 * 使用说明：
 * 1. 确保服务器运行在 http://localhost:3001
 * 2. 确保前端 dev server 运行在 http://localhost:43120
 * 3. 运行: npx tsx scripts/verification-scenarios.ts
 */

import http from 'http';

const BASE = 'http://localhost:3001';

interface ScenarioResult {
  scenario: string;
  input: string;
  output?: string;
  duration?: number;
  error?: string;
  metrics?: {
    modelSelected?: string;
    toolsReranked?: boolean;
    memoryLoaded?: boolean;
  };
}

async function request(path: string, options: any = {}): Promise<any> {
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

async function createSession(model: string = 'deepseek-chat', mode: string = 'standard'): Promise<string> {
  const res = await request('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, mode, workspaceId: 'verification' }),
  });
  if (!res.data.session?.id) {
    throw new Error('Failed to create session: ' + JSON.stringify(res.data));
  }
  return res.data.session.id;
}

async function sendMessage(sessionId: string, text: string): Promise<any> {
  const res = await request(`/api/sessions/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.data;
}

async function getSessionMessages(sessionId: string): Promise<any[]> {
  // Use trajectory endpoint which returns nodes
  const res = await request(`/api/sessions/${sessionId}/trajectory`);
  return res.data?.nodes || [];
}

async function pollStream(sessionId: string, timeoutMs: number = 60000): Promise<any> {
  // For verification, we just check the session was created and message was accepted
  // Full streaming verification would require SSE client
  return { accepted: true, sessionId };
}

async function runScenario1_CodeReview(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioName = '代码审查';
  
  const prDiff = `diff --git a/src/agent-loop.ts b/src/agent-loop.ts
index abc123..def456 100644
--- a/src/agent-loop.ts
+++ b/src/agent-loop.ts
@@ -170,7 +170,9 @@ export function createAgentLoop(config: AgentLoopConfig) {
   while (true) {
     let hasMoreToolCalls = true;
-    console.log('[AGENT-LOOP] Outer loop iteration');
+    console.log(JSON.stringify({
+      level: 'info', vendor: 'pi', sessionId: config.sessionId
+    }));
     // ... 其他代码
   }
 }`;

  try {
    const sessionId = await createSession('deepseek-chat', 'standard');
    await sendMessage(sessionId, `请审查以下 PR diff，分析代码质量、潜在问题和改进建议：\n\n${prDiff}`);
    
    // Wait for agent to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fetch nodes to get actual response
    const nodes = await getSessionMessages(sessionId);
    const assistantNodes = nodes.filter((n: any) => n.type === 'assistant');
    const lastAssistant = assistantNodes[assistantNodes.length - 1];
    const responseText = lastAssistant?.summary || '(no response)';
    
    return {
      scenario: scenarioName,
      input: prDiff,
      output: responseText,
      duration: Date.now() - startTime,
      metrics: {
        modelSelected: 'deepseek-chat (mocked)',
      }
    };
  } catch (error) {
    return {
      scenario: scenarioName,
      input: prDiff,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function runScenario2_PRDGeneration(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioName = 'PRD生成';
  
  const requirement = `我们需要一个会话管理功能，支持：
1. 用户创建会话时自动生成唯一 ID
2. 会话历史持久化到 SQLite
3. 支持按时间排序、分页查询
4. 会话过期时间可配置（默认 7 天）
5. 支持软删除和恢复`;

  try {
    const sessionId = await createSession('deepseek-chat', 'standard');
    await sendMessage(sessionId, `请根据以下需求生成一份 PRD：\n\n${requirement}`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const nodes = await getSessionMessages(sessionId);
    const assistantNodes = nodes.filter((n: any) => n.type === 'assistant');
    const lastAssistant = assistantNodes[assistantNodes.length - 1];
    const responseText = lastAssistant?.summary || '(no response)';

    return {
      scenario: 'PRD生成',
      input: requirement,
      output: responseText,
      duration: Date.now() - startTime,
      metrics: {
        modelSelected: 'deepseek-chat (mocked)',
      }
    };
  } catch (error) {
    return {
      scenario: scenarioName,
      input: requirement,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function runScenario3_AutoModelSelection(): Promise<ScenarioResult> {
  const startTime = Date.now();
  const scenarioName = '自动模型选择';
  
  const complexTask = `请分析以下系统架构，找出性能瓶颈并提出优化方案。需要深入 reasoning：
1. 当前系统有 6 个主要模块
2. 数据库查询响应时间 P99 = 2.3s
3. 内存使用率峰值 85%
4. 需要支持 10x 并发增长`;

  try {
    const sessionId = await createSession('auto', 'standard');
    await sendMessage(sessionId, complexTask);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const nodes = await getSessionMessages(sessionId);
    const assistantNodes = nodes.filter((n: any) => n.type === 'assistant');
    const lastAssistant = assistantNodes[assistantNodes.length - 1];
    const responseText = lastAssistant?.summary || '(no response)';

    return {
      scenario: '自动模型选择',
      input: complexTask,
      output: responseText,
      duration: Date.now() - startTime,
      metrics: {
        modelSelected: 'auto → deepseek-chat (via ModelSelector, then mocked)',
      }
    };
  } catch (error) {
    return {
      scenario: scenarioName,
      input: complexTask,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function main() {
  console.log('=== 真实场景验证 ===\n');

  const results: ScenarioResult[] = [];

  // Scenario 1: Code Review
  console.log('1. 运行场景：代码审查...');
  const result1 = await runScenario1_CodeReview();
  results.push(result1);
  console.log(`   完成: ${result1.duration}ms, 错误: ${result1.error || '无'}\n`);

  // Scenario 2: PRD Generation
  console.log('2. 运行场景：PRD生成...');
  const result2 = await runScenario2_PRDGeneration();
  results.push(result2);
  console.log(`   完成: ${result2.duration}ms, 错误: ${result2.error || '无'}\n`);

  // Scenario 3: Auto Model Selection
  console.log('3. 运行场景：自动模型选择...');
  const result3 = await runScenario3_AutoModelSelection();
  results.push(result3);
  console.log(`   完成: ${result3.duration}ms, 错误: ${result3.error || '无'}\n`);

  // Summary
  console.log('=== 验证结果汇总 ===');
  console.log('─────────────────────────────────────────────────────────────');
  
  for (const r of results) {
    console.log(`\n场景: ${r.scenario}`);
    console.log(`输入: ${r.input.slice(0, 100)}...`);
    console.log(`输出: ${r.output?.slice(0, 200) || 'N/A'}`);
    console.log(`耗时: ${r.duration}ms`);
    if (r.error) {
      console.log(`错误: ${r.error}`);
    }
    if (r.metrics) {
      console.log(`指标: ${JSON.stringify(r.metrics)}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('\n下一步：');
  console.log('1. 检查服务器日志确认 ModelSelector / ModelRouter 是否生效');
  console.log('2. 评估输出质量、流程顺畅度、推荐意愿（1-5分）');
  console.log('3. 根据结果决定迭代方向');
}

main().catch((err) => {
  console.error('验证失败:', err);
  process.exit(1);
});
