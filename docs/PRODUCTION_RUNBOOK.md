# Production Runbook

## STARTUP (PM2)

If the server reboots or PM2 is restarted, ensure MySQL and Qdrant are healthy, then start the application.

1. **Verify Infrastructure**:
   ```bash
   systemctl status mysql
   systemctl status qdrant
   ```
2. **Start Application Suite via PM2**:
   ```bash
   cd /path/to/tenderapp
   pm2 start ecosystem.config.js
   pm2 save
   ```
3. **Verify Status**:
   ```bash
   pm2 status
   pm2 logs
   ```

## SHUTDOWN & RELOAD (PM2)

To safely restart the API without dropping requests, or stop background workers:

- **Graceful Restart**:
  ```bash
  pm2 reload all
  ```
- **Stop Application**:
  ```bash
  pm2 stop all
  ```

*The `ecosystem.config.js` is configured with `kill_timeout` to give workers up to 15 seconds to safely commit or rollback active transactions before exiting upon `SIGTERM`.*

## RECOVERY & RELIABILITY

### Worker Recovery
If an extraction worker or embedding worker crashes or is killed via `SIGKILL`, the job will be left in `PROCESSING` status.
- **Recovery**: The background workers contain a stale-job recovery loop. Any job stuck in `PROCESSING` for more than 15 minutes is automatically reverted to `PENDING` and reclaimed.
- **Action**: No manual intervention is required. Simply restart the worker `pm2 restart catalog-extraction-worker`.

### Database Recovery
**MySQL is the authoritative source of catalog, draft, and recommendation state.**
- **Backup**: Must be backed up daily using `mysqldump` and stored securely off-site.
- **Restore**:
  1. `pm2 stop all`
  2. `mysql -u root -p tenderdb < backup.sql`
  3. `pm2 start all`

### Qdrant Recovery
**Qdrant is derived/search infrastructure only.**
- **Backup**: Snapshots are supported but optional.
- **Lost Data**: If Qdrant is corrupted or lost, vectors can be fully regenerated from `APPROVED` drafts within MySQL. The application retains its integrity.

## INCIDENT RESPONSE

1. **API Returns 502/503**:
   - Check Nginx logs: `tail -f /var/log/nginx/error.log`
   - Check PM2 Backend logs: `pm2 logs catalog-backend`
   - Verify MySQL connection. If MySQL is down, the FastAPI process will fail readiness checks.

2. **Extraction Jobs Stuck**:
   - Check PM2 Extraction logs: `pm2 logs catalog-extraction-worker`
   - Check if the Gemini API is rate-limiting or throwing 503s. The worker will automatically backoff and retry (`GEMINI_MAX_RETRIES`).

3. **Failed Recommendations / Search**:
   - If semantic search fails, verify Qdrant is active and the embedding worker is running: `pm2 logs catalog-embedding-worker`.
