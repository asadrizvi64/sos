# Quick Fix: Nango Configuration Error

## The Error

```
Connection Error
Failed to connect: Nango is not configured. Please set NANGO_SECRET_KEY environment variable.
```

## Why This Happens

**57 out of 100 connectors** use OAuth2 authentication, which requires Nango to handle the OAuth flows. Without Nango configured, these connectors cannot connect.

## Quick Fix (2 minutes)

### Step 1: Get Nango Secret Key

1. Go to [https://nango.dev](https://nango.dev)
2. Sign up (free tier available)
3. Create a project
4. Copy your **Secret Key** from the dashboard

### Step 2: Add to Environment

Add this line to `backend/.env`:

```bash
NANGO_SECRET_KEY=your_secret_key_here
```

### Step 3: Restart Backend

```bash
cd backend
npm run dev
```

### Step 4: Verify

Check the backend logs. You should see:
```
✅ Nango client initialized
```

## What Connectors Need Nango?

**57 connectors** require Nango for OAuth:

- **CRM**: Salesforce, HubSpot, Pipedrive, Zoho CRM, Microsoft Dynamics 365, SugarCRM
- **Communication**: Slack, Microsoft Teams, Discord, Zoom, Intercom, Zendesk
- **Productivity**: Trello, Asana, Monday.com, Jira, Notion, ClickUp, Linear, Basecamp, Wrike
- **E-commerce**: Shopify, BigCommerce, Magento, Squarespace Commerce, Etsy
- **Developer Tools**: GitHub, GitLab, Bitbucket, Vercel, Netlify, Heroku
- **Social Media**: LinkedIn, Twitter/X, Facebook, Instagram, YouTube
- **And 20+ more...**

**43 connectors** work without Nango (API keys or connection strings):
- Stripe, PayPal, Twilio, SendGrid, Mailgun, Postmark, Telegram
- PostgreSQL, MySQL, MongoDB, Redis, Microsoft SQL Server, etc.

## Need More Details?

See [NANGO_EXPLANATION.md](./NANGO_EXPLANATION.md) for a detailed explanation of what Nango does and why it's needed.

