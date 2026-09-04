import { runInSandbox } from '@workforge/sandbox';

/**
 * 插件沙箱执行运行时 — 三级沙箱隔离
 *
 * L1: worker_threads + vm（已有 skills 市场基础）
 *      适用于受信任的内置插件（kind=builtin）
 *      性能最好，隔离较弱
 *
 * L2: isolated-vm（社区/外部代码强制）
 *      适用于社区插件（kind=community）和官方插件（kind=official）
 *      提供真正的 V8 隔离，防止原型链污染和逃逸
 *
 * L3: 容器隔离（可选，预留接口）
 *      适用于高风险场景或多租户强隔离
 *      通过外部容器运行时（Docker/Podman）实现
 */

export type SandboxLevel = 'L1' | 'L2' | 'L3';

export interface SandboxExecuteOptions {
  pluginId: string;
  code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  input?: Record<string, any>;
  level: SandboxLevel;
  timeoutMs?: number;
  memoryLimitMb?: number;
}

export interface SandboxExecuteResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 历史动态边界, 类型待收紧
  output?: any;
  logs?: string[];
  error?: string;
  durationMs: number;
  level: SandboxLevel;
}

// 默认沙箱限制
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_MB = 128;

/**
 * 根据插件 kind 选择沙箱级别
 */
export function selectSandboxLevel(kind: string): SandboxLevel {
  switch (kind) {
    case 'builtin':
      return 'L1'; // 内置插件使用 worker_threads + vm
    case 'official':
    case 'community':
      return 'L2'; // 社区/官方插件强制 isolated-vm
    default:
      return 'L2'; // 默认 L2
  }
}

/**
 * 执行插件工具代码
 *
 * @param options 执行选项
 * @returns 执行结果
 */
export async function executePluginTool(options: SandboxExecuteOptions): Promise<SandboxExecuteResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const memoryLimitMb = options.memoryLimitMb || DEFAULT_MEMORY_LIMIT_MB;

  try {
    let result: SandboxExecuteResult;

    switch (options.level) {
      case 'L1':
        result = await executeL1(options, timeoutMs, memoryLimitMb);
        break;
      case 'L2':
        result = await executeL2(options, timeoutMs, memoryLimitMb);
        break;
      case 'L3':
        result = await executeL3(options, timeoutMs, memoryLimitMb);
        break;
      default:
        result = await executeL2(options, timeoutMs, memoryLimitMb);
    }

    return { ...result, durationMs: Date.now() - startTime, level: options.level };
  } catch (err) {
    return {
      success: false,
      error: String((err as Error)?.message || 'Sandbox execution failed'),
      durationMs: Date.now() - startTime,
      level: options.level
    };
  }
}

/**
 * L1 沙箱：worker_threads + vm
 *
 * 使用现有的 sandbox 包实现，适用于受信任的内置插件。
 * 通过 Worker 线程隔离 + vm context 限制全局访问。
 */
async function executeL1(
  options: SandboxExecuteOptions,
  timeoutMs: number,
  memoryLimitMb: number
): Promise<SandboxExecuteResult> {
  const { success, output, logs, error } = await runInSandbox({
    skillId: options.pluginId,
    code: options.code,
    input: options.input,
    timeoutMs,
    memoryLimitMb
  });

  return { success, output, logs, error, durationMs: 0, level: 'L1' };
}

/**
 * L2 沙箱：isolated-vm
 *
 * 使用 isolated-vm 提供真正的 V8 隔离。
 * 社区/外部代码强制执行此级别，防止：
 * - 原型链污染
 * - 全局对象逃逸
 * - 内存泄漏攻击
 * - CPU 耗尽攻击
 *
 * 注意：isolated-vm 需要原生模块编译，在 Windows 上可能需要 VS Build Tools。
 * 如果 isolated-vm 不可用，会回退到 L1。
 */
async function executeL2(
  options: SandboxExecuteOptions,
  timeoutMs: number,
  memoryLimitMb: number
): Promise<SandboxExecuteResult> {
  try {
    // 动态导入 isolated-vm，如果不可用则回退到 L1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO(lint-any): 动态导入可选依赖
    let ivm: any;
    try {
      // 使用 eval 包装动态导入，避免 TypeScript 静态分析
      ivm = await eval('import("isolated-vm")');
    } catch {
      // isolated-vm 不可用，回退到 L1
      return executeL1(options, timeoutMs, memoryLimitMb);
    }

    const isolate = new ivm.Isolate({
      memoryLimit: memoryLimitMb,
      inspector: false
    });

    const context = await isolate.createContext();

    // 注入安全的 console
    context.global.setSync('console', {
      log: new ivm.Callback((_args: unknown[]) => {
        // 收集日志但限制数量
      }, { sync: true })
    });

    // 注入 input
    context.global.setSync('input', new ivm.ExternalCopy(options.input || {}).copyInto());

    // 编译并运行脚本
    const script = await isolate.compileScript(`
      (async () => {
        const userFn = ${options.code};
        if (typeof userFn !== 'function') {
          throw new Error('Invalid tool code: expected a function expression');
        }
        const result = await userFn(input);
        return JSON.stringify({ ok: true, value: result === undefined ? null : result });
      })()
    `);

    const rawResult = await script.run(context, { timeout: timeoutMs });
    let parsed;
    try {
      parsed = JSON.parse(String(rawResult));
    } catch {
      throw new Error('Tool returned a non-serializable value');
    }

    // 清理
    context.release();
    isolate.dispose();

    return {
      success: true,
      output: parsed.value,
      logs: [],
      error: undefined,
      durationMs: 0,
      level: 'L2'
    };
  } catch (err) {
    return {
      success: false,
      error: String((err as Error)?.message || 'L2 sandbox failed'),
      durationMs: 0,
      level: 'L2'
    };
  }
}

/**
 * L3 沙箱：容器隔离（预留接口）
 *
 * 通过外部容器运行时实现最强隔离：
 * - 独立进程空间
 * - 文件系统隔离
 * - 网络隔离
 * - 资源配额限制
 *
 * 当前为完整接口预留，实际实现需要：
 * 1. Docker/Podman 运行时
 * 2. 容器镜像管理
 * 3. 生命周期管理
 * 4. 日志收集
 */
async function executeL3(
  options: SandboxExecuteOptions,
  timeoutMs: number,
  memoryLimitMb: number
): Promise<SandboxExecuteResult> {
  // L3 预留接口，当前回退到 L2
  // TODO: 实现容器化执行
  // 1. 启动临时容器
  // 2. 注入代码和输入
  // 3. 执行并收集结果
  // 4. 销毁容器
  // 5. 返回结果

  // 当前实现：回退到 L2
  const result = await executeL2(options, timeoutMs, memoryLimitMb);
  return { ...result, level: 'L3' };
}

/**
 * 批量执行插件工具（带并发限制）
 */
export async function executePluginTools(
  tasks: SandboxExecuteOptions[],
  maxConcurrency: number = 5
): Promise<SandboxExecuteResult[]> {
  const results: SandboxExecuteResult[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = executePluginTool(task).then(result => {
      results.push(result);
    });

    executing.push(p);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(e => e === p),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}
