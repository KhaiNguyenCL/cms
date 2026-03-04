/**
 * PM2 Ecosystem Config — Production
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production   # zero-downtime reload
 *   pm2 save && pm2 startup                           # auto-start on reboot
 */
module.exports = {
  apps: [
    {
      name: 'cms-backend',
      script: 'dist/server.js',

      // Cluster mode: 1 worker per CPU core.
      // Socket.IO cross-process sync is handled by @socket.io/redis-adapter.
      instances: 'max',
      exec_mode: 'cluster',

      // Restart worker if RSS exceeds 512 MB
      max_memory_restart: '512M',

      // Keep retrying with exponential back-off, but stop after 10 crashes in a row
      max_restarts: 10,
      restart_delay: 3000,

      // Graceful shutdown: wait up to 10s for in-flight requests to finish
      kill_timeout: 10000,
      wait_ready: true,       // server sends process.send('ready') when listening
      listen_timeout: 10000,

      // Log files
      error_file: '/var/log/cms/error.log',
      out_file: '/var/log/cms/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,       // merge all instance logs into single file

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
    },
  ],
};
