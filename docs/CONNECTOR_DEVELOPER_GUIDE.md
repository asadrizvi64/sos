# Connector Developer Guide

**Last Updated:** 2025-01-XX  
**Version:** 1.0.0

---

## Quick Start

This guide will help you create and register a custom connector for the SynthralOS platform.

### Prerequisites

- API access token
- Understanding of REST APIs
- Basic knowledge of JSON Schema
- Your service's API documentation

### 5-Minute Example

Let's create a simple "Hello World" connector:

```bash
# 1. Create manifest
cat > hello_world_connector.json << EOF
{
  "id": "hello_world",
  "name": "Hello World Connector",
  "version": "1.0.0",
  "description": "A simple example connector",
  "category": "custom",
  "auth": {
    "type": "none"
  },
  "actions": [
    {
      "id": "greet",
      "name": "Greet",
      "description": "Returns a greeting message",
      "inputSchema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Name to greet"
          }
        },
        "required": ["name"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "message": {
            "type": "string"
          }
        }
      }
    }
  ]
}
EOF

# 2. Register connector
curl -X POST https://api.synthralos.ai/api/v1/connectors/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @hello_world_connector.json
```

---

## Step-by-Step Guide

### Step 1: Design Your Connector

**Identify:**
- What service/API are you connecting to?
- What actions do you want to expose?
- What authentication method does it use?
- What data formats does it use?

**Example:** Creating a connector for a todo list API

### Step 2: Create the Manifest

```json
{
  "id": "todo_api",
  "name": "Todo API Connector",
  "version": "1.0.0",
  "description": "Manage todos via REST API",
  "category": "productivity",
  "auth": {
    "type": "api_key",
    "description": "API key in Authorization header"
  },
  "actions": [
    {
      "id": "create_todo",
      "name": "Create Todo",
      "description": "Create a new todo item",
      "inputSchema": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Todo title"
          },
          "description": {
            "type": "string",
            "description": "Todo description"
          },
          "priority": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "description": "Todo priority"
          }
        },
        "required": ["title"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Created todo ID"
          },
          "title": {
            "type": "string"
          },
          "createdAt": {
            "type": "string",
            "format": "date-time"
          }
        }
      }
    },
    {
      "id": "list_todos",
      "name": "List Todos",
      "description": "Get all todos",
      "inputSchema": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": ["pending", "completed"],
            "description": "Filter by status"
          },
          "limit": {
            "type": "number",
            "description": "Maximum number of results",
            "default": 10
          }
        }
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "todos": {
            "type": "array",
            "items": {
              "type": "object"
            }
          },
          "count": {
            "type": "number"
          }
        }
      }
    }
  ]
}
```

### Step 3: Implement the Executor

Create an executor function in `backend/src/services/nodeExecutors/integrations.ts`:

```typescript
export async function executeTodoApi(
  context: NodeExecutionContext
): Promise<NodeExecutionResult> {
  const { action, ...input } = context.config;
  const credentials = await getConnectorCredentials(context);
  
  try {
    switch (action) {
      case 'create_todo':
        const response = await fetch('https://api.todo.com/todos', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
          success: true,
          output: data,
        };
        
      case 'list_todos':
        // Implementation for list_todos
        // ...
        
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

### Step 4: Register the Connector

```bash
curl -X POST https://api.synthralos.ai/api/v1/connectors/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @todo_api_manifest.json
```

### Step 5: Test the Connector

```bash
# Connect the connector (store credentials)
curl -X POST https://api.synthralos.ai/api/v1/connectors/todo_api/connect \
  -H "Authorization: Bearer YOUR_TOKEN"

# Execute an action
curl -X POST https://api.synthralos.ai/api/v1/connectors/todo_api/actions/create_todo/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "title": "Test Todo",
      "description": "Testing the connector",
      "priority": "high"
    }
  }'
```

---

## Advanced Topics

### OAuth2 Integration

For OAuth2 connectors, configure Nango:

```json
{
  "auth": {
    "type": "oauth2",
    "scopes": ["read", "write"]
  },
  "oauthProvider": "nango"
}
```

The platform handles:
- OAuth flow initiation
- Token storage
- Token refresh
- Credential encryption

### Webhook Triggers

Add triggers to your manifest:

```json
{
  "triggers": [
    {
      "id": "todo_created",
      "name": "Todo Created",
      "description": "Triggered when a todo is created",
      "outputSchema": {
        "type": "object",
        "properties": {
          "todoId": { "type": "string" },
          "title": { "type": "string" }
        }
      },
      "webhookUrl": "https://api.synthralos.ai/webhooks/todo_api/todo_created"
    }
  ]
}
```

### Versioning

Update your connector:

```bash
curl -X PUT https://api.synthralos.ai/api/v1/connectors/todo_api \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "id": "todo_api",
      "version": "1.1.0",
      // ... updated manifest
    }
  }'
```

---

## Testing Checklist

- [ ] Manifest validates successfully
- [ ] Connector registers without errors
- [ ] Authentication works (OAuth/API key)
- [ ] All actions execute correctly
- [ ] Input validation works
- [ ] Error handling is proper
- [ ] Output matches schema
- [ ] Works in workflow nodes
- [ ] Documentation is complete

---

## Common Patterns

### REST API Connector

```typescript
// Pattern for REST API connectors
async function executeRestApi(context: NodeExecutionContext) {
  const { action, endpoint, method = 'GET', body } = context.config;
  const credentials = await getConnectorCredentials(context);
  
  const response = await fetch(`${credentials.baseUrl}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  return {
    success: response.ok,
    output: await response.json(),
  };
}
```

### Database Connector

```typescript
// Pattern for database connectors
async function executeDatabase(context: NodeExecutionContext) {
  const { action, query, params } = context.config;
  const credentials = await getConnectorCredentials(context);
  const db = await connect(credentials.connectionString);
  
  const result = await db.query(query, params);
  
  return {
    success: true,
    output: { rows: result.rows, count: result.rowCount },
  };
}
```

---

## Resources

- [Full API Documentation](./CONNECTOR_INTERFACES.md)
- [JSON Schema Reference](https://json-schema.org/)
- [Example Connectors](https://github.com/SynthralOS/connectors)
- [Community Forum](https://community.synthralos.ai)

---

**Happy Building! 🚀**

