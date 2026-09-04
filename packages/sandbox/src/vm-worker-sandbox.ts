import { Worker } from 'worker_threads';
import type { SandboxContext, SandboxResult } from './sandbox-types.js';
import { SANDBOX_DEFAULTS, skillSandboxRoot } from './sandbox-config.js';

/**
 * worker_threads + vm 实现的沙箱（备选方案）。
 *
 * 选型说明：目标方案为 isolated-vm，但当前 Windows 环境缺少 VS Build Tools 且
 * Node 非 LTS 版本无预编译产物，无法编译原生模块；故按平台备选路线使用
 * worker_threads + vm。隔离强度弱于 isolated-vm，但通过以下机制达成 MVP 边界：
 * - 独立 Worker 线程执行，超时后 terminate() 硬中断（async 死循环亦可杀）
 * - resourceLimits 强制 V8 堆内存上限
 * - vm context 最小全局：无 require / process / 网络
 * - sandboxFs 仅暴露技能目录内的只读操作，带路径穿越防护
 *
 * 当环境具备编译条件时，可无切换成本换回 isolated-vm（接口完全一致）。
 */

function buildWorkerSource(): string {
  return `
const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const path = require('path');
const fs = require('fs/promises');

const fmt = (a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } };

(async () => {
  const { code, inputJson, baseDir } = workerData;
  const logs = [];
  const collect = (line) => { if (logs.length < 200) logs.push(String(line)); };

  const inBase = (p) => {
    const full = path.resolve(baseDir, String(p));
    if (full !== baseDir && !full.startsWith(baseDir + path.sep)) {
      throw new Error('Access denied: path traversal detected');
    }
    return full;
  };

  const sandboxConsole = {
    log: (...a) => collect('log ' + a.map(fmt).join(' ')),
    error: (...a) => collect('error ' + a.map(fmt).join(' ')),
  };
  const sandboxFs = {
    readFile: (p) => fs.readFile(inBase(p), 'utf8'),
    listDir: (p) => fs.readdir(inBase(p)),
  };

  const context = vm.createContext({
    console: sandboxConsole,
    sandboxFs,
    input: JSON.parse(inputJson),
  });

  const script = \`
    (async () => {
      const userFn = (\${code});
      if (typeof userFn !== 'function') throw new Error('Invalid tool code: expected a function expression');
      const result = await userFn(input);
      return JSON.stringify({ ok: true, value: result === undefined ? null : result });
    })()
  \`;

  const raw = await vm.runInContext(script, context);
  let parsed;
  try { parsed = JSON.parse(String(raw)); } catch { throw new Error('Tool returned a non-serializable value'); }
  parentPort.postMessage({ success: true, output: parsed.value, logs });
})().catch((e) => {
  parentPort.postMessage({ success: false, error: String((e && e.message) || e).slice(0, 500), logs });
});
`;
}

export async function runInSandbox(context: SandboxContext): Promise<SandboxResult> {
  const startTime = Date.now();
  const timeoutMs = context.timeoutMs ?? SANDBOX_DEFAULTS.timeoutMs;
  const memoryLimitMb = context.memoryLimitMb ?? SANDBOX_DEFAULTS.memoryLimitMb;

  return new Promise<SandboxResult>((resolveResult) => {
    const fail = (error: string): SandboxResult => ({
      success: false,
      logs: [],
      error,
      durationMs: Date.now() - startTime,
    });

    let worker: Worker;
    let settled = false;
    let timedOut = false;

    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      worker.terminate();
    }, timeoutMs);

    try {
      worker = new Worker(buildWorkerSource(), {
        eval: true,
        workerData: {
          code: context.code,
          inputJson: JSON.stringify(context.input ?? null),
          baseDir: skillSandboxRoot(context.skillId),
        },
        resourceLimits: {
          maxOldGenerationSizeMb: memoryLimitMb,
          maxYoungGenerationSizeMb: Math.ceil(memoryLimitMb / 2),
        },
      });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    } catch (error: any) {
      finish(fail(String(error?.message || 'Failed to start sandbox worker')));
      return;
    }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
    worker.on('message', (msg: any) => {
      if (msg?.success) {
        finish({ success: true, output: msg.output, logs: msg.logs || [], durationMs: Date.now() - startTime });
      } else {
        finish(fail(String(msg?.error || 'Sandbox execution failed')));
      }
    });

    worker.on('error', (error) => {
      finish(fail(String(error?.message || 'Worker crashed')));
    });

    worker.on('exit', () => {
      if (!settled && timedOut) {
        finish(fail(`Execution timed out after ${timeoutMs}ms`));
      } else if (!settled) {
        finish(fail('Worker exited without returning a result'));
      }
    });
  });
}
