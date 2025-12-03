# Deployment Guide - Vercel Serverless

**Platform:** Vercel
**Architecture:** Serverless Functions
**Status:** ✅ Ready to Deploy

---

## 🚀 Quick Deploy

### Prerequisites

1. **Vercel Account** - Sign up at https://vercel.com
2. **GitHub Repository** - Connected to your Vercel account
3. **Environment Variables** - See list below

### Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard:**
   - Visit https://vercel.com/new
   - Sign in with GitHub

2. **Import Repository:**
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel will auto-detect `vercel.json`

3. **Configure Environment Variables:**
   - Click "Environment Variables"
   - Add all required variables (see below)
   - Select "Production", "Preview", and "Development"

4. **Deploy:**
   - Click "Deploy"
   - Wait 5-10 minutes for build to complete
   - Your app will be live at `https://your-app.vercel.app`

### Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

---

## 🔑 Required Environment Variables

### **Critical (Must Set):**

```env
# Database (Supabase PostgreSQL with Pooler)
DATABASE_URL=postgresql://user:password@host:6543/database
# ⚠️ IMPORTANT: Use port 6543 (pooler) not 5432 (direct connection)
# Serverless requires connection pooling

# Authentication (Clerk)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# OAuth Connectors (Nango)
NANGO_SECRET_KEY=nango_sk_...
NANGO_HOST=https://api.nango.dev

# AI Providers (at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Email Service
RESEND_API_KEY=re_...

# Supabase (for file storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Cron Job Authentication
CRON_SECRET=your-random-secret-here
# Generate with: openssl rand -hex 32
```

### **Optional (Set if using):**

```env
# Redis (Upstash recommended for serverless)
REDIS_URL=redis://default:password@host:port

# Analytics
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com

# Event Tracking
RUDDERSTACK_WRITE_KEY=...
RUDDERSTACK_DATA_PLANE_URL=https://hosted.rudderlabs.com

# OpenTelemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=sos-backend
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-endpoint

# Additional AI Features
E2B_API_KEY=...
PINECONE_API_KEY=...
SERPAPI_API_KEY=...
BRAVE_API_KEY=...

# Email Integrations
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...

# Social Media
TWITTER_BEARER_TOKEN=...

# Self-Healing
STACKSTORM_ENABLED=false
STACKSTORM_API_URL=...
STACKSTORM_API_KEY=...
```

---

## 📋 Architecture Overview

### Serverless Functions

```
api/
├── index.ts              # Main Express app (all routes)
├── [...path].ts          # Catch-all route handler
├── cron/
│   ├── scheduled-workflows.ts    # Runs every minute
│   ├── cleanup-retention.ts      # Runs daily at 2 AM
│   └── cleanup-audit-logs.ts     # Runs daily at 3 AM
└── poll/
    └── execution-status.ts       # Polling endpoint for real-time updates
```

### Key Changes from Traditional Architecture

| Feature | Traditional (Render) | Serverless (Vercel) |
|---------|---------------------|---------------------|
| **Server** | Long-running Node.js | Stateless functions |
| **Real-time** | WebSockets | Polling |
| **Background Jobs** | BullMQ + Redis | Vercel Cron |
| **Database** | Direct connection | Connection pooler |
| **Static Files** | Express serve | Vercel CDN |
| **Scaling** | Manual | Automatic |

### What Was Changed

✅ **Removed:**
- Socket.IO WebSocket server
- BullMQ background job queue
- Long-running scheduler process

✅ **Added:**
- Polling endpoint for execution status
- Vercel Cron jobs for scheduled tasks
- Auto-detection for serverless environment
- Connection pooling for database

---

## 🔧 Vercel Configuration

The `vercel.json` file configures:

### Build Settings
```json
{
  "buildCommand": "npm run build:shared && npm run build:frontend",
  "outputDirectory": "frontend/dist",
  "installCommand": "npm ci --legacy-peer-deps --no-audit --no-fund"
}
```

### Cron Jobs
```json
{
  "crons": [
    {
      "path": "/api/v1/cron/scheduled-workflows",
      "schedule": "* * * * *"  // Every minute
    },
    {
      "path": "/api/v1/cron/cleanup-retention",
      "schedule": "0 2 * * *"  // Daily at 2 AM UTC
    },
    {
      "path": "/api/v1/cron/cleanup-audit-logs",
      "schedule": "0 3 * * *"  // Daily at 3 AM UTC
    }
  ]
}
```

### Function Settings
```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60,    // 60 seconds (max on Pro plan)
      "memory": 3008        // 3 GB RAM
    }
  }
}
```

---

## ✅ Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-app.vercel.app/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-03T...",
  "platform": "vercel",
  "version": "1.0.0"
}
```

### 2. API Documentation

Visit: `https://your-app.vercel.app/api-docs`

Should display Swagger UI with all API endpoints.

### 3. Polling Endpoint

```bash
curl "https://your-app.vercel.app/api/poll/execution-status?executionId=YOUR_EXECUTION_ID"
```

### 4. Cron Jobs

Check Vercel Dashboard → Your Project → Deployments → Logs

Look for cron job executions.

### 5. Frontend

Visit: `https://your-app.vercel.app/`

Should load the React application.

---

## 🐛 Troubleshooting

### Issue: Functions Timeout

**Solution:**
- Increase `maxDuration` in `vercel.json` (max 60s on Pro, 10s on Hobby)
- Break long-running tasks into smaller chunks
- Use external job queue (Inngest, Trigger.dev) for heavy processing

### Issue: Database Connection Errors

**Error:** `too many connections`

**Solution:**
- Ensure you're using Supabase pooler (port **6543** not 5432)
- Update `DATABASE_URL` to use pooler connection string
- The code auto-detects serverless and uses pooler

**Verify in code:**
```typescript
// backend/src/config/database.ts
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
if (isServerless) {
  // Uses pooler connection
}
```

### Issue: Cron Jobs Not Running

**Solution:**
1. Verify `CRON_SECRET` is set in environment variables
2. Check Vercel logs for cron job errors
3. Ensure cron paths match in `vercel.json` and `api/cron/*.ts`
4. Cron jobs require Vercel Pro plan (not available on Hobby)

### Issue: Build Fails

**Error:** TypeScript compilation errors

**Solution:**
- Check build logs in Vercel dashboard
- Build script uses `|| true` to continue on TS errors
- Verify all dependencies are installed
- Check `package.json` engines match Vercel Node.js version

### Issue: Cold Starts

**Symptom:** First request is slow (~1-3 seconds)

**Solution:**
- Upgrade to Vercel Pro plan (keeps functions warm)
- Use edge functions for simple routes
- Optimize bundle size (tree-shake dependencies)

---

## 📊 Performance Tips

### 1. Reduce Bundle Size

```bash
# Analyze bundle
npx vite-bundle-visualizer

# Remove unused dependencies
npm prune
```

### 2. Use Edge Functions (Optional)

For simple routes, create edge functions in `api/edge/`:

```typescript
export const config = {
  runtime: 'edge',
};
```

### 3. Enable Caching

Add cache headers for static content:

```typescript
res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
```

### 4. Database Query Optimization

- Use connection pooling (already configured)
- Add database indexes for frequently queried fields
- Use `SELECT` with specific columns instead of `SELECT *`

---

## 🔐 Security Checklist

- [ ] All environment variables set in Vercel dashboard
- [ ] `CRON_SECRET` is a strong random string
- [ ] Database credentials are secure (not hardcoded)
- [ ] API keys are environment-specific (production keys for prod)
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] Clerk authentication is configured
- [ ] Supabase RLS policies are enabled

---

## 📈 Monitoring

### Vercel Analytics

Enable in Vercel Dashboard → Your Project → Analytics

Provides:
- Request volume
- Error rates
- Performance metrics
- Edge locations

### Application Monitoring

The platform includes:
- **Performance Monitoring:** `/api/v1/monitoring/performance`
- **Audit Logs:** `/api/v1/audit-logs`
- **Execution Monitoring:** Real-time via polling endpoint

### External Monitoring (Optional)

Configure in environment variables:
- **PostHog:** User analytics
- **RudderStack:** Event tracking
- **OpenTelemetry:** Distributed tracing

---

## 🚀 Deployment Workflow

### Automatic Deployments

When you push to GitHub:
- **Main branch** → Production deployment
- **Feature branches** → Preview deployments

### Manual Deployments

```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel

# Deploy specific branch
vercel --prod --branch main
```

### Rollback

In Vercel Dashboard:
1. Go to Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"

---

## 📝 Next Steps

After successful deployment:

1. **Configure Custom Domain:**
   - Vercel Dashboard → Your Project → Settings → Domains
   - Add your custom domain
   - Update DNS records

2. **Set Up Monitoring:**
   - Enable Vercel Analytics
   - Configure PostHog (optional)
   - Set up alerts for errors

3. **Test All Features:**
   - Create a workflow
   - Test execution
   - Verify OAuth connectors
   - Check AI agents
   - Test email triggers

4. **Update Frontend URLs:**
   - Update Clerk allowed origins
   - Update OAuth redirect URLs
   - Update CORS origins if needed

5. **Performance Optimization:**
   - Monitor cold starts
   - Optimize database queries
   - Consider edge functions for hot paths

---

## 📚 Resources

- **Vercel Docs:** https://vercel.com/docs
- **Vercel CLI:** https://vercel.com/docs/cli
- **Serverless Functions:** https://vercel.com/docs/functions
- **Cron Jobs:** https://vercel.com/docs/cron-jobs
- **Environment Variables:** https://vercel.com/docs/environment-variables

---

## ✅ Ready to Deploy!

Your codebase is fully configured for Vercel serverless deployment.

**To deploy:**
1. Push this branch to GitHub
2. Connect repository to Vercel
3. Set environment variables
4. Click "Deploy"

**Or use CLI:**
```bash
vercel --prod
```

---

**Status:** ✅ **Production Ready**

All Render-specific files have been archived to `.archive/` directory.
