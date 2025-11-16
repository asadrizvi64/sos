# SynthralOS Automation Platform

A comprehensive workflow automation and orchestration platform with AI-powered capabilities, multi-tenant support, and real-time execution monitoring.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **PostgreSQL** database (Supabase recommended)
- **Redis** (for BullMQ and caching)
- **Clerk** account (for authentication)

### Environment Variables

## Custom Code & Code Agents

- `E2B_API_KEY` - E2B API key for ultra-fast code execution (<50ms latency). Get your key at https://e2b.dev
- `PYTHON_SERVICE_URL` - Optional URL for Python service with Pydantic validation support
- `SUPABASE_URL` - Supabase project URL (for code blob storage)
- `SUPABASE_SERVICE_KEY` - Supabase service role key (for code blob storage)

**Backend (.env):**
```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
CLERK_SECRET_KEY=sk_test_...

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...

# Nango OAuth (REQUIRED for OAuth-based integrations - 57 connectors)
# Sign up at https://nango.dev to get your secret key
# Without this, OAuth connectors (Slack, GitHub, Salesforce, etc.) will not work
NANGO_SECRET_KEY=nango_sk_...
NANGO_HOST=https://api.nango.dev

# OpenTelemetry (optional - for distributed tracing with Signoz)
OTEL_ENABLED=true
OTEL_SERVICE_NAME=sos-backend
OTEL_SERVICE_VERSION=1.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
OTEL_EXPORTER_OTLP_HEADERS={}  # Optional: JSON object with headers

# PostHog (optional - for product analytics)
POSTHOG_API_KEY=ph_...
POSTHOG_HOST=https://app.posthog.com

# RudderStack (optional - for event forwarding to data warehouses)
RUDDERSTACK_WRITE_KEY=...
RUDDERSTACK_DATA_PLANE_URL=https://hosted.rudderlabs.com

# CORS
CORS_ORIGIN=http://localhost:3000
PORT=4000
NODE_ENV=development
```

**Frontend (.env):**
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:4000
```

### Installation

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Database Setup

```bash
# Apply database migrations
cd backend
npm run db:push

# Migrate default templates to database
npx tsx scripts/migrate-templates-to-db.ts
```

### Running the Platform

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The platform will be available at:
- **Frontend:** http://localhost:3000 (or 3001 if 3000 is in use)
- **Backend API:** http://localhost:4000
- **API Documentation:** http://localhost:4000/api-docs

---

## 📚 Features

### Core Features
- ✅ **Workflow Builder** - Visual workflow creation and editing
- ✅ **Workflow Execution** - Real-time execution with step-through debugging
- ✅ **Multi-Tenant** - Organization and workspace isolation
- ✅ **Role-Based Access Control** - Granular permissions
- ✅ **Team Management** - Collaborative workflows
- ✅ **API Keys** - Programmatic access
- ✅ **Audit Logging** - Complete activity tracking

### AI & Automation
- ✅ **LangChain Integration** - AI-powered workflows
- ✅ **LangGraph Support** - Stateful multi-actor workflows
- ✅ **RAG (Retrieval-Augmented Generation)** - Document-based AI
- ✅ **Vector Store** - Pinecone, Weaviate, Chroma, PostgreSQL
- ✅ **Email Triggers** - Gmail, Outlook, IMAP support
- ✅ **Webhooks** - External integrations

### Monitoring & Analytics
- ✅ **Performance Monitoring** - Real-time API metrics
- ✅ **Email Trigger Monitoring** - Health checks and alerts
- ✅ **Analytics Dashboard** - Workflow and cost analytics
- ✅ **Execution Monitoring** - Real-time execution tracking

### Developer Experience
- ✅ **Swagger API Docs** - Interactive API documentation
- ✅ **Redis Caching** - Performance optimization
- ✅ **Template Management** - Reusable workflow templates
- ✅ **Version Control** - Workflow versioning

---

## 🏗️ Architecture

### Backend
- **Framework:** Express.js
- **Database:** PostgreSQL (Drizzle ORM)
- **Queue:** BullMQ (Redis)
- **Authentication:** Clerk
- **Real-time:** Socket.IO
- **Caching:** Redis
- **AI:** LangChain, LangGraph

### Frontend
- **Framework:** React + TypeScript
- **Build Tool:** Vite
- **State Management:** React Query
- **UI:** Custom components (Bootstrap-inspired)
- **Authentication:** Clerk React

---

## 📖 API Documentation

Interactive API documentation is available at:
- **Swagger UI:** http://localhost:4000/api-docs

All endpoints require authentication via Clerk JWT token.

---

## 🧪 Testing

### Test API Endpoints

```bash
# Get authentication token from Clerk
TOKEN="your-clerk-jwt-token"

# Test workflow creation
curl -X POST http://localhost:4000/api/v1/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Workflow","definition":{...}}'

# Test performance monitoring
curl http://localhost:4000/api/v1/monitoring/performance/system \
  -H "Authorization: Bearer $TOKEN"

# Test cache statistics
curl http://localhost:4000/api/v1/monitoring/performance/cache \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Database Schema

The platform uses 24 database tables:
- User management (users, organizations, workspaces)
- Workflow management (workflows, workflow_versions, workflow_executions)
- Templates (workflow_templates)
- Access control (roles, permissions, teams)
- Monitoring (audit_logs, email_triggers)
- AI/RAG (vector_indexes, vector_documents)
- And more...

See `backend/drizzle/schema.ts` for complete schema definition.

---

## 🔒 Security

- ✅ **Authentication:** Clerk JWT tokens
- ✅ **Authorization:** Role-based access control
- ✅ **Input Validation:** Zod schemas
- ✅ **SQL Injection Protection:** Drizzle ORM
- ✅ **Credential Encryption:** AES-256-GCM
- ✅ **CORS:** Configured
- ✅ **Security Headers:** Helmet.js

---

## 🚀 Deployment

### Render Deployment

The platform is configured for deployment on Render:

1. **Backend Service:**
   - Build Command: `cd backend && npm install && npm run build`
   - Start Command: `cd backend && npm start`
   - Environment: Node.js

2. **Frontend Service:**
   - Build Command: `cd frontend && npm install && npm run build`
   - Start Command: `cd frontend && npm run preview`
   - Environment: Node.js

3. **Database:**
   - Use Render PostgreSQL or Supabase
   - Set `DATABASE_URL` environment variable

4. **Redis:**
   - Use Render Redis or external Redis service
   - Set `REDIS_URL` environment variable

---

## 📝 Development

### Project Structure

```
SynthralOS/
├── backend/
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Express middleware
│   │   ├── config/          # Configuration
│   │   └── index.ts         # Entry point
│   ├── drizzle/
│   │   ├── schema.ts        # Database schema
│   │   └── migrations/      # Migration files
│   └── scripts/             # Utility scripts
├── frontend/
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── contexts/        # React contexts
│   │   ├── lib/             # Utilities
│   │   └── App.tsx          # Main app
│   └── public/              # Static assets
└── shared/                  # Shared types
```

### Adding New Features

1. **Backend Route:**
   - Create route in `backend/src/routes/`
   - Add authentication middleware
   - Implement database queries
   - Add to `backend/src/index.ts`

2. **Frontend Page:**
   - Create page in `frontend/src/pages/`
   - Add API calls using React Query
   - Add route in `frontend/src/App.tsx`
   - Add navigation in `frontend/src/components/Layout.tsx`

---

## 📈 Performance

### Caching
- **Stats endpoint:** 30 seconds TTL
- **Templates:** 60 seconds TTL
- **Cache hit rate:** Monitored in performance dashboard

### Monitoring
- **Performance metrics:** Real-time tracking
- **System metrics:** Memory, requests/sec, success rate
- **Endpoint metrics:** Response times, error rates

---

## 🐛 Troubleshooting

### Common Issues

**Backend won't start:**
- Check Redis connection (`REDIS_URL`)
- Verify database connection (`DATABASE_URL`)
- Check port availability (default: 4000)

**Frontend can't connect:**
- Verify `VITE_API_URL` matches backend URL
- Check CORS configuration
- Verify Clerk authentication

**Cache not working:**
- Verify Redis is running
- Check `REDIS_URL` environment variable
- Cache gracefully degrades if Redis unavailable

---

## 📄 License

Proprietary - All rights reserved

---

## 🤝 Support

For issues or questions, please contact the development team.

---

**Last Updated:** 2025-11-14  
**Version:** 1.0.0  
**Status:** ✅ Frontend Ready
