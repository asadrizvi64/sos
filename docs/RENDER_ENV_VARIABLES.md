# Render Environment Variables Checklist

Use this checklist to ensure all required environment variables are set in Render.

## Backend Service (`sos-backend`)

### ✅ Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Authentication
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...

# Nango OAuth (REQUIRED for 57 OAuth connectors)
NANGO_SECRET_KEY=nango_sk_...
NANGO_HOST=https://api.nango.dev

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# CORS (auto-set when linking frontend)
CORS_ORIGIN=https://sos-frontend.onrender.com
```

### ⚙️ Optional Variables

```bash
# OpenTelemetry
OTEL_ENABLED=false
OTEL_SERVICE_NAME=sos-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-endpoint:4318

# PostHog
POSTHOG_API_KEY=ph_...
POSTHOG_HOST=https://app.posthog.com

# RudderStack
RUDDERSTACK_WRITE_KEY=...
RUDDERSTACK_DATA_PLANE_URL=https://hosted.rudderlabs.com

# StackStorm
STACKSTORM_ENABLED=false
STACKSTORM_API_URL=http://your-instance
STACKSTORM_API_KEY=...
```

## Frontend Service (`sos-frontend`)

### ✅ Required Variables

```bash
# API URL (auto-set when linking backend)
VITE_API_URL=https://sos-backend.onrender.com

# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

## How to Set Variables in Render

1. Go to your service in Render dashboard
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Enter key and value
5. Click **"Save Changes"**
6. Service will automatically redeploy

## Quick Copy-Paste for Render Dashboard

### Backend Required Variables (one per line)

```
DATABASE_URL
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY
NANGO_SECRET_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### Frontend Required Variables (one per line)

```
VITE_CLERK_PUBLISHABLE_KEY
```

## Verification

After setting variables, verify:

1. ✅ Backend health check: `https://sos-backend.onrender.com/health`
2. ✅ Frontend loads: `https://sos-frontend.onrender.com`
3. ✅ Can log in with Clerk
4. ✅ OAuth connectors work (test with Slack or GitHub)

