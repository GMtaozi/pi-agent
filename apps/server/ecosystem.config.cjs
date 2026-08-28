module.exports = {
  apps: [
    {
      name: 'agent-engine',
      script: './dist/index.js',
      max_memory_restart: '2G',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      kill_timeout: 10000,
    },
  ],
};
