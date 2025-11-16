# Nango Setup Guide

## Quick Setup (5 minutes)

### Step 1: Sign Up for Nango

1. Go to [https://nango.dev](https://nango.dev)
2. Click "Sign Up" or "Get Started"
3. Create a free account (free tier available)

### Step 2: Create a Project

1. In the Nango dashboard, create a new project
2. Note your **Project ID** and **Secret Key**

### Step 3: Configure Environment Variables

Add to your `backend/.env` file:

```bash
# Nango Configuration
NANGO_SECRET_KEY=your_secret_key_from_nango_dashboard
NANGO_HOST=https://api.nango.dev  # Optional, defaults to this
```

### Step 4: Restart Backend

```bash
cd backend
npm run dev
```

### Step 5: Verify Setup

Check backend logs for:
```
✅ Nango client initialized
```

If you see:
```
⚠️ NANGO_SECRET_KEY not set, Nango OAuth will be disabled
```

Then the environment variable is not set correctly.

## Testing a Connection

1. Go to your platform's workflow builder
2. Add an integration node (e.g., Slack, GitHub, Salesforce)
3. Click "Connect"
4. You should be redirected to the service's OAuth page
5. Authorize the connection
6. You'll be redirected back and the connection will be established

## Troubleshooting

### Error: "Nango is not configured"

**Cause**: `NANGO_SECRET_KEY` environment variable is missing or incorrect.

**Solution**:
1. Verify the variable is set: `echo $NANGO_SECRET_KEY`
2. Check `.env` file exists and has the key
3. Restart the backend server
4. Check backend logs for initialization message

### Error: "Failed to initiate OAuth"

**Possible causes**:
1. Provider not configured in Nango dashboard
2. Invalid Nango credentials
3. Network connectivity issues

**Solution**:
1. Check Nango dashboard for provider configuration
2. Verify your Nango project is active
3. Check network connectivity to `api.nango.dev`

### OAuth Redirect Not Working

**Cause**: Frontend URL not configured correctly.

**Solution**:
1. Set `FRONTEND_URL` in `.env`:
   ```bash
   FRONTEND_URL=http://localhost:3000  # or your production URL
   ```
2. Ensure Nango callback URL is configured in Nango dashboard

## Nango Dashboard Configuration

### Required Settings

1. **Callback URL**: Set to `http://localhost:3000/api/v1/nango/oauth/{provider}/callback` (development)
2. **Frontend URL**: Set to your frontend URL
3. **Provider Configurations**: Most providers are pre-configured, but verify in dashboard

### Provider-Specific Setup

Some providers require additional setup in Nango dashboard:
- **Slack**: Requires Slack app creation and OAuth redirect URL
- **GitHub**: Requires GitHub OAuth app
- **Salesforce**: Requires Connected App setup
- **Microsoft**: Requires Azure AD app registration

Refer to Nango documentation for provider-specific setup.

## Cost Information

### Free Tier
- Up to 100 connections
- All OAuth providers
- Perfect for development and small projects

### Paid Tiers
- More connections
- Priority support
- Advanced features

See [nango.dev/pricing](https://nango.dev/pricing) for details.

## Alternative: Self-Hosted Nango

If you prefer to self-host Nango:
1. Follow Nango's self-hosting guide
2. Set `NANGO_HOST` to your self-hosted instance
3. Configure accordingly

## Security Best Practices

1. **Never commit** `NANGO_SECRET_KEY` to version control
2. **Use environment variables** for all secrets
3. **Rotate keys** periodically
4. **Monitor** connection health in Nango dashboard
5. **Review** OAuth scopes - only request what you need

