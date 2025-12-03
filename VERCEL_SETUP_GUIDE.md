# Vercel Project Setup Guide

## 🚨 Fixing "Project not found" Error

If you see this error in GitHub Actions:
```
Error: Project not found ({"VERCEL_PROJECT_ID":"***","VERCEL_ORG_ID":"***"})
```

This means your Vercel project hasn't been created yet, or the GitHub secrets don't match your Vercel project.

---

## 📋 Quick Fix (Option 1: Create New Project)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel@latest
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Link Your Project
```bash
# Navigate to your project directory
cd /path/to/your/project

# Link to Vercel (creates new project if doesn't exist)
vercel link
```

This will:
1. Ask which Vercel scope (personal/team) to use
2. Ask if you want to link to existing project or create new one
3. Create `.vercel/project.json` with your project settings

### Step 4: Get Your Project IDs
```bash
# This creates a .vercel directory with project.json
cat .vercel/project.json
```

You'll see output like:
```json
{
  "orgId": "team_xxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxx"
}
```

### Step 5: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:

| Secret Name | Value | Where to Get It |
|------------|-------|----------------|
| `VERCEL_TOKEN` | Your Vercel token | [Create here](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | `team_xxxxx` or `user_xxxxx` | From `.vercel/project.json` (orgId) |
| `VERCEL_PROJECT_ID` | `prj_xxxxx` | From `.vercel/project.json` (projectId) |

---

## 📋 Alternative Fix (Option 2: Use Existing Project)

If you already have a Vercel project:

### Step 1: Get Your Project IDs from Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **General**
4. Copy your **Project ID** (under "Project ID")
5. For **Team/Org ID**:
   - Personal account: Go to https://vercel.com/account
   - Team account: Go to https://vercel.com/teams/[your-team]/settings

### Step 2: Add to GitHub Secrets

Follow Step 5 from Option 1 above.

---

## 🔑 Creating a Vercel Token

1. Go to https://vercel.com/account/tokens
2. Click **Create Token**
3. Give it a name (e.g., "GitHub Actions")
4. Select scope (Full Account or specific projects)
5. Click **Create**
6. Copy the token (you won't see it again!)
7. Add as `VERCEL_TOKEN` in GitHub secrets

---

## 🧪 Testing Your Setup

After adding the secrets, test the workflow:

### Option A: Push to Your Branch
```bash
git add .
git commit -m "Test Vercel deployment"
git push origin claude/fix-vercel-condition-018or1KAh5uwjzCthYD8UrsV
```

### Option B: Trigger Manually
1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Deploy to Vercel** workflow
4. Click **Run workflow**
5. Select your branch
6. Click **Run workflow**

---

## ✅ Verification Checklist

- [ ] Vercel CLI installed
- [ ] Logged into Vercel (`vercel login`)
- [ ] Project linked (`vercel link`)
- [ ] `.vercel/project.json` exists with orgId and projectId
- [ ] `VERCEL_TOKEN` added to GitHub secrets
- [ ] `VERCEL_ORG_ID` added to GitHub secrets
- [ ] `VERCEL_PROJECT_ID` added to GitHub secrets
- [ ] GitHub Actions workflow run successfully

---

## 🔍 Troubleshooting

### Error: "Invalid token"
- Generate a new token at https://vercel.com/account/tokens
- Make sure you copied the entire token
- Verify the token has correct scope/permissions

### Error: "Project not found" (still happening)
- Double-check the `VERCEL_PROJECT_ID` matches your project
- Verify `VERCEL_ORG_ID` is correct (starts with `team_` or `user_`)
- Make sure you're using the right Vercel account/team

### Error: "Forbidden"
- Your token may not have permission for this project
- If using a team, make sure the token has team access
- Try creating a new token with full account access

### Error: "Missing environment variables"
- After project is created, add your environment variables:
  ```bash
  vercel env add DATABASE_URL
  vercel env add CLERK_SECRET_KEY
  # ... add all other required env vars
  ```
- Or add them in Vercel Dashboard → Settings → Environment Variables

---

## 🚀 Next Steps

Once your project is set up:

1. **Add Environment Variables** (see `VERCEL_DEPLOYMENT_GUIDE.md`)
2. **Configure Database** for serverless (use connection pooler)
3. **Test Deployment** by pushing to your branch
4. **Monitor Logs** in Vercel Dashboard

For detailed deployment instructions, see:
- `VERCEL_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `VERCEL_MIGRATION_GUIDE.md` - Migration from other platforms
- `VERCEL_QUICK_START.md` - Quick start guide

---

## 📞 Need Help?

- Vercel Documentation: https://vercel.com/docs
- GitHub Actions Logs: Check the workflow run for detailed error messages
- Vercel Support: https://vercel.com/support
