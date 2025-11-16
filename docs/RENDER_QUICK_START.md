# Render Quick Start (5 Minutes)

## Fastest Way to Deploy

### 1. Push to GitHub

```bash
git add .
git commit -m "Deploy to Render"
git push origin main
```

### 2. Deploy via Blueprint

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect GitHub repository
4. Render will auto-detect `render.yaml` and create all services

### 3. Set Required Environment Variables

Go to each service and add these **required** variables:

#### Backend (`sos-backend`)

```bash
DATABASE_URL=postgresql://...          # From Supabase
CLERK_SECRET_KEY=sk_test_...          # From Clerk
CLERK_PUBLISHABLE_KEY=pk_test_...     # From Clerk
OPENAI_API_KEY=sk-...                 # From OpenAI
ANTHROPIC_API_KEY=sk-ant-...          # From Anthropic
RESEND_API_KEY=re_...                 # From Resend
NANGO_SECRET_KEY=nango_sk_...         # From nango.dev (REQUIRED!)
SUPABASE_URL=https://...              # From Supabase
SUPABASE_ANON_KEY=eyJ...              # From Supabase
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # From Supabase
```

#### Frontend (`sos-frontend`)

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...  # Same as backend
```

### 4. Link Services

1. Backend → Link `sos-redis` (Redis)
2. Backend → Link `sos-frontend` (for CORS)
3. Frontend → Link `sos-backend` (for API URL)

### 5. Deploy

Click **"Manual Deploy"** → **"Deploy latest commit"**

### 6. Verify

- Backend: `https://sos-backend.onrender.com/health`
- Frontend: `https://sos-frontend.onrender.com`

## That's It! 🎉

Your platform is now live on Render!

## Need Help?

See [RENDER_DEPLOYMENT_GUIDE.md](./RENDER_DEPLOYMENT_GUIDE.md) for detailed instructions.

