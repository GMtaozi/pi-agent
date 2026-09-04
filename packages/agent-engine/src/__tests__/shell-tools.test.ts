import { describe, it, expect } from 'vitest';
import { shellTools } from '../tools/shell-tools.js';

// 注意: 用例聚焦命令校验与执行路径, 不依赖平台特定的 shell 内建命令。
describe('shellTools command gating (P3#2)', () => {
  const [bash] = shellTools();

  async function run(command: string) {
    return bash.execute('test-call', { command });
  }

  it('rejects commands with shell operators (chaining attempt)', async () => {
    const res = await run('ls; rm -rf /');
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toContain('Shell operators');
  });

  it('rejects interpreter escape via python', async () => {
    const res = await run("python -c 'print(1)'");
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toContain('Command not allowed: python');
  });

  it('rejects node -e', async () => {
    const res = await run("node -e 'console.log(1)'");
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toContain('Command not allowed: node');
  });

  it('rejects docker', async () => {
    const res = await run('docker ps');
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toContain('Command not allowed: docker');
  });

  it('rejects find -exec escape hatch', async () => {
    const res = await run("find . -exec rm {} \\;");
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toMatch(/Shell operators|-exec/);
  });

  it('executes whitelisted command without a shell (injected allowedCommands)', async () => {
    // 注入白名单以跨平台验证 execFile(无 shell) 执行路径
    const [customBash] = shellTools({ allowedCommands: ['node'] });
    const res = await customBash.execute('c2', {
      command: 'node -e "process.stdout.write(\'sandbox-ok\')"',
    });
    expect(res.details.success).toBe(true);
    expect(String((res.content[0] as { text: string }).text)).toContain('sandbox-ok');
  });

  it('rejects empty command', async () => {
    const res = await run('   ');
    expect(res.details.success).toBe(false);
    expect(String(res.details.error)).toContain('Empty command');
  });
});
