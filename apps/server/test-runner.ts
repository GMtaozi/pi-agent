import { createServer } from './src/index.ts';

console.log('Importing createServer...');

try {
  console.log('Calling createServer...');
  const app = await createServer();
  console.log('Server created, listening...');
  await app.server.listen({ port: 3001, host: '0.0.0.0' });
  console.log('Server listening on http://localhost:3001');
} catch (err) {
  console.error('ERROR:', err);
  process.exit(1);
}
