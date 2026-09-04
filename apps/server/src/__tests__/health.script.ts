
async function main() {
  // Dynamic import to get createServer
  const { createServer } = await import('./src/index.ts');
  const app = await createServer();
  
  // Test health endpoint
  const response = await app.server.inject({
    method: 'GET',
    url: '/health'
  });
  
  console.log('Status:', response.statusCode);
  console.log('Body:', response.body);
  
  if (response.statusCode === 200) {
    console.log('PASS: Health endpoint works');
    process.exit(0);
  } else {
    console.log('FAIL: Health endpoint returned', response.statusCode);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
