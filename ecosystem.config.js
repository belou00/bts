// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "bts-int",
      cwd: "/var/www/bts",                 // adaptez si besoin
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        APP_ENV: "integration",
        NODE_ENV: "production",
        PORT: "8081"
      },
      error_file: "/var/log/pm2/bts-int.err.log",
      out_file: "/var/log/pm2/bts-int.out.log"
    },
    {
      name: "bts-prod",
      cwd: "/var/www/bts",
      script: "src/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        APP_ENV: "production",
        NODE_ENV: "production",
        PORT: "8080"
      },
      error_file: "/var/log/pm2/bts-prod.err.log",
      out_file: "/var/log/pm2/bts-prod.out.log"
    }
  ]
};
