import type { FastifyInstance } from 'fastify';
import 'vitest';
import { createMockServices } from './__tests__/mocks';

export async function createTestServer() {
  const { createServer } = await import('./index');
  // `as never`: 测试桩到真实服务类型的桥接, never 可赋给任意目标且不引入跨文件类型依赖
  const mockServices = createMockServices() as never;
  const app = await createServer({ testMode: true, services: mockServices });
  return app.server;
}

export async function createTestServerWithPort(port: number) {
  const { createServer } = await import('./index');
  // `as never`: 测试桩到真实服务类型的桥接, never 可赋给任意目标且不引入跨文件类型依赖
  const mockServices = createMockServices() as never;
  const app = await createServer({ testMode: true, services: mockServices });
  await app.server.listen({ port, host: '127.0.0.1' });
  return app;
}
export async function closeTestServer(server: FastifyInstance) {
  if (server) {
    await server.close();
  }
}
