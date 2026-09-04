# Production Deployment Guide

## Prerequisites

- Node.js 24+
- PostgreSQL 13+ (optional, for watchlist/portfolio features)
- pnpm package manager

## Environment Setup

### 1. Create `.env.production` file

Copy `.env.example` to `.env.production` and fill in the required values:

```bash
# Required for production
NEXT_PUBLIC_BASE_PATH=/nextjs

# Database (optional, but recommended for full features)
DATABASE_URL=postgresql://user:password@localhost:5432/stock_screener

# Logging
LOG_LEVEL=info
DEBUG=false
```

### 2. Database Setup (Optional but Recommended)

To enable watchlist, portfolio, and alerts features:

```bash
# Navigate to the database package
cd lib/db

# Create .env with DATABASE_URL
echo "DATABASE_URL=your_postgres_connection_string" > .env

# Push schema to database
pnpm run push
```

## Deployment Steps

### Local Build Testing

```bash
# Build the entire project
pnpm run build

# Verify build succeeded
echo "Build completed successfully"

# Start production server
cd artifacts/nextjs-screener
pnpm run start
```

The app will be available at: `http://localhost:3000/nextjs` (default port) or `http://localhost:24507/nextjs`

### Docker Deployment

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:24-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm run build

WORKDIR /app/artifacts/nextjs-screener

# Expose port
EXPOSE 24507

# Start server
CMD ["pnpm", "run", "start"]
```

Build and run:

```bash
docker build -t indian-stock-screener .
docker run -p 24507:24507 \
  -e NEXT_PUBLIC_BASE_PATH=/nextjs \
  -e DATABASE_URL=postgresql://user:pass@db:5432/stock \
  indian-stock-screener
```

### Environment Variables Reference

| Variable                | Required | Default                          | Description                                                              |
| ----------------------- | -------- | -------------------------------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_BASE_PATH` | Yes      | `/nextjs`                        | Base path for Next.js deployment                                         |
| `DATABASE_URL`          | No       | -                                | PostgreSQL connection string. If not set, database features are disabled |
| `NODE_OPTIONS`          | No       | `--max-http-header-size=1000000` | Node.js options for large API responses                                  |
| `LOG_LEVEL`             | No       | `info`                           | Logging level: `debug`, `info`, `warn`, `error`                          |
| `DEBUG`                 | No       | `false`                          | Enable debug mode                                                        |
| `PORT`                  | No       | `24507`                          | Server port                                                              |

## Features Without Database

The app works without a database with the following limitations:

✅ **Works:**

- Market overview (indices, gainers, losers)
- Stock screener with filters
- Sector performance
- FII/DII flows
- Forex rates
- Gold ETF prices
- News feeds
- Market scans
- Custom query screener

❌ **Disabled:**

- Watchlist (requires database)
- Portfolio tracker (requires database)
- Price alerts (requires database)

## Performance Optimization

### 1. Caching Strategy

The app implements TTL-based caching:

- Market data: 60 seconds
- Fundamentals: 5 minutes
- Screener quotes: 2 minutes

Cache is managed automatically via the `@/lib/cache.ts` utility.

### 2. Production Checks

Before deployment, ensure:

```bash
# Type checking
pnpm run typecheck

# Build verification
pnpm run build

# Check for build errors
echo $? # Should output 0
```

### 3. Monitoring

Monitor these endpoints for health:

- `GET /` - Homepage (should return 200)
- `GET /api/market/overview` - Market data (should return 200)
- `GET /api/watchlist` - Watchlist (should return 200 or 503 if DB disabled)

## Security Considerations

1. **Headers**: The app includes security headers (X-Frame-Options, X-Content-Type-Options, etc.)
2. **CORS**: Configured for trusted origins only in production
3. **Database**: Use strong passwords and SSL connections
4. **Secrets**: Never commit `.env.production` to version control

## Troubleshooting

### "DATABASE_URL must be set" Error

**Solution**: This is now graceful. The app will work without a database, but watchlist/portfolio features will return 503 errors.

If you want these features:

1. Set up PostgreSQL
2. Add DATABASE_URL to environment
3. Run database migrations: `cd lib/db && pnpm run push`

### API returning 500 errors

**Check logs for:**

- Database connection issues (if DATABASE_URL is set)
- External API timeouts (Yahoo Finance)
- Network connectivity

### Slow performance

**Solutions:**

1. Increase cache TTL if data freshness allows
2. Add CDN (Cloudflare, AWS CloudFront)
3. Enable compression (already enabled in next.config)
4. Monitor database query performance

## Deployment to Production Platforms

### Vercel

```bash
# Connect repository
vercel

# Set environment variables in Vercel dashboard
NEXT_PUBLIC_BASE_PATH=/nextjs
DATABASE_URL=<your-postgres-url>

# Deploy
vercel deploy --prod
```

### AWS EC2

```bash
# SSH into instance
ssh -i key.pem ec2-user@instance-ip

# Install dependencies
sudo yum update
sudo yum install nodejs postgresql-client

# Clone repo and install
git clone <repo>
cd Indian-Stock-Analysis-main
pnpm install
pnpm run build

# Start with PM2
npm install -g pm2
cd artifacts/nextjs-screener
pm2 start "pnpm run start" --name "stock-screener"
pm2 save
```

### Railway / Render

1. Connect GitHub repository
2. Set environment variables in dashboard
3. Automatic deployment on push

## Support & Issues

- Check logs: Application logs are prefixed with timestamp and level
- Review `.env.example` for all available configuration options
- Database features are optional; core screener works without it
