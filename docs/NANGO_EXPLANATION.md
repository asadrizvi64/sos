# Nango: OAuth Infrastructure for Integrations

## What is Nango?

**Nango** is a third-party OAuth infrastructure service that handles OAuth 2.0 authentication flows for hundreds of third-party APIs. Instead of implementing OAuth flows for each service individually, Nango provides a unified interface to connect to 200+ services.

## Why Do Most Integrations Use Nango?

### The Problem Without Nango

Implementing OAuth for each service requires:

1. **OAuth Flow Implementation** - Each service has different OAuth endpoints, scopes, and flows
2. **Token Management** - Storing, refreshing, and rotating access tokens
3. **Error Handling** - Handling expired tokens, revoked permissions, rate limits
4. **Security** - Securely storing credentials, handling redirects, CSRF protection
5. **Maintenance** - Keeping up with API changes, new scopes, deprecated endpoints

For **100 connectors**, this means:
- 100 different OAuth implementations
- 100 different token refresh mechanisms
- Constant maintenance as APIs evolve
- Thousands of lines of boilerplate code

### The Solution: Nango

Nango acts as a **unified OAuth layer** that:

1. **Pre-configured OAuth Flows** - Nango has pre-built OAuth configurations for 200+ services
2. **Automatic Token Management** - Handles token refresh, rotation, and expiration automatically
3. **Unified API** - One simple API to connect to any service
4. **Security** - Enterprise-grade security, encryption, and compliance
5. **Maintenance-Free** - Nango maintains all OAuth flows, you just use them

## How Nango Works

### Architecture

```
Your Platform          Nango Cloud          Third-Party Service
     │                      │                        │
     │  1. Initiate OAuth   │                        │
     ├─────────────────────>│                        │
     │                      │  2. Redirect to OAuth  │
     │                      ├───────────────────────>│
     │                      │  3. User Authorizes    │
     │                      │<───────────────────────┤
     │  4. Callback         │                        │
     │<─────────────────────┤                        │
     │  5. Get Token        │                        │
     │<─────────────────────┤                        │
     │                      │  6. Store & Refresh    │
     │                      │    tokens automatically│
```

### Flow Example: Connecting to Slack

1. **User clicks "Connect"** in your platform
2. **Your backend** calls `nangoService.initiateOAuth('slack', userId)`
3. **Nango** returns an OAuth URL: `https://nango.dev/oauth/slack?state=xyz`
4. **User** is redirected to Slack's OAuth page
5. **User** authorizes your app
6. **Slack** redirects back to Nango with authorization code
7. **Nango** exchanges code for access token and refresh token
8. **Nango** stores tokens securely in their infrastructure
9. **Your backend** calls `nangoService.getToken('slack', connectionId)` to get the access token
10. **Your platform** uses the token to make API calls to Slack

### Token Management

Nango automatically:
- **Refreshes tokens** before they expire
- **Handles token rotation** when services rotate tokens
- **Manages refresh tokens** securely
- **Notifies you** if tokens are revoked
- **Retries** failed token refresh attempts

## Current Implementation in Your Platform

### Statistics

- **57 connectors** use Nango for OAuth (out of 100 total)
- **43 connectors** use API keys or connection strings (don't need OAuth)

### Connectors Using Nango

Examples include:
- **CRM**: Salesforce, HubSpot, Pipedrive, Zoho CRM, Microsoft Dynamics 365, SugarCRM
- **Communication**: Slack, Microsoft Teams, Discord, Zoom, Intercom
- **Productivity**: Trello, Asana, Monday.com, Jira, Notion, ClickUp, Linear, Basecamp
- **E-commerce**: Shopify, BigCommerce, Magento, Squarespace Commerce, Etsy
- **Developer Tools**: GitHub, GitLab, Bitbucket, Vercel, Netlify, Heroku
- **Social Media**: LinkedIn, Twitter/X, Facebook, Instagram, YouTube
- **And many more...**

### Connectors NOT Using Nango

These use simpler authentication:
- **API Key**: Stripe, PayPal, Twilio, SendGrid, Mailgun, Postmark, Telegram, etc.
- **Connection String**: PostgreSQL, MySQL, MongoDB, Redis, Microsoft SQL Server
- **Custom OAuth**: Gmail, Outlook (have custom implementations)

## Configuration Required

### Environment Variables

To use Nango, you need to set:

```bash
# Required: Your Nango secret key (get from nango.dev)
NANGO_SECRET_KEY=your_secret_key_here

# Optional: Nango host (defaults to https://api.nango.dev)
NANGO_HOST=https://api.nango.dev
```

### How to Get Nango Credentials

1. **Sign up** at [nango.dev](https://nango.dev)
2. **Create a project** in the Nango dashboard
3. **Get your Secret Key** from the project settings
4. **Add it** to your `.env` file

### Nango Setup Steps

1. **Install Nango** (already done - `@nangohq/node` is in package.json)
2. **Set environment variable** `NANGO_SECRET_KEY`
3. **Configure OAuth providers** in Nango dashboard (most are pre-configured)
4. **Test connection** - The platform will automatically use Nango when configured

## How Nango Manages All This

### 1. Pre-Built OAuth Configurations

Nango maintains OAuth configurations for 200+ services:
- OAuth endpoints (authorization, token)
- Required scopes
- Token formats
- Refresh mechanisms
- Error handling

### 2. Unified SDK

One simple SDK handles all services:

```typescript
// Connect to any service
const authUrl = await nango.getAuthUrl('slack', connectionId);
const token = await nango.getToken('slack', connectionId);
const connection = await nango.getConnection('slack', connectionId);
```

### 3. Automatic Token Refresh

Nango's infrastructure:
- Monitors token expiration
- Automatically refreshes before expiration
- Handles refresh token rotation
- Retries on failures
- Notifies on revocation

### 4. Secure Storage

Nango stores:
- Access tokens (encrypted)
- Refresh tokens (encrypted)
- Connection metadata
- Expiration times
- Refresh schedules

### 5. Webhook Notifications

Nango can notify your platform:
- When tokens are refreshed
- When tokens are revoked
- When connections fail
- When re-authorization is needed

## Error: "Nango is not configured"

### What This Means

The error occurs when:
1. `NANGO_SECRET_KEY` environment variable is not set
2. Nango client cannot be initialized
3. A connector that requires OAuth tries to connect

### Impact

**Without Nango configured:**
- ❌ OAuth-based connectors cannot connect (57 connectors)
- ✅ API key connectors still work (43 connectors)
- ✅ Connection string connectors still work

### Solution

1. **Sign up for Nango** at [nango.dev](https://nango.dev)
2. **Get your Secret Key** from the dashboard
3. **Add to `.env` file**:
   ```bash
   NANGO_SECRET_KEY=your_secret_key_here
   ```
4. **Restart your backend server**

## Alternative: Custom OAuth Implementation

If you don't want to use Nango, you would need to:

1. **Implement OAuth for each service** (57 services)
2. **Handle token refresh** for each service
3. **Store tokens securely** in your database
4. **Monitor token expiration** and refresh automatically
5. **Handle errors** and edge cases for each service
6. **Maintain** as APIs change

**Estimated effort**: 2-3 months of development + ongoing maintenance

## Benefits of Using Nango

### For Development
- ✅ **Faster integration** - Connect to services in minutes, not weeks
- ✅ **Less code** - No OAuth boilerplate
- ✅ **Fewer bugs** - Battle-tested OAuth flows
- ✅ **Focus on features** - Not infrastructure

### For Operations
- ✅ **Automatic updates** - Nango maintains OAuth flows
- ✅ **Better security** - Enterprise-grade token management
- ✅ **Monitoring** - Built-in connection health monitoring
- ✅ **Scalability** - Handles millions of connections

### For Users
- ✅ **Reliable connections** - Automatic token refresh
- ✅ **Better UX** - Standardized OAuth flows
- ✅ **Security** - Industry-standard OAuth implementation

## Cost Considerations

Nango offers:
- **Free tier** - For development and small projects
- **Paid tiers** - For production with more connections
- **Enterprise** - For large-scale deployments

**Cost vs. Building Custom:**
- Building custom OAuth: 2-3 months developer time = $30k-$50k
- Nango subscription: $99-$999/month depending on usage
- **ROI**: Nango pays for itself in the first month

## Summary

**Nango is essential** for your platform because:

1. **57 out of 100 connectors** require OAuth
2. **Nango handles all OAuth complexity** automatically
3. **One configuration** enables all OAuth connectors
4. **Automatic token management** ensures reliable connections
5. **Maintenance-free** - Nango updates OAuth flows as APIs change

**Without Nango**, you would need to implement and maintain OAuth for 57 different services, which is not practical.

**To fix the error**, simply:
1. Sign up at nango.dev
2. Get your Secret Key
3. Add `NANGO_SECRET_KEY=your_key` to your `.env` file
4. Restart the backend

Once configured, all 57 OAuth-based connectors will work seamlessly!

