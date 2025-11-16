# Render Deployment Guide

This guide will walk you through deploying the SynthralOS Automation Platform to Render.

## Prerequisites

Before deploying, make sure you have:

1. ✅ **Render Account** - Sign up at [render.com](https://render.com)
2. ✅ **GitHub Repository** - Your code pushed to GitHub
3. ✅ **Supabase Account** - For PostgreSQL database
4. ✅ **Clerk Account** - For authentication
5. ✅ **Nango Account** - For OAuth integrations (get from [nango.dev](https://nango.dev))
6. ✅ **API Keys** - OpenAI, Anthropic, Resend, etc.

## Step 1: Push Code to GitHub

If you haven't already, push your code to GitHub:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

## Step 2: Create Services on Render

### Option A: Using render.yaml (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Select the repository containing `render.yaml`
5. Render will automatically detect and create all services

### Option B: Manual Setup

If you prefer manual setup, follow these steps:

#### 2.1 Create Backend Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `sos-backend`
   - **Environment**: `Node`
   - **Region**: `Oregon` (or your preferred region)
   - **Branch**: `main`
   - **Root Directory**: Leave empty (or `backend` if deploying from monorepo)
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: `Starter` (or higher for production)

#### 2.2 Create Frontend Service

1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `sos-frontend`
   - **Branch**: `main`
   - **Root Directory**: Leave empty
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`

#### 2.3 Create Redis Service

1. Click **"New +"** → **"Redis"**
2. Configure:
   - **Name**: `sos-redis`
   - **Region**: `Oregon` (same as backend)
   - **Plan**: `Starter`

## Step 3: Configure Environment Variables

### Backend Environment Variables

Go to your backend service → **Environment** tab and add:

#### Required Variables

```bash
# Database (from Supabase)
DATABASE_URL=postgresql://user:password@host:5432/database

# Authentication (from Clerk)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Email Service
RESEND_API_KEY=re_...

# Nango OAuth (REQUIRED for OAuth connectors)
NANGO_SECRET_KEY=nango_sk_...  # Get from https://nango.dev
NANGO_HOST=https://api.nango.dev

# Supabase (for code blob storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# CORS (will be auto-set from frontend service)
CORS_ORIGIN=https://sos-frontend.onrender.com
```

#### Optional Variables

```bash
# OpenTelemetry
OTEL_ENABLED=false
OTEL_SERVICE_NAME=sos-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-otel-endpoint:4318

# PostHog Analytics
POSTHOG_API_KEY=ph_...
POSTHOG_HOST=https://app.posthog.com

# RudderStack
RUDDERSTACK_WRITE_KEY=...
RUDDERSTACK_DATA_PLANE_URL=https://hosted.rudderlabs.com

# StackStorm (for self-healing)
STACKSTORM_ENABLED=false
STACKSTORM_API_URL=http://your-stackstorm-instance
STACKSTORM_API_KEY=...
```

### Frontend Environment Variables

Go to your frontend service → **Environment** tab and add:

```bash
# API URL (will be auto-set from backend service)
VITE_API_URL=https://sos-backend.onrender.com

# Clerk (same as backend)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

## Step 4: Link Services

### Link Redis to Backend

1. Go to backend service → **Environment** tab
2. Click **"Link Resource"**
3. Select `sos-redis`
4. Render will automatically add `REDIS_URL`

### Link Frontend to Backend

1. Go to backend service → **Environment** tab
2. Click **"Link Resource"**
3. Select `sos-frontend`
4. Render will automatically set `CORS_ORIGIN`

### Link Backend to Frontend

1. Go to frontend service → **Environment** tab
2. Click **"Link Resource"**
3. Select `sos-backend`
4. Render will automatically set `VITE_API_URL`

## Step 5: Deploy

1. Click **"Manual Deploy"** → **"Deploy latest commit"**
2. Wait for build to complete (5-10 minutes)
3. Check build logs for any errors

## Step 6: Verify Deployment

### Backend Health Check

Visit: `https://sos-backend.onrender.com/health`

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Frontend

Visit: `https://sos-frontend.onrender.com`

You should see the application homepage.

### API Documentation

Visit: `https://sos-backend.onrender.com/api-docs`

## Step 7: Update Nango Callback URLs

After deployment, update Nango callback URLs:

1. Go to [Nango Dashboard](https://app.nango.dev)
2. For each OAuth provider, update callback URL to:
   ```
   https://sos-backend.onrender.com/api/v1/nango/oauth/{provider}/callback
   ```

## Step 8: Update Clerk Redirect URLs

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Add to **Allowed Redirect URLs**:
   ```
   https://sos-frontend.onrender.com/*
   ```

## Troubleshooting

### Build Fails

**Error**: `npm install` fails
- **Solution**: Check Node.js version in `package.json`. Render uses Node 18+ by default.

**Error**: `npm run build` fails
- **Solution**: Check build logs for TypeScript errors. Fix any type errors.

### Backend Won't Start

**Error**: `Cannot connect to database`
- **Solution**: Verify `DATABASE_URL` is correct and database is accessible.

**Error**: `Redis connection failed`
- **Solution**: Verify Redis service is linked and `REDIS_URL` is set.

**Error**: `Nango is not configured`
- **Solution**: Add `NANGO_SECRET_KEY` to environment variables.

### Frontend Can't Connect to Backend

**Error**: CORS errors
- **Solution**: Verify `CORS_ORIGIN` is set to frontend URL in backend environment variables.

**Error**: API calls fail
- **Solution**: Verify `VITE_API_URL` is set correctly in frontend environment variables.

### Health Check Fails

**Error**: 404 on `/health`
- **Solution**: Verify health endpoint exists in `backend/src/index.ts` (it should).

## Post-Deployment Checklist

- [ ] Backend health check returns 200 OK
- [ ] Frontend loads without errors
- [ ] Can log in with Clerk
- [ ] Can create a workflow
- [ ] Can connect OAuth integrations (Slack, GitHub, etc.)
- [ ] Can execute workflows
- [ ] WebSocket connections work (for real-time execution)
- [ ] Database migrations are applied
- [ ] Redis is connected and working
- [ ] All environment variables are set

## Scaling

### Upgrade Plans

For production, consider upgrading:

- **Backend**: `Starter` → `Standard` or `Pro` (more RAM, CPU)
- **Redis**: `Starter` → `Standard` (more memory)
- **Frontend**: Static sites are free, but consider CDN for better performance

### Auto-Scaling

Render automatically scales based on traffic. For more control:

1. Go to service → **Settings**
2. Configure **Auto-Deploy** (on/off)
3. Set **Health Check Path** (already set to `/health`)

## Monitoring

### View Logs

1. Go to service → **Logs** tab
2. View real-time logs
3. Download logs for analysis

### Metrics

1. Go to service → **Metrics** tab
2. View CPU, Memory, Request metrics
3. Set up alerts for high usage

## Cost Estimation

### Free Tier (Development)

- Backend: Free (with limitations)
- Frontend: Free (static sites)
- Redis: Free (25MB)

### Paid Tier (Production)

- Backend: $7/month (Starter) or $25/month (Standard)
- Redis: $10/month (Starter) or $25/month (Standard)
- Frontend: Free (static sites)

**Total**: ~$17-50/month for production

## Support

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Render Support**: [render.com/support](https://render.com/support)
- **Project Issues**: Check GitHub issues

## Next Steps

After successful deployment:

1. Set up custom domain (optional)
2. Enable SSL (automatic on Render)
3. Set up monitoring and alerts
4. Configure backups for database
5. Set up CI/CD for automatic deployments

