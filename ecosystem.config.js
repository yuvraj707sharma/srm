module.exports = {
  apps: [
    {
      name: "srm-backend",
      cwd: "./backend",
      script: "./venv/bin/uvicorn",
      args: "app.main:app --host 127.0.0.1 --port 8007 --workers 2",
      interpreter: "none",
      env: {
        PORT: 8007,
        ENVIRONMENT: "production"
      }
    },
    {
      name: "srm-frontend",
      cwd: "./frontend",
      script: "npm",
      args: "run start -- -p 3007",
      env: {
        PORT: 3007,
        NODE_ENV: "production",
        NEXT_PUBLIC_BASE_PATH: "/srm",
        NEXT_PUBLIC_BACKEND_URL: "/srm-api"
      }
    }
  ]
};
