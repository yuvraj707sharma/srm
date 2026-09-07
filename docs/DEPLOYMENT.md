# Linux Production Deployment Guide (PM2 + Nginx)

This guide documents the deployment procedure for the application on the target Linux infrastructure using PM2 and Nginx. 

**WARNING: DO NOT RUN COMMANDS THAT DESTROY DATABASES/TABLES (e.g. `rm -rf`, `DROP DATABASE`).**
**NOTE:** This application does not use Docker. 

## Prerequisites
Ensure the Linux server has the following installed:
- Python 3.11+
- Node.js 18+ and npm
- MySQL 8.0+
- Qdrant (native or running as a local service on port 6333)
- Nginx
- PM2 (`npm install -g pm2`)
- Git

## 1. Repository Setup

Clone the repository to the desired location (e.g., `/var/www/tenderapp`):
```bash
git clone https://github.com/your-org/tenderapp.git
cd tenderapp
```

## 2. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example backend/.env
   ```
2. Edit `backend/.env`. Refer to `docs/PRODUCTION_ENV.example` for required fields. **Crucially**, ensure `ENVIRONMENT=production` and `CORS_ORIGINS` points to your public domain.

## 3. Backend Setup

1. **Create Python Virtual Environment:**
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
3. **Database Migration:**
   *Verify MySQL is running before executing.*
   ```bash
   alembic upgrade head
   ```
   *(Do NOT run this if upgrading an existing production database without backing it up first).*

## 4. Frontend Setup

1. **Install Dependencies & Build:**
   ```bash
   cd ../frontend
   npm ci
   npm run build
   ```

## 5. Nginx Configuration

1. Copy the provided Nginx configuration to your system's Nginx folder:
   ```bash
   sudo cp docs/nginx.conf.example /etc/nginx/sites-available/tenderapp
   ```
2. Edit the file to replace `YOUR_DOMAIN`, `BACKEND_PORT` (8000), and `FRONTEND_PORT` (3000). 
3. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/tenderapp /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## 6. PM2 Startup

We use PM2 to manage the lifecycle of the frontend, backend, and background workers securely. 

1. From the project root, start the PM2 ecosystem:
   ```bash
   pm2 start ecosystem.config.js
   ```
2. Verify all 4 processes are `online`:
   ```bash
   pm2 status
   ```
3. Check the logs for immediate errors:
   ```bash
   pm2 logs
   ```
4. Save the PM2 list so it restarts on system boot:
   ```bash
   pm2 save
   pm2 startup
   ```

## 7. Health Verification

Verify the application is securely running:
- **Nginx Access**: Navigate to `https://YOUR_DOMAIN`. The Next.js frontend should load.
- **API Readiness**: Navigate to `https://YOUR_DOMAIN/api/v1/health/ready`. It should return a 200 OK JSON response confirming MySQL and Qdrant connections.
