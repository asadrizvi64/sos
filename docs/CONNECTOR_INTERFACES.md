# Connector Interfaces Documentation

**Last Updated:** 2025-01-XX  
**Version:** 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [App Connector Interface (ACI)](#app-connector-interface-aci)
3. [Internal Connector Interface (ICI)](#internal-connector-interface-ici)
4. [App-Adder System](#app-adder-system)
5. [Connector Manifest Specification](#connector-manifest-specification)
6. [Authentication Methods](#authentication-methods)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)
9. [API Reference](#api-reference)

---

## Overview

The SynthralOS platform provides three main interfaces for connector management:

1. **App Connector Interface (ACI)** - External API for registering and managing connectors
2. **Internal Connector Interface (ICI)** - Internal system for connector lifecycle management
3. **App-Adder** - Registration mechanism for adding new connectors

These interfaces work together to enable:
- Dynamic connector registration
- OAuth and API key authentication
- Encrypted credential storage
- Action-based execution
- Versioning support
- Marketplace integration

---

## App Connector Interface (ACI)

The **App Connector Interface (ACI)** is the external-facing API that allows developers and applications to register, update, and manage connectors in the platform.

### Purpose

- Register custom connectors
- Update existing connectors (versioning)
- Unregister custom connectors
- Execute connector actions
- Manage connector credentials

### API Endpoints

#### 1. Register Connector

**Endpoint:** `POST /api/v1/connectors/register`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "manifest": {
    "id": "my_custom_connector",
    "name": "My Custom Connector",
    "version": "1.0.0",
    "description": "Description of the connector",
    "category": "custom",
    "auth": {
      "type": "api_key",
      "description": "API key authentication"
    },
    "actions": [
      {
        "id": "custom_action",
        "name": "Custom Action",
        "description": "Performs a custom action",
        "inputSchema": {
          "type": "object",
          "properties": {
            "param1": { "type": "string" },
            "param2": { "type": "number" }
          },
          "required": ["param1"]
        },
        "outputSchema": {
          "type": "object",
          "properties": {
            "result": { "type": "string" }
          }
        }
      }
    ]
  },
  "version": "1.0.0"
}
```

**Response:**
```json
{
  "message": "Connector registered successfully",
  "connectorId": "my_custom_connector"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid manifest structure
- `401 Unauthorized` - Missing or invalid authentication
- `500 Internal Server Error` - Registration failed

#### 2. Update Connector

**Endpoint:** `PUT /api/v1/connectors/:id`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "manifest": {
    "id": "my_custom_connector",
    "version": "1.1.0",
    // ... updated manifest fields
  }
}
```

**Response:**
```json
{
  "message": "Connector updated successfully",
  "connectorId": "my_custom_connector",
  "version": "1.1.0"
}
```

#### 3. Unregister Connector

**Endpoint:** `DELETE /api/v1/connectors/:id`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "message": "Connector unregistered successfully",
  "connectorId": "my_custom_connector"
}
```

**Note:** Only custom connectors can be unregistered. Built-in connectors cannot be removed.

#### 4. Execute Connector Action

**Endpoint:** `POST /api/v1/connectors/:id/actions/:actionId/execute`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "input": {
    "param1": "value1",
    "param2": 123
  }
}
```

**Response:**
```json
{
  "success": true,
  "output": {
    "result": "action completed"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "Action execution failed",
    "code": "EXECUTION_ERROR"
  }
}
```

#### 5. Connect Connector

**Endpoint:** `POST /api/v1/connectors/:id/connect`

**Authentication:** Required (Bearer token)

**Response (OAuth):**
```json
{
  "authUrl": "https://oauth-provider.com/authorize?..."
}
```

**Response (Manual Setup):**
```json
{
  "requiresManualSetup": true,
  "authType": "api_key",
  "message": "Please configure credentials manually"
}
```

#### 6. Disconnect Connector

**Endpoint:** `POST /api/v1/connectors/:id/disconnect`

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "message": "Disconnected successfully"
}
```

---

## Internal Connector Interface (ICI)

The **Internal Connector Interface (ICI)** is the internal system that manages connector lifecycle, execution routing, and integration with the platform's workflow engine.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Connector Registry (ICI)                    │
├─────────────────────────────────────────────────────────┤
│  • Built-in Connectors                                  │
│  • Custom Connectors                                    │
│  • Connector Metadata                                   │
│  • Execution Routing                                    │
└─────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌──────────┐         ┌──────────┐         ┌──────────┐
    │  Slack   │         │ Airtable │         │  Custom  │
    │ Executor │         │ Executor │         │ Executor │
    └──────────┘         └──────────┘         └──────────┘
```

### Key Components

#### 1. ConnectorRegistry Class

**Location:** `backend/src/services/connectors/registry.ts`

**Responsibilities:**
- Register and manage connectors
- Route execution to appropriate handlers
- Load connectors from database
- Handle versioning
- Validate connector manifests

**Key Methods:**

```typescript
class ConnectorRegistry {
  // Register a built-in connector
  register(manifest: ConnectorManifest): void;
  
  // Register a custom connector
  registerCustom(manifest: ConnectorManifest, version?: string): void;
  
  // Update a connector
  updateConnector(connectorId: string, manifest: ConnectorManifest): boolean;
  
  // Unregister a custom connector
  unregisterCustom(connectorId: string): boolean;
  
  // Get a connector by ID
  get(id: string): ConnectorManifest | undefined;
  
  // List all connectors
  list(category?: string): ConnectorManifest[];
  
  // Execute a connector action
  execute(connectorId: string, options: ConnectorExecuteOptions): Promise<ConnectorExecuteResult>;
  
  // Load connectors from database
  loadFromDatabase(): Promise<void>;
}
```

#### 2. Execution Flow

1. **Action Request** → Connector Registry receives execution request
2. **Connector Lookup** → Registry finds connector by ID
3. **Action Validation** → Validates action exists in connector
4. **Routing** → Routes to appropriate executor based on connector ID
5. **Execution** → Executor performs the action
6. **Response** → Returns result or error

#### 3. Built-in Connectors

The ICI includes 20+ built-in connectors:

**Communication:**
- Slack
- Microsoft Teams
- Discord
- Twilio
- SendGrid

**CRM:**
- Salesforce
- HubSpot
- Pipedrive
- Zoho CRM

**Productivity:**
- Trello
- Asana
- Monday.com
- Jira

**E-commerce:**
- Shopify
- Stripe
- WooCommerce
- PayPal

**Database:**
- PostgreSQL
- MySQL
- MongoDB
- Redis
- Supabase

**Data:**
- Airtable
- Google Sheets

#### 4. Custom Connector Support

Custom connectors can be:
- Registered via ACI
- Stored in database
- Loaded dynamically
- Versioned independently

---

## App-Adder System

The **App-Adder** is the registration mechanism that allows developers to add new connectors to the platform without modifying core code.

### Registration Process

```
┌─────────────────┐
│  Developer      │
│  Submits        │
│  Manifest       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ACI Validates  │
│  Manifest       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ICI Registers  │
│  Connector      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Available in   │
│  Marketplace    │
└─────────────────┘
```

### Manifest Requirements

A valid connector manifest must include:

1. **Required Fields:**
   - `id` - Unique connector identifier
   - `name` - Human-readable name
   - `category` - Connector category
   - `actions` - Array of available actions

2. **Optional Fields:**
   - `version` - Connector version
   - `description` - Connector description
   - `auth` - Authentication configuration
   - `triggers` - Webhook triggers
   - `icon` - Connector icon URL
   - `documentationUrl` - Documentation link

### Validation Rules

- `id` must be unique and URL-safe
- `name` must be non-empty
- `category` must be one of: `communication`, `data`, `productivity`, `ai`, `custom`
- `actions` array must contain at least one action
- Each action must have `id`, `name`, `description`, `inputSchema`, and `outputSchema`

---

## Connector Manifest Specification

### Full Manifest Schema

```typescript
interface ConnectorManifest {
  // Required
  id: string;                    // Unique identifier (e.g., "my_connector")
  name: string;                  // Display name (e.g., "My Connector")
  version: string;               // Semantic version (e.g., "1.0.0")
  description: string;           // Connector description
  category: 'communication' | 'data' | 'productivity' | 'ai' | 'custom';
  actions: ConnectorAction[];    // Available actions
  
  // Optional
  auth?: {
    type: 'oauth2' | 'api_key' | 'basic' | 'none';
    scopes?: string[];
    authUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    description?: string;
  };
  oauthProvider?: 'nango' | 'custom' | 'panora' | 'composio';
  triggers?: ConnectorTrigger[];
  icon?: string;
  documentationUrl?: string;
}

interface ConnectorAction {
  id: string;                    // Action identifier
  name: string;                  // Display name
  description: string;           // Action description
  inputSchema: JSONSchema;       // Input validation schema
  outputSchema: JSONSchema;      // Output schema
}

interface ConnectorTrigger {
  id: string;
  name: string;
  description: string;
  outputSchema: JSONSchema;
  webhookUrl?: string;
}
```

### Example Manifest

```json
{
  "id": "custom_api",
  "name": "Custom API Connector",
  "version": "1.0.0",
  "description": "Connects to a custom REST API",
  "category": "custom",
  "auth": {
    "type": "api_key",
    "description": "API key in X-API-Key header"
  },
  "actions": [
    {
      "id": "get_data",
      "name": "Get Data",
      "description": "Retrieve data from the API",
      "inputSchema": {
        "type": "object",
        "properties": {
          "endpoint": {
            "type": "string",
            "description": "API endpoint path"
          },
          "params": {
            "type": "object",
            "description": "Query parameters"
          }
        },
        "required": ["endpoint"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array"
          },
          "status": {
            "type": "number"
          }
        }
      }
    },
    {
      "id": "post_data",
      "name": "Post Data",
      "description": "Send data to the API",
      "inputSchema": {
        "type": "object",
        "properties": {
          "endpoint": {
            "type": "string"
          },
          "body": {
            "type": "object"
          }
        },
        "required": ["endpoint", "body"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "status": {
            "type": "number"
          }
        }
      }
    }
  ],
  "icon": "https://example.com/icon.png",
  "documentationUrl": "https://docs.example.com"
}
```

---

## Authentication Methods

### 1. OAuth2 (via Nango)

**Supported Providers:**
- Nango (primary)
- Custom OAuth providers
- Panora
- Composio

**Configuration:**
```json
{
  "auth": {
    "type": "oauth2",
    "scopes": ["read", "write"]
  },
  "oauthProvider": "nango"
}
```

**Flow:**
1. User initiates connection
2. Redirected to OAuth provider
3. User authorizes
4. Callback stores encrypted credentials
5. Tokens automatically refreshed

### 2. API Key

**Configuration:**
```json
{
  "auth": {
    "type": "api_key",
    "description": "API key authentication"
  }
}
```

**Storage:**
- Credentials encrypted at rest
- Stored per-user in database
- Retrieved and decrypted on execution

### 3. Connection String

**Configuration:**
```json
{
  "auth": {
    "type": "connection_string",
    "description": "Database connection string"
  }
}
```

**Use Cases:**
- Database connectors (PostgreSQL, MySQL, MongoDB)
- Redis connections
- Other connection-string based services

### 4. Basic Authentication

**Configuration:**
```json
{
  "auth": {
    "type": "basic",
    "description": "Username and password"
  }
}
```

### 5. No Authentication

**Configuration:**
```json
{
  "auth": {
    "type": "none"
  }
}
```

**Use Cases:**
- Public APIs
- Internal services
- Testing connectors

---

## Usage Examples

### Example 1: Register a Custom Connector

```bash
curl -X POST https://api.synthralos.ai/api/v1/connectors/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "id": "weather_api",
      "name": "Weather API",
      "version": "1.0.0",
      "description": "Get weather data",
      "category": "data",
      "auth": {
        "type": "api_key"
      },
      "actions": [
        {
          "id": "get_weather",
          "name": "Get Weather",
          "description": "Get current weather",
          "inputSchema": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          },
          "outputSchema": {
            "type": "object",
            "properties": {
              "temperature": { "type": "number" },
              "condition": { "type": "string" }
            }
          }
        }
      ]
    }
  }'
```

### Example 2: Connect a Connector (OAuth)

```bash
# Step 1: Initiate connection
curl -X POST https://api.synthralos.ai/api/v1/connectors/slack/connect \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response:
# {
#   "authUrl": "https://nango.com/oauth/authorize?..."
# }

# Step 2: User authorizes in browser
# Step 3: OAuth callback stores credentials automatically
```

### Example 3: Execute a Connector Action

```bash
curl -X POST https://api.synthralos.ai/api/v1/connectors/slack/actions/send_message/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "channel": "#general",
      "text": "Hello from SynthralOS!"
    }
  }'
```

### Example 4: Update Connector Version

```bash
curl -X PUT https://api.synthralos.ai/api/v1/connectors/weather_api \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {
      "id": "weather_api",
      "version": "1.1.0",
      "name": "Weather API",
      "description": "Get weather data with extended features",
      "category": "data",
      "actions": [
        // ... updated actions
      ]
    }
  }'
```

---

## Best Practices

### 1. Connector ID Naming

- Use lowercase with underscores: `my_connector`
- Be descriptive: `salesforce_crm` not `sf`
- Avoid special characters
- Keep it concise but clear

### 2. Versioning

- Follow semantic versioning (MAJOR.MINOR.PATCH)
- Increment version when:
  - **MAJOR**: Breaking changes to API or schema
  - **MINOR**: New actions or features (backward compatible)
  - **PATCH**: Bug fixes or minor updates

### 3. Schema Design

- Use JSON Schema for validation
- Provide clear descriptions
- Mark required fields explicitly
- Include examples in descriptions

### 4. Error Handling

- Return meaningful error messages
- Use consistent error codes
- Include context in error responses
- Handle authentication failures gracefully

### 5. Security

- Never expose credentials in logs
- Encrypt all sensitive data
- Validate all inputs
- Use HTTPS for all API calls
- Implement rate limiting

### 6. Documentation

- Provide clear action descriptions
- Include example requests/responses
- Document authentication requirements
- Link to external documentation

---

## API Reference

### Complete Endpoint List

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/connectors` | List all connectors | Yes |
| GET | `/api/v1/connectors/:id` | Get connector details | Yes |
| POST | `/api/v1/connectors/register` | Register custom connector | Yes |
| PUT | `/api/v1/connectors/:id` | Update connector | Yes |
| DELETE | `/api/v1/connectors/:id` | Unregister connector | Yes |
| POST | `/api/v1/connectors/:id/connect` | Connect connector | Yes |
| POST | `/api/v1/connectors/:id/disconnect` | Disconnect connector | Yes |
| POST | `/api/v1/connectors/:id/actions/:actionId/execute` | Execute action | Yes |
| GET | `/api/v1/connectors/credentials` | List credentials | Yes |
| GET | `/api/v1/connectors/connections` | List connections | Yes |
| POST | `/api/v1/connectors/credentials` | Store credentials | Yes |
| DELETE | `/api/v1/connectors/credentials/:id` | Revoke credentials | Yes |

### Error Codes

| Code | Description |
|------|-------------|
| `CONNECTOR_NOT_FOUND` | Connector does not exist |
| `ACTION_NOT_FOUND` | Action does not exist in connector |
| `NO_EXECUTOR` | No executor available for connector |
| `EXECUTION_ERROR` | Action execution failed |
| `AUTH_REQUIRED` | Authentication required |
| `INVALID_MANIFEST` | Manifest validation failed |
| `VERSION_EXISTS` | Connector version already exists |

---

## Integration with Workflows

Connectors can be used in workflows as integration nodes:

```json
{
  "type": "integration.slack",
  "config": {
    "action": "send_message",
    "channel": "#general",
    "text": "{{workflow.output.message}}"
  }
}
```

The workflow engine automatically:
1. Retrieves connector credentials
2. Validates input against schema
3. Executes the action
4. Passes output to next node

---

## Troubleshooting

### Common Issues

**1. Connector not found**
- Verify connector ID is correct
- Check if connector is registered
- Ensure connector is loaded from database

**2. Action execution fails**
- Verify credentials are stored
- Check input matches schema
- Review connector executor implementation

**3. OAuth flow fails**
- Verify OAuth provider configuration
- Check redirect URLs
- Ensure scopes are correct

**4. Credentials not decrypting**
- Verify encryption key is set
- Check credential format
- Review encryption/decryption logic

---

## Support

For questions or issues:
- Documentation: [docs.synthralos.ai](https://docs.synthralos.ai)
- Support: support@synthralos.ai
- GitHub: [github.com/SynthralOS](https://github.com/SynthralOS)

---

**Last Updated:** 2025-01-XX  
**Version:** 1.0.0

