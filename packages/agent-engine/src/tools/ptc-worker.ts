import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import vm from 'node:vm';

interface WorkerRequest {
  id: string;
  code: string;
  workspacePath: string;
  timeout: number;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  result?: any;
  error?: string;
}

const FORBIDDEN_PATTERNS = [
  /require\s*\(/,
  /import\s+.*from\s+['"]/,
  /process\.env/,
  /process\.argv/,
  /global\./,
  /window\./,
  /document\./,
  /eval\s*\(/,
  /Function\s*\(/,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /Worker\s*\(/,
  /new\s+Worker/,
  /child_process/,
  /cluster/,
  /vm\s*\(/,
  /script\s*\(/,
  /__dirname/,
  /__filename/,
  /require\.resolve/,
  /module\.exports/,
  /exports\./,
  /process\.exit/,
  /process\.kill/,
  /process\.pid/,
  /process\.ppid/,
  /fs\./,
  /path\.resolve/,
  /path\.join/,
  /crypto\.randomBytes/,
  /crypto\.pbkdf2/,
];

function validateCode(code: string): { valid: boolean; error?: string } {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: 'Code contains forbidden pattern: ' + pattern.source
      };
    }
  }
  return { valid: true };
}

// Only execute worker thread logic when explicitly invoked by runTypeScript,
// not when this module is merely imported inside another worker thread
// (e.g. vitest vmThreads / tinypool workers).
if (!isMainThread && workerData && typeof workerData === 'object' && 'code' in workerData) {
  const { code, workspacePath, timeout } = workerData as WorkerRequest;

  try {
    const validation = validateCode(code);
    if (!validation.valid) {
      parentPort?.postMessage({
        id: 'main',
        success: false,
        error: validation.error
      });
      process.exit(0);
    }

    const result = await executeCode(code, workspacePath, timeout);

    parentPort?.postMessage({
      id: 'main',
      success: true,
      result
    });
  } catch (error) {
    parentPort?.postMessage({
      id: 'main',
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed'
    });
  }

  process.exit(0);
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
async function executeCode(code: string, workspacePath: string, timeout: number): Promise<any> {
  const safeModules: Record<string, unknown> = {};

  try {
    safeModules.path = await import('path');
    safeModules.util = await import('util');
    safeModules.crypto = await import('crypto');
    safeModules.stream = await import('stream');
    safeModules.buffer = await import('buffer');
    safeModules.url = await import('url');
    safeModules.querystring = await import('querystring');
    safeModules.events = await import('events');
    safeModules.timers = await import('timers');
  } catch {
    // Some modules may not be available
  }

  const context = {
    console: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      log: (...args: any[]) => args,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      error: (...args: any[]) => args,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      warn: (...args: any[]) => args,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
      info: (...args: any[]) => args
    },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    RegExp,
    Map,
    Set,
    Promise,
    Symbol,
    BigInt,
    Infinity,
    NaN,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    decodeURI,
    encodeURIComponent,
    decodeURIComponent,
    ...safeModules
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Execution timed out after ' + timeout + 'ms'));
    }, timeout);

    try {
      const sandbox = context;

      const script = new vm.Script(`
        "use strict";
        (function() {
          try {
            ${code}
          } catch (e) {
            return { error: e.message };
          }
        })();
      `);

      const result = script.runInNewContext(sandbox, {
        timeout,
        breakOnSigint: true
      });

      clearTimeout(timer);

      if (result instanceof Promise) {
        result.then(resolve).catch(reject);
      } else {
        resolve(result);
      }
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
export async function runTypeScript(code: string, workspacePath: string, timeout: number = 30000): Promise<{ success: boolean; output?: any; error?: string; executionTime?: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    try {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { code, workspacePath, timeout }
      });
      
      worker.on('message', (result: WorkerResponse) => {
        worker.terminate();
        resolve({
          success: result.success,
          output: result.result,
          error: result.error,
          executionTime: Date.now() - startTime
        });
      });
      
      worker.on('error', (error: Error) => {
        worker.terminate();
        reject(error);
      });
      
      worker.on('exit', (code: number) => {
        if (code !== 0) {
          reject(new Error('Worker exited with code ' + code));
        }
      });
      
      setTimeout(() => {
        worker.terminate();
        resolve({
          success: false,
          error: 'Execution timed out after ' + timeout + 'ms',
          executionTime: Date.now() - startTime
        });
      }, timeout);
      
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start worker',
        executionTime: Date.now() - startTime
      });
    }
  });
}
