# API Keys Required for SynthralOS Platform

**Last Updated:** 2024-12-27

This document lists all API keys needed for the platform, organized by priority and feature.

---

## 🔴 **REQUIRED** (Core Functionality)

These keys are **essential** for the platform to function:

### 1. **Database**
- `DATABASE_URL` - PostgreSQL connection string (Supabase recommended)
  - **Where to get:** Your Supabase project settings → Database → Connection string
  - **Format:** `postgresql://user:password@host:5432/database`

### 2. **Redis**
- `REDIS_URL` - Redis connection string (for BullMQ queues and caching)
  - **Where to get:** Your Redis provider (Render, Upstash, etc.)
  - **Format:** `redis://user:password@host:6379`

### 3. **Authentication (Clerk)**
- `CLERK_SECRET_KEY` - Clerk secret key for backend authentication
- `CLERK_PUBLISHABLE_KEY` - Clerk publishable key for frontend
  - **Where to get:** https://dashboard.clerk.com → Your Application → API Keys
  - **Note:** Frontend also needs `VITE_CLERK_PUBLISHABLE_KEY` (same value)

### 4. **Nango OAuth** (REQUIRED for 57 OAuth connectors)
- `NANGO_SECRET_KEY` - Nango secret key for OAuth integrations
- `NANGO_HOST` - Nango API host (default: `https://api.nango.dev`)
  - **Where to get:** https://nango.dev → Sign up → Get your secret key
  - **Why needed:** Without this, OAuth connectors (Slack, GitHub, Salesforce, Google, etc.) will NOT work
  - **Impact:** 57+ connectors require this for OAuth authentication

---

## 🟠 **HIGHLY RECOMMENDED** (Key Features)

These keys enable major platform features:

### 5. **AI Providers** (At least one required for AI features)
- `OPENAI_API_KEY` - OpenAI API key for GPT models
  - **Where to get:** https://platform.openai.com/api-keys
  - **Used for:** AI agents, LLM nodes, RAG pipeline, code generation
  - **Required for:** AI Agent nodes, LLM nodes, RAG pipeline (if using OpenAI)

- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
  - **Where to get:** https://console.anthropic.com/settings/keys
  - **Used for:** AI agents, LLM nodes, RAG pipeline
  - **Required for:** AI Agent nodes, LLM nodes, RAG pipeline (if using Anthropic)

### 6. **Email Service**
- `RESEND_API_KEY` - Resend API key for transactional emails
  - **Where to get:** https://resend.com/api-keys
  - **Used for:** Email sending, email triggers, notifications
  - **Alternative:** Can use other email services (SendGrid, Mailgun, Postmark)

### 7. **Supabase** (For code blob storage)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
  - **Where to get:** Your Supabase project → Settings → API
  - **Used for:** Storing large code blobs for code agents
  - **Note:** If you're already using Supabase for database, you can use the same project

---

## 🟡 **OPTIONAL** (Feature-Specific)

These keys enable specific features but are not required for core functionality:

### 8. **Vector Store Providers** (For RAG pipeline)
- `PINECONE_API_KEY` - Pinecone API key (if using Pinecone for vector storage)
  - **Where to get:** https://app.pinecone.io → API Keys
  - **Used for:** RAG pipeline, document search, semantic search

- `WEAVIATE_API_KEY` - Weaviate API key (if using Weaviate)
  - **Where to get:** Your Weaviate instance settings
  - **Used for:** RAG pipeline, vector storage

- `QDRANT_API_KEY` - Qdrant API key (if using Qdrant)
  - **Where to get:** Your Qdrant instance settings

### 9. **Web Search Tools** (For AI agents)
- `SERPAPI_API_KEY` - SerpAPI key for web search
  - **Where to get:** https://serpapi.com/dashboard
  - **Used for:** AI agent web search tool (SerpAPI search)
  - **Alternative:** DuckDuckGo (free, no API key needed) or Brave Search

- `BRAVE_API_KEY` - Brave Search API key
  - **Where to get:** https://brave.com/search/api
  - **Used for:** AI agent web search tool (Brave search)

### 10. **OSINT / Social Media Monitoring**
- `TWITTER_BEARER_TOKEN` - Twitter API bearer token
  - **Where to get:** https://developer.twitter.com/en/portal/dashboard
  - **Used for:** Twitter monitoring, social media OSINT
  - **Note:** Requires Twitter Developer account

- `NEWS_API_KEY` - NewsAPI key
  - **Where to get:** https://newsapi.org/register
  - **Used for:** News monitoring, content aggregation

- `GITHUB_TOKEN` - GitHub personal access token
  - **Where to get:** https://github.com/settings/tokens
  - **Used for:** GitHub monitoring, repository tracking

### 11. **Code Execution** (Enhanced features)
- `E2B_API_KEY` - E2B API key for ultra-fast code execution
  - **Where to get:** https://e2b.dev → Get API key
  - **Used for:** Fast code execution (<50ms latency)
  - **Alternative:** Uses local execution if not provided

- `PYTHON_SERVICE_URL` - URL for external Python service
  - **Used for:** Python code execution with Pydantic validation
  - **Note:** Optional - platform can execute Python locally if not provided

### 12. **Browser Automation**
- `BROWSERBASE_API_KEY` - Browserbase API key
- `BROWSERBASE_PROJECT_ID` - Browserbase project ID
- `BROWSERBASE_BASE_URL` - Browserbase base URL
  - **Where to get:** https://browserbase.com
  - **Used for:** Cloud browser automation (alternative to local Puppeteer/Playwright)

### 13. **Email OAuth** (For email triggers)
- `GMAIL_CLIENT_ID` - Gmail OAuth client ID
- `GMAIL_CLIENT_SECRET` - Gmail OAuth client secret
  - **Where to get:** https://console.cloud.google.com → APIs & Services → Credentials
  - **Used for:** Gmail email triggers

- `OUTLOOK_CLIENT_ID` - Outlook OAuth client ID
- `OUTLOOK_CLIENT_SECRET` - Outlook OAuth client secret
  - **Where to get:** https://portal.azure.com → Azure Active Directory → App registrations
  - **Used for:** Outlook email triggers

### 14. **Analytics & Monitoring** (Optional)
- `POSTHOG_API_KEY` - PostHog API key
  - **Where to get:** https://app.posthog.com → Project Settings → API Keys
  - **Used for:** Product analytics, user tracking

- `RUDDERSTACK_WRITE_KEY` - RudderStack write key
- `RUDDERSTACK_DATA_PLANE_URL` - RudderStack data plane URL
  - **Where to get:** https://app.rudderstack.com
  - **Used for:** Event forwarding to data warehouses

### 15. **OpenTelemetry** (Optional - for distributed tracing)
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry collector endpoint
  - **Used for:** Distributed tracing, observability
  - **Note:** Set `OTEL_ENABLED=true` to enable

### 16. **StackStorm** (Optional - for self-healing)
- `STACKSTORM_API_URL` - StackStorm API URL
- `STACKSTORM_API_KEY` - StackStorm API key
  - **Used for:** Self-healing workflows
  - **Note:** Set `STACKSTORM_ENABLED=true` to enable

### 17. **Runtime Services** (Optional)
- `BACALHAU_API_KEY` - Bacalhau API key (for distributed compute)
- `BACALHAU_API_URL` - Bacalhau API URL
  - **Used for:** Distributed job execution

- `WASMEDGE_PATH` - WasmEdge binary path (for WebAssembly execution)
  - **Used for:** WebAssembly code execution

---

## 📋 **Quick Checklist**

### Minimum Required (Platform works, but limited features):
- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `CLERK_SECRET_KEY`
- [ ] `CLERK_PUBLISHABLE_KEY`
- [ ] `NANGO_SECRET_KEY` (for OAuth connectors)

### Recommended (Full AI & Automation features):
- [ ] `OPENAI_API_KEY` OR `ANTHROPIC_API_KEY` (at least one)
- [ ] `RESEND_API_KEY`
- [ ] `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Optional (Enhanced features):
- [ ] `PINECONE_API_KEY` (for RAG with Pinecone)
- [ ] `SERPAPI_API_KEY` OR `BRAVE_API_KEY` (for web search in agents)
- [ ] `TWITTER_BEARER_TOKEN` (for Twitter monitoring)
- [ ] `E2B_API_KEY` (for fast code execution)
- [ ] `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` (for Gmail triggers)
- [ ] `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET` (for Outlook triggers)

---

## 🔗 **Quick Links to Get API Keys**

1. **Clerk:** https://dashboard.clerk.com
2. **Nango:** https://nango.dev
3. **OpenAI:** https://platform.openai.com/api-keys
4. **Anthropic:** https://console.anthropic.com/settings/keys
5. **Resend:** https://resend.com/api-keys
6. **Supabase:** https://supabase.com/dashboard
7. **Pinecone:** https://app.pinecone.io
8. **SerpAPI:** https://serpapi.com/dashboard
9. **Brave Search:** https://brave.com/search/api
10. **E2B:** https://e2b.dev
11. **Twitter Developer:** https://developer.twitter.com
12. **PostHog:** https://app.posthog.com

---

## 💡 **Tips**

1. **Start with minimum required keys** - Get the platform running first
2. **Add AI keys next** - Enable AI features (OpenAI or Anthropic)
3. **Add Nango key** - Critical for OAuth connectors (57+ connectors need this)
4. **Add optional keys as needed** - Based on which features you want to use

---

## ⚠️ **Important Notes**

- **Nango is REQUIRED** for OAuth connectors - Without it, connectors like Slack, GitHub, Salesforce, Google Drive, etc. will NOT work
- **At least one AI provider** (OpenAI or Anthropic) is needed for AI features
- **Supabase keys** are needed if you want to use code agents with large code blobs
- **Vector store keys** are only needed if using RAG pipeline with external vector stores (memory-based vector store doesn't need keys)

---

## 🚀 **Getting Started**

1. Set up your `.env` file in the backend directory
2. Add the minimum required keys first
3. Test the platform
4. Add additional keys based on features you want to use

See `README.md` for detailed setup instructions.

