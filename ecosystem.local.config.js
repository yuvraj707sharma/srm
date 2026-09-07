module.exports = {
  apps: [
    {
      name: "catalog-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "run start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../storage/logs/frontend-error.log",
      out_file: "../storage/logs/frontend-out.log"
    },
    {
      name: "catalog-backend",
      cwd: "./backend",
      script: ".venv/Scripts/uvicorn.exe",
      args: "app.main:app --host 127.0.0.1 --port 8000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      // Let it inherit the shell environment so secrets aren't hardcoded here
      env: {
        ENVIRONMENT: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../storage/logs/backend-error.log",
      out_file: "../storage/logs/backend-out.log",
      // Important for graceful shutdown
      kill_timeout: 10000 
    },
    {
      name: "catalog-extraction-worker",
      cwd: "./backend",
      script: ".venv/Scripts/python.exe",
      args: "-m app.worker.job_runner",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        ENVIRONMENT: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../storage/logs/extraction-worker-error.log",
      out_file: "../storage/logs/extraction-worker-out.log",
      kill_timeout: 15000 // Give it 15 seconds to safely commit or rollback any running jobs
    },
    {
      name: "catalog-embedding-worker",
      cwd: "./backend",
      script: ".venv/Scripts/python.exe",
      args: "-m app.worker.embedding_runner",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        ENVIRONMENT: "production"
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "../storage/logs/embedding-worker-error.log",
      out_file: "../storage/logs/embedding-worker-out.log",
      kill_timeout: 15000
    }
  ]
};
