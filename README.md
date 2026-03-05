# QQQ Scraper - Docker Deployment Guide

This guide explains how to run the QQQ scraper as a containerized service with SQLite3 caching.

## Features

- **SQLite3 Caching**: Scraping results are cached for 24 hours
- **Automatic Revalidation**: Cache automatically refreshes after 24 hours on next request
- **Small Container Size**: Multi-stage Alpine-based build (~200-300MB)
- **Persistent Storage**: SQLite database persists across container restarts
- **Health Checks**: Built-in health monitoring

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f
   ```

3. **Stop the container:**
   ```bash
   docker-compose down
   ```

### Using Docker CLI

1. **Build the image:**
   ```bash
   docker build -t qqq-scraper .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name qqq-scraper \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     qqq-scraper
   ```

## Access the Application

- **Web Interface**: http://localhost:3000
- **API Endpoint**: http://localhost:3000/holdings
- **Health Check**: http://localhost:3000/health

## Cache Behavior

- **Cache Duration**: 24 hours
- **Cache Location**: `./data/cache.db` (persisted via volume mount)
- **Revalidation**: Automatic on first request after 24-hour expiry
- **Fallback**: Uses stale cache if scraping fails

## Environment Variables

You can customize the following environment variables in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DB_PATH=/app/data/cache.db
```

## Volume Mounts

The `./data` directory is mounted to persist the SQLite database across container restarts:

```yaml
volumes:
  - ./data:/app/data
```

## Resource Limits

Default resource limits are configured in `docker-compose.yml`:

- **CPU Limit**: 1 core
- **Memory Limit**: 1GB
- **CPU Reservation**: 0.25 cores
- **Memory Reservation**: 256MB

Adjust these based on your server capacity.

## Maintenance

### View Database

```bash
# Access the SQLite database
sqlite3 ./data/cache.db "SELECT fetched_at, datetime(fetched_at/1000, 'unixepoch') as fetched_date FROM holdings_cache;"
```

### Clear Cache

```bash
# Stop container and remove database
docker-compose down
rm -rf ./data/cache.db
docker-compose up -d
```

### Update Container

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs

# Check if port 3000 is already in use
lsof -i :3000
```

### Cache not working

```bash
# Check if data directory has correct permissions
ls -la ./data

# Check database file
sqlite3 ./data/cache.db "SELECT * FROM holdings_cache;"
```

### High memory usage

Puppeteer can use significant memory. Adjust resource limits in `docker-compose.yml` if needed.

## Production Deployment

For production deployment:

1. Use a reverse proxy (nginx/Traefik) for SSL termination
2. Set up monitoring and alerting
3. Configure log rotation
4. Use Docker secrets for sensitive data
5. Consider using a managed database service

## Architecture

```
┌─────────────────┐
│   User Request  │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Express Server │
└────────┬────────┘
         │
         v
┌─────────────────┐      Cache Valid (< 24h)?
│  Cache Layer    │────────────Yes────────────> Return Cached Data
│  (SQLite3)      │
└────────┬────────┘
         │
         No (expired or missing)
         │
         v
┌─────────────────┐
│  Puppeteer      │
│  Web Scraper    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Save to Cache  │
│  (24h validity) │
└─────────────────┘
```


test
