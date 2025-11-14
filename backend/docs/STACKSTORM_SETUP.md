# StackStorm Setup Guide

This guide explains how to set up and configure StackStorm for integration with the SynthralOS platform.

## Overview

StackStorm is an event-driven automation platform that enables:
- Recovery workflows for failed agent executions
- Retry logic with exponential backoff
- Reroute logic for failed requests
- Scheduled workflows with cron backoffs
- Event-driven automation

## Installation Options

### Option 1: Docker Compose (Recommended for Development)

Create a `docker-compose.stackstorm.yml` file:

```yaml
version: '3.8'

services:
  stackstorm:
    image: stackstorm/stackstorm:latest
    container_name: stackstorm
    ports:
      - "9101:9101"  # API
      - "9100:9100"  # Web UI
    environment:
      - ST2_AUTH_USERNAME=st2admin
      - ST2_AUTH_PASSWORD=Ch@ngeMe
      - ST2_AUTH_API_KEY=
    volumes:
      - stackstorm-packs:/opt/stackstorm/packs
      - stackstorm-configs:/etc/st2
    depends_on:
      - mongodb
      - rabbitmq
      - postgres
      - redis

  mongodb:
    image: mongo:4.4
    container_name: stackstorm-mongodb
    volumes:
      - mongodb-data:/data/db

  rabbitmq:
    image: rabbitmq:3.9
    container_name: stackstorm-rabbitmq
    environment:
      - RABBITMQ_DEFAULT_USER=stackstorm
      - RABBITMQ_DEFAULT_PASS=Ch@ngeMe
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

  postgres:
    image: postgres:13
    container_name: stackstorm-postgres
    environment:
      - POSTGRES_USER=stackstorm
      - POSTGRES_PASSWORD=Ch@ngeMe
      - POSTGRES_DB=stackstorm
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    container_name: stackstorm-redis
    volumes:
      - redis-data:/data

volumes:
  stackstorm-packs:
  stackstorm-configs:
  mongodb-data:
  rabbitmq-data:
  postgres-data:
  redis-data:
```

Start StackStorm:
```bash
docker-compose -f docker-compose.stackstorm.yml up -d
```

### Option 2: Kubernetes (Production)

Deploy StackStorm using the official Helm chart:
```bash
helm repo add stackstorm https://helm.stackstorm.com
helm install stackstorm stackstorm/stackstorm
```

### Option 3: Manual Installation

Follow the official StackStorm installation guide:
https://docs.stackstorm.com/install/index.html

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```bash
# StackStorm Configuration
STACKSTORM_ENABLED=true
STACKSTORM_API_URL=http://localhost:9101/v1
STACKSTORM_AUTH_URL=http://localhost:9101/auth/v1

# Authentication (choose one method)
# Option 1: API Key (recommended for production)
STACKSTORM_API_KEY=your_api_key_here

# Option 2: Username/Password (for development)
STACKSTORM_USERNAME=st2admin
STACKSTORM_PASSWORD=Ch@ngeMe

# Optional: Connection settings
STACKSTORM_TIMEOUT=30000
STACKSTORM_RETRY_ATTEMPTS=3
STACKSTORM_RETRY_DELAY=1000
```

### Generate API Key

1. Access StackStorm Web UI at `http://localhost:9100`
2. Login with your credentials
3. Navigate to API Keys section
4. Generate a new API key
5. Copy the key to `STACKSTORM_API_KEY` environment variable

Or use the CLI:
```bash
st2 apikey create -k -m '{"used_by": "synthralos"}'
```

## Verification

Test the StackStorm connection:

```bash
# Check if StackStorm is available
curl http://localhost:9101/v1/actions

# Test authentication
curl -H "X-Auth-Token: YOUR_API_KEY" http://localhost:9101/v1/actions
```

## Integration with SynthralOS

The StackStorm service is automatically initialized when the backend starts. To verify:

1. Check backend logs for StackStorm initialization
2. The service will attempt to connect on startup
3. Use `stackstormService.isAvailable()` to check connection status

## Next Steps

After StackStorm is configured:

1. **Create Recovery Workflows** (Phase 4, TODO #3)
   - Define workflows for agent failure recovery
   - Implement retry logic with backoff

2. **Integrate with Self-Healing Service** (Phase 4, TODO #8)
   - Connect StackStorm workflows to self-healing service
   - Enable automated recovery

3. **Set up Event-Driven Automation** (Phase 4, TODO #9-12)
   - Configure event triggers
   - Set up event pipelines

## Troubleshooting

### Connection Issues

1. **Check StackStorm is running:**
   ```bash
   docker ps | grep stackstorm
   ```

2. **Check API accessibility:**
   ```bash
   curl http://localhost:9101/v1/actions
   ```

3. **Verify authentication:**
   - Check API key is valid
   - Verify username/password if using basic auth

### Common Issues

- **Port conflicts:** Ensure ports 9100 and 9101 are available
- **Authentication failures:** Verify credentials or API key
- **Timeout errors:** Increase `STACKSTORM_TIMEOUT` if needed

## Resources

- [StackStorm Documentation](https://docs.stackstorm.com/)
- [StackStorm API Reference](https://docs.stackstorm.com/reference/api.html)
- [StackStorm Workflows](https://docs.stackstorm.com/orquesta/index.html)

