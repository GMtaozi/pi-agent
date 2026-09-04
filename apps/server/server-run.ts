import { createServer } from './src/index.ts';

const app = await createServer();
await app.server.listen({ port: 3001, host: '0.0.0.0' });
console.log('SERVER_READY');

// Keep process alive
process.on('SIGINT', async () => {
  await app.stop();
  process.exit(0);
});
