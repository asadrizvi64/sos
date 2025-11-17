# Fix for Fly.io GitHub Deployment - Buildpack Conflict

## The Problem

When deploying from GitHub in Fly.io dashboard, you're getting:
```
Error: launch manifest was created for a app, but this is a NodeJS app
unsuccessful command 'flyctl launch plan generate /tmp/manifest.json'
```

**Root Cause:** Fly.io detects both:
- Buildpack (from `package.json`)
- Dockerfile

This causes a conflict during the initial scan.

## ✅ Solution: Configure in Fly.io Dashboard

Since you're deploying from GitHub (not CLI), you need to configure the app in Fly.io dashboard:

### Step 1: Go to Fly.io Dashboard
1. Navigate to your app: `sos-hs5xqw`
2. Go to **Settings** → **Build & Deploy**

### Step 2: Configure Build Method
1. Find **"Build Configuration"** or **"Build Settings"**
2. Select **"Dockerfile"** as the build method
3. Set **Dockerfile path** to: `Dockerfile`
4. **Disable** or **uncheck** "Auto-detect build method"
5. Save changes

### Step 3: Alternative - Update App Configuration
If the above doesn't work, you may need to:
1. Disconnect the GitHub repo temporarily
2. Reconnect it, but this time:
   - When prompted for build method, select **"Dockerfile"**
   - Do NOT let it auto-detect

## Alternative Solution: Use Fly.io CLI Once

If dashboard configuration doesn't work, you can use CLI once to set the build method:

```bash
# Set the app to use Docker only (run this once)
flyctl config save -a sos-hs5xqw

# Or update the app configuration
flyctl apps update sos-hs5xqw --build-dockerfile Dockerfile
```

After this, GitHub deployments should work.

## Current fly.toml Configuration

Your `fly.toml` is correctly configured:
```toml
[build]
  dockerfile = "Dockerfile"
  ignorefile = ".flyignore"
```

This should work, but Fly.io dashboard might be overriding it with auto-detection.

## Verification

After configuring in dashboard:
1. Push a commit to trigger deployment
2. Check build logs - it should show "Building with Dockerfile" not "Building with buildpack"
3. The error should be gone

## If Still Not Working

If the issue persists, you may need to:
1. Delete the app in Fly.io
2. Recreate it with Docker from the start
3. Connect GitHub repo
4. Select Dockerfile as build method during setup

---

**Note:** Fly.io absolutely CAN deploy Node.js apps! This is just a configuration issue with auto-detection.

