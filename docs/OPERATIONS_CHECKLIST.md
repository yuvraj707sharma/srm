# Operations & Incident Checklist

This document provides checklists for maintaining the reliability of the application in production.

## Daily Checklist

- [ ] **PM2 Status**: Run `pm2 status`. Ensure `catalog-frontend`, `catalog-backend`, `catalog-extraction-worker`, and `catalog-embedding-worker` are online and have not restarted excessively.
- [ ] **Application Logs**: Check `pm2 logs --lines 100` for unusual spikes in Warnings or Errors.
- [ ] **Failed Jobs**: Query the database or use the admin dashboard to check for jobs permanently stuck in `FAILED`.
- [ ] **MySQL Health**: Ensure MySQL process is running and consuming expected memory.
- [ ] **Qdrant Health**: Ensure Qdrant is accepting connections on `127.0.0.1:6333`.
- [ ] **Disk & Memory**: Run `df -h` and `free -m`. Ensure log files are rotating and the server is not out of memory.

## Weekly Checklist

- [ ] **Database Backup Verification**: Verify that the daily `mysqldump` backups are actively running and generating files of an expected size.
- [ ] **Restore Verification Test**: Spin up a local MySQL instance and restore the latest backup to guarantee integrity.
- [ ] **Worker Failure Review**: Investigate jobs that failed during the week. Determine if errors were due to Gemini API outages or invalid PDF uploads.
- [ ] **Disk Cleanup**: Remove obsolete logs or temp files in `/storage`.
- [ ] **Dependency Review**: Check for high-severity CVEs in Python and Node.js dependencies (`npm audit`, `pip-audit`).

## Incident Response Workflow

If the application is reported down or degraded, follow these steps in order:

1. **Check Nginx**: `systemctl status nginx`. Is the reverse proxy actively running and routing traffic?
2. **Check Frontend**: `pm2 logs catalog-frontend`. Are there Next.js SSR crashes?
3. **Check Backend API**: `pm2 logs catalog-backend`. Check for 500 Internal Server errors or Database connection timeouts.
4. **Check Extraction Worker**: `pm2 logs catalog-extraction-worker`. Ensure it hasn't crashed due to Gemini API limits.
5. **Check Embedding Worker**: `pm2 logs catalog-embedding-worker`. 
6. **Check MySQL**: Ensure the database is accessible. If MySQL is down, the FastAPI backend will fail readiness checks.
7. **Check Qdrant**: Ensure Qdrant is running. 
8. **Check Health Endpoints**: Hit `/api/v1/health/live` and `/api/v1/health/ready`.
9. **Recover Service**: Restart the failed service via `pm2 restart <name>`.
10. **Verify Data Integrity**: Ensure no corrupted data was left in the database (background workers use transaction rollbacks automatically).
11. **Document Incident**: Log the incident, root cause, and remediation steps.
