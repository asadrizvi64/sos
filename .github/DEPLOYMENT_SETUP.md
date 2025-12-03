# Vercel Deployment Setup Guide

This guide will help you set up automated deployments to Vercel using GitHub Actions.

## Prerequisites

- A Vercel account (free tier works fine)
- Your project connected to Vercel
- Admin access to your GitHub repository

## Step 1: Get Vercel Tokens and IDs

### 1.1 Get Your Vercel Token

1. Go to [Vercel Account Settings](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Give it a name (e.g., "GitHub Actions Deployment")
4. Set scope to **Full Account**
5. Click **Create** and copy the token immediately (you won't see it again)

### 1.2 Get Your Vercel Organization ID

Run this command in your terminal:

```bash
# Install Vercel CLI if you haven't already
npm install -g vercel

# Login to Vercel
vercel login

# Link your project (run this in your project directory)
vercel link

# The IDs will be saved in .vercel/project.json
cat .vercel/project.json
```

You'll see something like:

```json
{
  "orgId": "team_xxxxxxxxxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxxxxxxxxx"
}
```

## Step 2: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following three secrets:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `VERCEL_TOKEN` | Your Vercel API token from Step 1.1 | `xxxxxxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_ORG_ID` | Your organization/team ID from Step 1.2 | `team_xxxxxxxxxxxxxxxxxxxx` |
| `VERCEL_PROJECT_ID` | Your project ID from Step 1.2 | `prj_xxxxxxxxxxxxxxxxxxxx` |

## Step 3: Configure Vercel Project Settings

### 3.1 Environment Variables in Vercel

Make sure all your production environment variables are set in Vercel:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add all required variables (see list below)

#### Required Environment Variables

Based on your `vercel.json`, you'll need:

- `NODE_ENV` (already set to "production" in vercel.json)
- `DATABASE_URL` - Your Supabase/PostgreSQL database URL
- `REDIS_URL` - Your Redis connection string
- `CLERK_SECRET_KEY` - Clerk authentication secret
- `CLERK_PUBLISHABLE_KEY` - Clerk public key
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key
- `RESEND_API_KEY` - Resend email service key
- `NANGO_SECRET_KEY` - Nango OAuth service key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

Plus any optional variables you want to enable:
- `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry
- `POSTHOG_API_KEY` - PostHog analytics
- `RUDDERSTACK_WRITE_KEY` - RudderStack
- `STACKSTORM_API_URL`, `STACKSTORM_API_KEY` - StackStorm

### 3.2 Build Settings in Vercel

The workflow handles building, but verify these settings in Vercel Dashboard:

1. **Framework Preset**: Other (or None)
2. **Build Command**: Handled by GitHub Actions
3. **Output Directory**: `frontend/dist` (already set in vercel.json)
4. **Install Command**: `npm ci --legacy-peer-deps --no-audit --no-fund` (already set in vercel.json)

## Step 4: How the Workflow Works

### Automatic Deployments

- **Push to `main`**: Deploys to **Production**
- **Push to `claude/**` branches**: Creates **Preview** deployment
- **Pull Requests**: Creates **Preview** deployment with URL in PR comments
- **Manual Trigger**: Can be triggered manually from GitHub Actions tab

### Deployment Process

1. ✅ Checkout code
2. ✅ Setup Node.js 20 with npm cache
3. ✅ Install Vercel CLI
4. ✅ Pull Vercel environment configuration
5. ✅ Build project artifacts
6. ✅ Deploy to Vercel (preview or production)
7. ✅ Comment on PR with preview URL (if applicable)
8. ✅ Create deployment summary

### Features

- **Fast builds**: Uses npm cache to speed up installations
- **Preview deployments**: Every PR gets its own preview URL
- **PR comments**: Preview URLs automatically posted to PRs
- **Production deploys**: Only from `main` branch
- **Manual deploys**: Can trigger deployments manually
- **Deployment summaries**: Clear status in GitHub Actions UI

## Step 5: Test Your Setup

### Option 1: Manual Workflow Trigger

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Select **Deploy to Vercel** workflow
4. Click **Run workflow**
5. Select branch and click **Run workflow**

### Option 2: Push to a Claude Branch

```bash
# Create a test branch
git checkout -b claude/test-deployment

# Make a small change
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "Test deployment workflow"

# Push to trigger deployment
git push origin claude/test-deployment
```

### Option 3: Create a Pull Request

1. Push a branch to GitHub
2. Create a PR to `main`
3. The workflow will automatically run and comment on your PR with the preview URL

## Troubleshooting

### Error: "Missing required environment variables"

- Make sure you've added all three secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Check that the secret values don't have extra spaces or newlines

### Error: "Project not found"

- Verify your `VERCEL_PROJECT_ID` is correct
- Make sure the project exists in your Vercel account
- Try running `vercel link` locally to confirm the IDs

### Error: "Unauthorized"

- Check that your `VERCEL_TOKEN` is valid and hasn't expired
- Verify the token has **Full Account** scope
- Generate a new token if needed

### Build Failures

- Check the build logs in GitHub Actions
- Verify your `vercel.json` configuration is correct
- Make sure all environment variables are set in Vercel Dashboard
- Test the build locally: `npm run build`

### Deployment is Slow

- First deployment is always slower as it sets up caching
- Subsequent deployments should be faster due to npm cache
- Average deployment time: 3-5 minutes

## Monitoring Deployments

### GitHub Actions

- View all deployments: Repository → Actions tab
- Each deployment shows:
  - Build logs
  - Deployment URL
  - Status (success/failure)
  - Duration

### Vercel Dashboard

- View all deployments: [Vercel Dashboard](https://vercel.com/dashboard)
- Select your project → **Deployments** tab
- See deployment history, logs, and metrics

## Best Practices

1. **Always test in preview first**: Create a PR to test changes before merging to main
2. **Use environment variables**: Never commit secrets to your repository
3. **Monitor deployments**: Check both GitHub Actions and Vercel Dashboard
4. **Set up notifications**: Enable GitHub Actions notifications for deployment failures
5. **Keep tokens secure**: Store tokens only in GitHub Secrets, never in code

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check Vercel deployment logs
4. Verify all secrets are set correctly
5. Ensure environment variables are configured in Vercel

---

**Happy Deploying! 🚀**
