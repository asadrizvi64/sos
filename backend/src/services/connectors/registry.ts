import { ConnectorManifest, ConnectorExecuteOptions, ConnectorExecuteResult } from './types';
import { executeSlack } from '../nodeExecutors/slack';
import { executeAirtable } from '../nodeExecutors/integrations';
import { executeGoogleSheets } from '../nodeExecutors/integrations';
import { NodeExecutionContext, NodeExecutionResult } from '@sos/shared';

/**
 * Connector Registry
 * 
 * Manages all available connectors and routes execution to appropriate handlers
 * Supports both built-in connectors and dynamically loaded connectors from database
 */
export class ConnectorRegistry {
  private connectors: Map<string, ConnectorManifest> = new Map();
  private customConnectors: Map<string, ConnectorManifest> = new Map();
  private loadedFromDatabase: boolean = false;

  constructor() {
    this.registerBuiltInConnectors();
  }

  /**
   * Load connectors from database (optional)
   * This allows for custom connectors to be added dynamically
   */
  async loadFromDatabase(): Promise<void> {
    if (this.loadedFromDatabase) {
      return; // Already loaded
    }

    try {
      // Note: We would need a connectors table in the database for this
      // For now, this is a placeholder for future implementation
      // const { db } = await import('../../config/database');
      // const customConnectors = await db.select().from(connectors);
      // customConnectors.forEach(conn => {
      //   this.registerCustom(conn.manifest);
      // });
      this.loadedFromDatabase = true;
    } catch (error) {
      console.warn('[ConnectorRegistry] Failed to load connectors from database:', error);
      // Don't throw - built-in connectors should still work
    }
  }

  /**
   * Register a connector manifest (built-in)
   */
  register(manifest: ConnectorManifest): void {
    this.connectors.set(manifest.id, manifest);
  }

  /**
   * Register a custom connector (from database or user-defined)
   */
  registerCustom(manifest: ConnectorManifest, version?: string): void {
    // Add version to manifest if provided
    const manifestWithVersion = version ? { ...manifest, version } : manifest;
    this.customConnectors.set(manifest.id, manifestWithVersion);
    // Also add to main registry
    this.connectors.set(manifest.id, manifestWithVersion);
  }

  /**
   * Update a connector (versioning support)
   */
  updateConnector(connectorId: string, manifest: ConnectorManifest): boolean {
    if (!this.connectors.has(connectorId)) {
      return false;
    }

    const existing = this.connectors.get(connectorId);
    if (existing && existing.version === manifest.version) {
      console.warn(`[ConnectorRegistry] Connector ${connectorId} already at version ${manifest.version}`);
      return false;
    }

    this.connectors.set(connectorId, manifest);
    if (this.customConnectors.has(connectorId)) {
      this.customConnectors.set(connectorId, manifest);
    }

    return true;
  }

  /**
   * Remove a custom connector
   */
  unregisterCustom(connectorId: string): boolean {
    if (this.customConnectors.has(connectorId)) {
      this.customConnectors.delete(connectorId);
      this.connectors.delete(connectorId);
      return true;
    }
    return false;
  }

  /**
   * Get connector version
   */
  getVersion(connectorId: string): string | undefined {
    const connector = this.connectors.get(connectorId);
    return connector?.version;
  }

  /**
   * Check if connector is custom (not built-in)
   */
  isCustom(connectorId: string): boolean {
    return this.customConnectors.has(connectorId);
  }

  /**
   * Get a connector by ID
   */
  get(id: string): ConnectorManifest | undefined {
    return this.connectors.get(id);
  }

  /**
   * List all connectors, optionally filtered by category
   * Includes both built-in and custom connectors
   */
  list(category?: string): ConnectorManifest[] {
    // Ensure database connectors are loaded
    if (!this.loadedFromDatabase) {
      // Load asynchronously (don't await to avoid blocking)
      this.loadFromDatabase().catch(() => {
        // Ignore errors - built-in connectors still work
      });
    }

    const all = Array.from(this.connectors.values());
    if (category) {
      return all.filter((c) => c.category === category);
    }
    return all;
  }

  /**
   * Execute a connector action
   */
  async execute(
    connectorId: string,
    options: ConnectorExecuteOptions
  ): Promise<ConnectorExecuteResult> {
    const connector = this.get(connectorId);
    if (!connector) {
      return {
        success: false,
        error: {
          message: `Connector ${connectorId} not found`,
          code: 'CONNECTOR_NOT_FOUND',
        },
      };
    }

    const action = connector.actions.find((a) => a.id === options.actionId);
    if (!action) {
      return {
        success: false,
        error: {
          message: `Action ${options.actionId} not found in connector ${connectorId}`,
          code: 'ACTION_NOT_FOUND',
        },
      };
    }

    // Route to appropriate executor based on connector ID
    try {
      const context: NodeExecutionContext = {
        nodeId: `connector-${connectorId}-${options.actionId}`,
        workflowId: 'connector-execution',
        executionId: 'connector-execution',
        input: options.input,
        previousOutputs: {},
        config: {
          type: `integration.${connectorId}`,
          action: options.actionId,
          ...options.input,
        },
      };

      let result: NodeExecutionResult;

      // Route to specific connector executor
      switch (connectorId) {
        case 'slack':
          result = await executeSlack(context);
          break;
        case 'airtable':
          result = await executeAirtable(context);
          break;
        case 'google_sheets':
          result = await executeGoogleSheets(context);
          break;
        default:
          return {
            success: false,
            error: {
              message: `No executor found for connector ${connectorId}`,
              code: 'NO_EXECUTOR',
            },
          };
      }

      return {
        success: result.success,
        output: result.output,
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.message || 'Unknown error',
          code: 'EXECUTION_ERROR',
        },
      };
    }
  }

  /**
   * Register built-in connectors
   */
  private registerBuiltInConnectors(): void {
    // Slack connector (Nango)
    this.register({
      id: 'slack',
      name: 'Slack',
      version: '1.0.0',
      description: 'Send messages and interact with Slack',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['chat:write', 'channels:read'],
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message to a Slack channel',
          inputSchema: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'Channel ID or name' },
              text: { type: 'string', description: 'Message text' },
            },
            required: ['channel', 'text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              ts: { type: 'string', description: 'Message timestamp' },
            },
          },
        },
      ],
    });

    // Airtable connector
    this.register({
      id: 'airtable',
      name: 'Airtable',
      version: '1.0.0',
      description: 'Read and write data to Airtable bases',
      category: 'data',
      auth: {
        type: 'api_key',
      },
      actions: [
        {
          id: 'list_records',
          name: 'List Records',
          description: 'List records from an Airtable table',
          inputSchema: {
            type: 'object',
            properties: {
              baseId: { type: 'string' },
              tableName: { type: 'string' },
            },
            required: ['baseId', 'tableName'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              records: { type: 'array' },
            },
          },
        },
        {
          id: 'create_record',
          name: 'Create Record',
          description: 'Create a new record in Airtable',
          inputSchema: {
            type: 'object',
            properties: {
              baseId: { type: 'string' },
              tableName: { type: 'string' },
              fields: { type: 'object' },
            },
            required: ['baseId', 'tableName', 'fields'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Google Sheets connector (Nango)
    this.register({
      id: 'google_sheets',
      name: 'Google Sheets',
      version: '1.0.0',
      description: 'Read and write data to Google Sheets',
      category: 'data',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      },
      actions: [
        {
          id: 'read_range',
          name: 'Read Range',
          description: 'Read data from a range in a Google Sheet',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: { type: 'string' },
              range: { type: 'string' },
            },
            required: ['spreadsheetId', 'range'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              values: { type: 'array' },
            },
          },
        },
        {
          id: 'write_range',
          name: 'Write Range',
          description: 'Write data to a range in a Google Sheet',
          inputSchema: {
            type: 'object',
            properties: {
              spreadsheetId: { type: 'string' },
              range: { type: 'string' },
              values: { type: 'array' },
            },
            required: ['spreadsheetId', 'range', 'values'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              updatedCells: { type: 'number' },
            },
          },
        },
      ],
    });

    // Add Nango-supported connectors
    this.registerNangoConnectors();
  }

  /**
   * Register Nango-supported connectors
   */
  private registerNangoConnectors(): void {
    // Salesforce (CRM)
    this.register({
      id: 'salesforce',
      name: 'Salesforce',
      version: '1.0.0',
      description: 'Connect to Salesforce CRM',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['api', 'refresh_token'],
      },
      actions: [
        {
          id: 'query',
          name: 'Query Records',
          description: 'Execute SOQL query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              records: { type: 'array' },
            },
          },
        },
        {
          id: 'create_record',
          name: 'Create Record',
          description: 'Create a new record in Salesforce',
          inputSchema: {
            type: 'object',
            properties: {
              objectType: { type: 'string' },
              fields: { type: 'object' },
            },
            required: ['objectType', 'fields'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // HubSpot (CRM)
    this.register({
      id: 'hubspot',
      name: 'HubSpot',
      version: '1.0.0',
      description: 'Connect to HubSpot CRM',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['contacts', 'content'],
      },
      actions: [
        {
          id: 'create_contact',
          name: 'Create Contact',
          description: 'Create a new contact in HubSpot',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_contact',
          name: 'Get Contact',
          description: 'Get a contact by ID or email',
          inputSchema: {
            type: 'object',
            properties: {
              contactId: { type: 'string' },
              email: { type: 'string' },
            },
            required: [],
          },
          outputSchema: {
            type: 'object',
            properties: {
              contact: { type: 'object' },
            },
          },
        },
      ],
    });

    // Pipedrive (CRM)
    this.register({
      id: 'pipedrive',
      name: 'Pipedrive',
      version: '1.0.0',
      description: 'Connect to Pipedrive CRM',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['api'],
      },
      actions: [
        {
          id: 'create_deal',
          name: 'Create Deal',
          description: 'Create a new deal in Pipedrive',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              value: { type: 'number' },
              currency: { type: 'string' },
              personId: { type: 'number' },
              orgId: { type: 'number' },
            },
            required: ['title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_deals',
          name: 'Get Deals',
          description: 'Get deals from Pipedrive',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              start: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              deals: { type: 'array' },
            },
          },
        },
      ],
    });

    // Zoho CRM
    this.register({
      id: 'zoho_crm',
      name: 'Zoho CRM',
      version: '1.0.0',
      description: 'Connect to Zoho CRM',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.ALL'],
      },
      actions: [
        {
          id: 'create_lead',
          name: 'Create Lead',
          description: 'Create a new lead in Zoho CRM',
          inputSchema: {
            type: 'object',
            properties: {
              Last_Name: { type: 'string' },
              First_Name: { type: 'string' },
              Email: { type: 'string' },
              Company: { type: 'string' },
              Phone: { type: 'string' },
            },
            required: ['Last_Name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_leads',
          name: 'Get Leads',
          description: 'Get leads from Zoho CRM',
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              per_page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              leads: { type: 'array' },
            },
          },
        },
      ],
    });

    // Microsoft Teams (Communication)
    this.register({
      id: 'microsoft_teams',
      name: 'Microsoft Teams',
      version: '1.0.0',
      description: 'Send messages and interact with Microsoft Teams',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://graph.microsoft.com/ChannelMessage.Send'],
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message to a Teams channel',
          inputSchema: {
            type: 'object',
            properties: {
              teamId: { type: 'string' },
              channelId: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['teamId', 'channelId', 'message'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Discord (Communication)
    this.register({
      id: 'discord',
      name: 'Discord',
      version: '1.0.0',
      description: 'Send messages and interact with Discord',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['bot', 'messages.read', 'messages.write'],
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message to a Discord channel',
          inputSchema: {
            type: 'object',
            properties: {
              channelId: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['channelId', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Twilio (Communication)
    this.register({
      id: 'twilio',
      name: 'Twilio',
      version: '1.0.0',
      description: 'Send SMS and make phone calls via Twilio',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['api'],
      },
      actions: [
        {
          id: 'send_sms',
          name: 'Send SMS',
          description: 'Send an SMS message via Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Phone number to send to (E.164 format)' },
              from: { type: 'string', description: 'Twilio phone number to send from' },
              body: { type: 'string', description: 'Message body' },
            },
            required: ['to', 'from', 'body'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              sid: { type: 'string', description: 'Message SID' },
              status: { type: 'string' },
            },
          },
        },
        {
          id: 'make_call',
          name: 'Make Call',
          description: 'Make a phone call via Twilio',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Phone number to call (E.164 format)' },
              from: { type: 'string', description: 'Twilio phone number to call from' },
              url: { type: 'string', description: 'TwiML URL for call instructions' },
            },
            required: ['to', 'from', 'url'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              sid: { type: 'string', description: 'Call SID' },
              status: { type: 'string' },
            },
          },
        },
      ],
    });

    // SendGrid (Communication)
    this.register({
      id: 'sendgrid',
      name: 'SendGrid',
      version: '1.0.0',
      description: 'Send emails via SendGrid',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['mail.send'],
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via SendGrid',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              from: { type: 'string', description: 'Sender email address' },
              subject: { type: 'string', description: 'Email subject' },
              text: { type: 'string', description: 'Plain text email body' },
              html: { type: 'string', description: 'HTML email body' },
              cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
              bcc: { type: 'array', items: { type: 'string' }, description: 'BCC recipients' },
            },
            required: ['to', 'from', 'subject'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              statusCode: { type: 'number' },
            },
          },
        },
        {
          id: 'send_template_email',
          name: 'Send Template Email',
          description: 'Send an email using a SendGrid template',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              templateId: { type: 'string' },
              dynamicTemplateData: { type: 'object', description: 'Template variables' },
            },
            required: ['to', 'from', 'templateId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              statusCode: { type: 'number' },
            },
          },
        },
      ],
    });

    // Trello (Productivity)
    this.register({
      id: 'trello',
      name: 'Trello',
      version: '1.0.0',
      description: 'Manage Trello boards and cards',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_card',
          name: 'Create Card',
          description: 'Create a new card on a Trello board',
          inputSchema: {
            type: 'object',
            properties: {
              boardId: { type: 'string' },
              listId: { type: 'string' },
              name: { type: 'string' },
              desc: { type: 'string' },
            },
            required: ['boardId', 'listId', 'name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_cards',
          name: 'Get Cards',
          description: 'Get cards from a Trello board',
          inputSchema: {
            type: 'object',
            properties: {
              boardId: { type: 'string' },
              listId: { type: 'string' },
            },
            required: ['boardId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              cards: { type: 'array' },
            },
          },
        },
      ],
    });

    // Asana (Productivity)
    this.register({
      id: 'asana',
      name: 'Asana',
      version: '1.0.0',
      description: 'Manage Asana projects and tasks',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['default'],
      },
      actions: [
        {
          id: 'create_task',
          name: 'Create Task',
          description: 'Create a new task in Asana',
          inputSchema: {
            type: 'object',
            properties: {
              workspace: { type: 'string' },
              name: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['workspace', 'name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_tasks',
          name: 'Get Tasks',
          description: 'Get tasks from an Asana project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['projectId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              tasks: { type: 'array' },
            },
          },
        },
      ],
    });

    // Monday.com (Productivity)
    this.register({
      id: 'monday',
      name: 'Monday.com',
      version: '1.0.0',
      description: 'Manage Monday.com boards and items',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['api'],
      },
      actions: [
        {
          id: 'create_item',
          name: 'Create Item',
          description: 'Create a new item on a Monday.com board',
          inputSchema: {
            type: 'object',
            properties: {
              boardId: { type: 'string' },
              itemName: { type: 'string' },
              columnValues: { type: 'object' },
            },
            required: ['boardId', 'itemName'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_items',
          name: 'Get Items',
          description: 'Get items from a Monday.com board',
          inputSchema: {
            type: 'object',
            properties: {
              boardId: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['boardId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              items: { type: 'array' },
            },
          },
        },
      ],
    });

    // Jira (Productivity)
    this.register({
      id: 'jira',
      name: 'Jira',
      version: '1.0.0',
      description: 'Manage Jira issues and projects',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read:jira-work', 'write:jira-work'],
      },
      actions: [
        {
          id: 'create_issue',
          name: 'Create Issue',
          description: 'Create a new Jira issue',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string' },
              summary: { type: 'string' },
              description: { type: 'string' },
              issueType: { type: 'string' },
            },
            required: ['projectKey', 'summary', 'issueType'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              key: { type: 'string' },
            },
          },
        },
        {
          id: 'get_issues',
          name: 'Get Issues',
          description: 'Get issues from a Jira project',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string' },
              jql: { type: 'string', description: 'JQL query string' },
              limit: { type: 'number' },
            },
            required: ['projectKey'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
            },
          },
        },
      ],
    });

    // Shopify (E-commerce)
    this.register({
      id: 'shopify',
      name: 'Shopify',
      version: '1.0.0',
      description: 'Connect to Shopify stores',
      category: 'e-commerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read_products', 'write_products'],
      },
      actions: [
        {
          id: 'get_products',
          name: 'Get Products',
          description: 'Retrieve products from Shopify store',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              products: { type: 'array' },
            },
          },
        },
        {
          id: 'create_product',
          name: 'Create Product',
          description: 'Create a new product in Shopify',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body_html: { type: 'string' },
              vendor: { type: 'string' },
              product_type: { type: 'string' },
            },
            required: ['title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
      ],
    });

    // Stripe (E-commerce)
    this.register({
      id: 'stripe',
      name: 'Stripe',
      version: '1.0.0',
      description: 'Process payments with Stripe',
      category: 'e-commerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read_write'],
      },
      actions: [
        {
          id: 'create_payment',
          name: 'Create Payment Intent',
          description: 'Create a payment intent',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              currency: { type: 'string' },
              customer: { type: 'string' },
            },
            required: ['amount', 'currency'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              client_secret: { type: 'string' },
            },
          },
        },
        {
          id: 'create_customer',
          name: 'Create Customer',
          description: 'Create a new Stripe customer',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // WooCommerce (E-commerce) - Direct API
    this.register({
      id: 'woocommerce',
      name: 'WooCommerce',
      version: '1.0.0',
      description: 'Connect to WooCommerce stores',
      category: 'e-commerce',
      auth: {
        type: 'api_key',
        description: 'WooCommerce REST API credentials',
      },
      actions: [
        {
          id: 'get_products',
          name: 'Get Products',
          description: 'Retrieve products from WooCommerce store',
          inputSchema: {
            type: 'object',
            properties: {
              per_page: { type: 'number' },
              page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              products: { type: 'array' },
            },
          },
        },
        {
          id: 'create_order',
          name: 'Create Order',
          description: 'Create a new order in WooCommerce',
          inputSchema: {
            type: 'object',
            properties: {
              payment_method: { type: 'string' },
              payment_method_title: { type: 'string' },
              line_items: { type: 'array' },
            },
            required: ['line_items'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
      ],
    });

    // PayPal (E-commerce)
    this.register({
      id: 'paypal',
      name: 'PayPal',
      version: '1.0.0',
      description: 'Process payments with PayPal',
      category: 'e-commerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://api.paypal.com/v1/payments/.*'],
      },
      actions: [
        {
          id: 'create_payment',
          name: 'Create Payment',
          description: 'Create a PayPal payment',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              currency: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['amount', 'currency'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              approval_url: { type: 'string' },
            },
          },
        },
      ],
    });

    // Database Connectors
    this.registerDatabaseConnectors();

    // Email Services
    this.registerEmailConnectors();

    // Additional Communication Services
    this.registerAdditionalCommunicationConnectors();

    // Productivity Services
    this.registerProductivityConnectors();

    // Developer Tools
    this.registerDeveloperToolsConnectors();

    // Additional Email Services
    this.registerAdditionalEmailConnectors();

    // Additional Communication Services
    this.registerMoreCommunicationConnectors();

    // Additional Productivity Services
    this.registerMoreProductivityConnectors();

    // Additional CRM & Marketing Services
    this.registerMoreCRMConnectors();

    // Additional E-commerce Services
    this.registerMoreEcommerceConnectors();

    // Additional Database Services
    this.registerMoreDatabaseConnectors();
  }

  /**
   * Register email service connectors
   */
  private registerEmailConnectors(): void {
    // Gmail (Communication)
    this.register({
      id: 'gmail',
      name: 'Gmail',
      version: '1.0.0',
      description: 'Send and receive emails via Gmail',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Gmail',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              from: { type: 'string', description: 'Sender email address' },
              subject: { type: 'string', description: 'Email subject' },
              body: { type: 'string', description: 'Email body' },
              isHtml: { type: 'boolean', description: 'Whether body is HTML' },
            },
            required: ['to', 'from', 'subject', 'body'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              threadId: { type: 'string' },
            },
          },
        },
        {
          id: 'get_messages',
          name: 'Get Messages',
          description: 'Get messages from Gmail inbox',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Gmail search query' },
              maxResults: { type: 'number', description: 'Maximum number of results' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              messages: { type: 'array' },
            },
          },
        },
        {
          id: 'get_message',
          name: 'Get Message',
          description: 'Get a specific message by ID',
          inputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
            required: ['messageId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              snippet: { type: 'string' },
            },
          },
        },
      ],
    });

    // Outlook / Microsoft 365 Mail (Communication)
    this.register({
      id: 'outlook',
      name: 'Outlook',
      version: '1.0.0',
      description: 'Send and receive emails via Outlook/Microsoft 365',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://graph.microsoft.com/Mail.Send', 'https://graph.microsoft.com/Mail.Read'],
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Outlook',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              from: { type: 'string', description: 'Sender email address' },
              subject: { type: 'string', description: 'Email subject' },
              body: { type: 'string', description: 'Email body' },
              isHtml: { type: 'boolean', description: 'Whether body is HTML' },
            },
            required: ['to', 'from', 'subject', 'body'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
        {
          id: 'get_messages',
          name: 'Get Messages',
          description: 'Get messages from Outlook inbox',
          inputSchema: {
            type: 'object',
            properties: {
              filter: { type: 'string', description: 'OData filter query' },
              top: { type: 'number', description: 'Maximum number of results' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              messages: { type: 'array' },
            },
          },
        },
        {
          id: 'get_message',
          name: 'Get Message',
          description: 'Get a specific message by ID',
          inputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
            required: ['messageId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register additional communication connectors
   */
  private registerAdditionalCommunicationConnectors(): void {
    // Mailgun (Communication)
    this.register({
      id: 'mailgun',
      name: 'Mailgun',
      version: '1.0.0',
      description: 'Send transactional emails via Mailgun',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Mailgun API key and domain',
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Mailgun',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              subject: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
              cc: { type: 'array', items: { type: 'string' } },
              bcc: { type: 'array', items: { type: 'string' } },
            },
            required: ['to', 'from', 'subject'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Postmark (Communication)
    this.register({
      id: 'postmark',
      name: 'Postmark',
      version: '1.0.0',
      description: 'Send transactional emails via Postmark',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Postmark server API token',
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Postmark',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              subject: { type: 'string' },
              textBody: { type: 'string' },
              htmlBody: { type: 'string' },
              cc: { type: 'array', items: { type: 'string' } },
              bcc: { type: 'array', items: { type: 'string' } },
            },
            required: ['to', 'from', 'subject'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
          },
        },
      ],
    });

    // Telegram (Communication)
    this.register({
      id: 'telegram',
      name: 'Telegram',
      version: '1.0.0',
      description: 'Send messages via Telegram Bot API',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Telegram bot token',
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message to a Telegram chat',
          inputSchema: {
            type: 'object',
            properties: {
              chatId: { type: 'string' },
              text: { type: 'string' },
              parseMode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'] },
            },
            required: ['chatId', 'text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'number' },
            },
          },
        },
        {
          id: 'get_updates',
          name: 'Get Updates',
          description: 'Get updates (messages) from Telegram',
          inputSchema: {
            type: 'object',
            properties: {
              offset: { type: 'number' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              updates: { type: 'array' },
            },
          },
        },
      ],
    });

    // WhatsApp (Communication)
    this.register({
      id: 'whatsapp',
      name: 'WhatsApp Business API',
      version: '1.0.0',
      description: 'Send messages via WhatsApp Business API (Twilio or Meta)',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Twilio Account SID and Auth Token, or Meta Access Token and Phone Number ID',
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a WhatsApp message',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              message: { type: 'string' },
              mediaUrl: { type: 'string' },
            },
            required: ['to', 'message'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
          },
        },
      ],
    });

    // Vonage (Communication)
    this.register({
      id: 'vonage',
      name: 'Vonage (Nexmo)',
      version: '1.0.0',
      description: 'Send SMS and make voice calls via Vonage',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Vonage API Key and API Secret',
      },
      actions: [
        {
          id: 'send_sms',
          name: 'Send SMS',
          description: 'Send an SMS via Vonage',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['to', 'from', 'text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
          },
        },
        {
          id: 'make_call',
          name: 'Make Call',
          description: 'Make a voice call via Vonage',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              answerUrl: { type: 'string' },
            },
            required: ['to', 'from', 'answerUrl'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              callId: { type: 'string' },
            },
          },
        },
      ],
    });

    // Zendesk (Communication)
    this.register({
      id: 'zendesk',
      name: 'Zendesk',
      version: '1.0.0',
      description: 'Manage Zendesk support tickets',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_ticket',
          name: 'Create Ticket',
          description: 'Create a new support ticket',
          inputSchema: {
            type: 'object',
            properties: {
              subject: { type: 'string' },
              comment: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
              type: { type: 'string', enum: ['question', 'incident', 'problem', 'task'] },
            },
            required: ['subject', 'comment'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_tickets',
          name: 'Get Tickets',
          description: 'Get tickets from Zendesk',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'] },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tickets: { type: 'array' },
            },
          },
        },
      ],
    });

    // Zoom (Communication)
    this.register({
      id: 'zoom',
      name: 'Zoom',
      version: '1.0.0',
      description: 'Create and manage Zoom meetings',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['meeting:write', 'meeting:read'],
      },
      actions: [
        {
          id: 'create_meeting',
          name: 'Create Meeting',
          description: 'Create a new Zoom meeting',
          inputSchema: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
              startTime: { type: 'string' },
              duration: { type: 'number' },
              timezone: { type: 'string' },
              type: { type: 'number' },
            },
            required: ['topic'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              join_url: { type: 'string' },
            },
          },
        },
        {
          id: 'get_meetings',
          name: 'Get Meetings',
          description: 'Get Zoom meetings',
          inputSchema: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              pageSize: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              meetings: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register productivity connectors
   */
  private registerProductivityConnectors(): void {
    // Google Calendar (Productivity)
    this.register({
      id: 'google_calendar',
      name: 'Google Calendar',
      version: '1.0.0',
      description: 'Manage Google Calendar events',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      },
      actions: [
        {
          id: 'create_event',
          name: 'Create Event',
          description: 'Create a calendar event',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: { type: 'string' },
              summary: { type: 'string' },
              start: { type: 'string' },
              end: { type: 'string' },
              description: { type: 'string' },
              location: { type: 'string' },
            },
            required: ['summary', 'start', 'end'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              htmlLink: { type: 'string' },
            },
          },
        },
        {
          id: 'get_events',
          name: 'Get Events',
          description: 'Get calendar events',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: { type: 'string' },
              timeMin: { type: 'string' },
              timeMax: { type: 'string' },
              maxResults: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              events: { type: 'array' },
            },
          },
        },
        {
          id: 'list_calendars',
          name: 'List Calendars',
          description: 'List available calendars',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              calendars: { type: 'array' },
            },
          },
        },
      ],
    });

    // Google Drive (Productivity)
    this.register({
      id: 'google_drive',
      name: 'Google Drive',
      version: '1.0.0',
      description: 'Upload and manage files in Google Drive',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
      },
      actions: [
        {
          id: 'upload_file',
          name: 'Upload File',
          description: 'Upload a file to Google Drive',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
              mimeType: { type: 'string' },
              parentFolderId: { type: 'string' },
            },
            required: ['name', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              webViewLink: { type: 'string' },
            },
          },
        },
        {
          id: 'list_files',
          name: 'List Files',
          description: 'List files in Google Drive',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              pageSize: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array' },
            },
          },
        },
        {
          id: 'download_file',
          name: 'Download File',
          description: 'Download a file from Google Drive',
          inputSchema: {
            type: 'object',
            properties: {
              fileId: { type: 'string' },
            },
            required: ['fileId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register developer tools connectors
   */
  private registerDeveloperToolsConnectors(): void {
    // GitHub (Developer Tools)
    this.register({
      id: 'github',
      name: 'GitHub',
      version: '1.0.0',
      description: 'Manage GitHub repositories and issues',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['repo', 'issues:write'],
      },
      actions: [
        {
          id: 'create_repository',
          name: 'Create Repository',
          description: 'Create a new GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              private: { type: 'boolean' },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              html_url: { type: 'string' },
            },
          },
        },
        {
          id: 'create_issue',
          name: 'Create Issue',
          description: 'Create a new GitHub issue',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              title: { type: 'string' },
              body: { type: 'string' },
              labels: { type: 'array', items: { type: 'string' } },
            },
            required: ['owner', 'repo', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              number: { type: 'number' },
            },
          },
        },
        {
          id: 'get_issues',
          name: 'Get Issues',
          description: 'Get issues from a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              state: { type: 'string', enum: ['open', 'closed', 'all'] },
              perPage: { type: 'number' },
            },
            required: ['owner', 'repo'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
            },
          },
        },
        {
          id: 'list_repositories',
          name: 'List Repositories',
          description: 'List GitHub repositories',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['all', 'owner', 'member'] },
              perPage: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              repositories: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register additional email service connectors
   */
  private registerAdditionalEmailConnectors(): void {
    // Amazon SES (Communication)
    this.register({
      id: 'amazon_ses',
      name: 'Amazon SES',
      version: '1.0.0',
      description: 'Send transactional emails via Amazon SES',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'AWS Access Key ID and Secret Access Key',
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Amazon SES',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              subject: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
              cc: { type: 'array', items: { type: 'string' } },
              bcc: { type: 'array', items: { type: 'string' } },
            },
            required: ['to', 'from', 'subject'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
            },
          },
        },
      ],
    });

    // Resend (Communication)
    this.register({
      id: 'resend',
      name: 'Resend',
      version: '1.0.0',
      description: 'Send transactional emails via Resend',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Resend API key',
      },
      actions: [
        {
          id: 'send_email',
          name: 'Send Email',
          description: 'Send an email via Resend',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              from: { type: 'string' },
              subject: { type: 'string' },
              text: { type: 'string' },
              html: { type: 'string' },
              cc: { type: 'array', items: { type: 'string' } },
              bcc: { type: 'array', items: { type: 'string' } },
              replyTo: { type: 'string' },
            },
            required: ['to', 'from', 'subject'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register more communication connectors
   */
  private registerMoreCommunicationConnectors(): void {
    // Intercom (Communication)
    this.register({
      id: 'intercom',
      name: 'Intercom',
      version: '1.0.0',
      description: 'Manage Intercom conversations and customer messaging',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_conversation',
          name: 'Create Conversation',
          description: 'Create a new conversation in Intercom',
          inputSchema: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              body: { type: 'string' },
              type: { type: 'string', enum: ['user', 'lead'] },
            },
            required: ['userId', 'body'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_conversations',
          name: 'Get Conversations',
          description: 'Get conversations from Intercom',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              conversations: { type: 'array' },
            },
          },
        },
      ],
    });

    // Freshdesk (Communication)
    this.register({
      id: 'freshdesk',
      name: 'Freshdesk',
      version: '1.0.0',
      description: 'Manage Freshdesk support tickets',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Freshdesk API key and domain',
      },
      actions: [
        {
          id: 'create_ticket',
          name: 'Create Ticket',
          description: 'Create a new support ticket',
          inputSchema: {
            type: 'object',
            properties: {
              subject: { type: 'string' },
              description: { type: 'string' },
              email: { type: 'string' },
              priority: { type: 'number', enum: [1, 2, 3, 4] },
              status: { type: 'number', enum: [2, 3, 4, 5] },
            },
            required: ['subject', 'description', 'email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_tickets',
          name: 'Get Tickets',
          description: 'Get tickets from Freshdesk',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'number' },
              priority: { type: 'number' },
              perPage: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tickets: { type: 'array' },
            },
          },
        },
      ],
    });

    // Help Scout (Communication)
    this.register({
      id: 'helpscout',
      name: 'Help Scout',
      version: '1.0.0',
      description: 'Manage Help Scout conversations and support tickets',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Help Scout App ID and App Secret',
      },
      actions: [
        {
          id: 'create_conversation',
          name: 'Create Conversation',
          description: 'Create a new conversation in Help Scout',
          inputSchema: {
            type: 'object',
            properties: {
              mailboxId: { type: 'string' },
              subject: { type: 'string' },
              customerEmail: { type: 'string' },
              text: { type: 'string' },
              type: { type: 'string', enum: ['email', 'chat', 'phone', 'voicemail'] },
            },
            required: ['mailboxId', 'subject', 'customerEmail', 'text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_conversations',
          name: 'Get Conversations',
          description: 'Get conversations from Help Scout',
          inputSchema: {
            type: 'object',
            properties: {
              mailboxId: { type: 'string' },
              status: { type: 'string', enum: ['open', 'pending', 'closed', 'spam'] },
              page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              conversations: { type: 'array' },
            },
          },
        },
      ],
    });

    // Crisp (Communication)
    this.register({
      id: 'crisp',
      name: 'Crisp',
      version: '1.0.0',
      description: 'Send messages and manage conversations in Crisp',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Crisp Identifier and Key',
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message in Crisp',
          inputSchema: {
            type: 'object',
            properties: {
              websiteId: { type: 'string' },
              sessionId: { type: 'string' },
              content: { type: 'string' },
              type: { type: 'string', enum: ['text', 'file', 'animation', 'audio', 'picker'] },
              from: { type: 'string', enum: ['user', 'operator'] },
            },
            required: ['websiteId', 'sessionId', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              timestamp: { type: 'number' },
            },
          },
        },
        {
          id: 'get_conversations',
          name: 'Get Conversations',
          description: 'Get conversations from Crisp',
          inputSchema: {
            type: 'object',
            properties: {
              websiteId: { type: 'string' },
              pageNumber: { type: 'number' },
            },
            required: ['websiteId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              conversations: { type: 'array' },
            },
          },
        },
      ],
    });

    // Calendly (Communication)
    this.register({
      id: 'calendly',
      name: 'Calendly',
      version: '1.0.0',
      description: 'Create and manage Calendly events',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_event',
          name: 'Create Event',
          description: 'Create a new event in Calendly',
          inputSchema: {
            type: 'object',
            properties: {
              eventTypeUri: { type: 'string' },
              inviteeEmail: { type: 'string' },
              inviteeName: { type: 'string' },
              startTime: { type: 'string' },
              timezone: { type: 'string' },
            },
            required: ['eventTypeUri', 'inviteeEmail'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              uri: { type: 'string' },
            },
          },
        },
        {
          id: 'get_events',
          name: 'Get Events',
          description: 'Get events from Calendly',
          inputSchema: {
            type: 'object',
            properties: {
              user: { type: 'string' },
              organization: { type: 'string' },
              count: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              events: { type: 'array' },
            },
          },
        },
      ],
    });

    // Cal.com (Communication)
    this.register({
      id: 'calcom',
      name: 'Cal.com',
      version: '1.0.0',
      description: 'Create and manage Cal.com bookings',
      category: 'communication',
      auth: {
        type: 'api_key',
        description: 'Cal.com API key',
      },
      actions: [
        {
          id: 'create_booking',
          name: 'Create Booking',
          description: 'Create a new booking in Cal.com',
          inputSchema: {
            type: 'object',
            properties: {
              eventTypeId: { type: 'number' },
              start: { type: 'string' },
              end: { type: 'string' },
              responses: { type: 'object' },
              timeZone: { type: 'string' },
              language: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['eventTypeId', 'start', 'end', 'responses'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_bookings',
          name: 'Get Bookings',
          description: 'Get bookings from Cal.com',
          inputSchema: {
            type: 'object',
            properties: {
              eventTypeId: { type: 'number' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              bookings: { type: 'array' },
            },
          },
        },
      ],
    });

    // Google Meet (Communication)
    this.register({
      id: 'googlemeet',
      name: 'Google Meet',
      version: '1.0.0',
      description: 'Create and manage Google Meet meetings',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/calendar'],
      },
      actions: [
        {
          id: 'create_meeting',
          name: 'Create Meeting',
          description: 'Create a new Google Meet meeting',
          inputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              attendees: { type: 'array', items: { type: 'string' } },
              description: { type: 'string' },
              timeZone: { type: 'string' },
            },
            required: ['summary', 'startTime', 'endTime'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_meetings',
          name: 'Get Meetings',
          description: 'Get Google Meet meetings',
          inputSchema: {
            type: 'object',
            properties: {
              timeMin: { type: 'string' },
              timeMax: { type: 'string' },
              maxResults: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              meetings: { type: 'array' },
            },
          },
        },
      ],
    });

    // Drift (Communication)
    this.register({
      id: 'drift',
      name: 'Drift',
      version: '1.0.0',
      description: 'Send messages and manage conversations in Drift',
      category: 'communication',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'send_message',
          name: 'Send Message',
          description: 'Send a message in Drift',
          inputSchema: {
            type: 'object',
            properties: {
              conversationId: { type: 'number' },
              body: { type: 'string' },
              type: { type: 'string', enum: ['chat', 'private_note'] },
            },
            required: ['conversationId', 'body'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_conversations',
          name: 'Get Conversations',
          description: 'Get conversations from Drift',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              cursor: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              conversations: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register more productivity connectors
   */
  private registerMoreProductivityConnectors(): void {
    // Dropbox (Productivity)
    this.register({
      id: 'dropbox',
      name: 'Dropbox',
      version: '1.0.0',
      description: 'Upload and manage files in Dropbox',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['files.content.write', 'files.content.read'],
      },
      actions: [
        {
          id: 'upload_file',
          name: 'Upload File',
          description: 'Upload a file to Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              mode: { type: 'string', enum: ['add', 'overwrite', 'update'] },
            },
            required: ['path', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'list_files',
          name: 'List Files',
          description: 'List files in Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              entries: { type: 'array' },
            },
          },
        },
        {
          id: 'download_file',
          name: 'Download File',
          description: 'Download a file from Dropbox',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
          },
        },
      ],
    });

    // Notion (Productivity)
    this.register({
      id: 'notion',
      name: 'Notion',
      version: '1.0.0',
      description: 'Read and write Notion pages and databases',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'update', 'insert'],
      },
      actions: [
        {
          id: 'create_page',
          name: 'Create Page',
          description: 'Create a new page in Notion',
          inputSchema: {
            type: 'object',
            properties: {
              parentId: { type: 'string' },
              parentType: { type: 'string', enum: ['database_id', 'page_id'] },
              title: { type: 'string' },
              properties: { type: 'object' },
              content: { type: 'array' },
            },
            required: ['parentId', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_page',
          name: 'Get Page',
          description: 'Get a page from Notion',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
            },
            required: ['pageId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'query_database',
          name: 'Query Database',
          description: 'Query a Notion database',
          inputSchema: {
            type: 'object',
            properties: {
              databaseId: { type: 'string' },
              filter: { type: 'object' },
              sorts: { type: 'array' },
              pageSize: { type: 'number' },
            },
            required: ['databaseId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              results: { type: 'array' },
            },
          },
        },
      ],
    });

    // ClickUp (Productivity)
    this.register({
      id: 'clickup',
      name: 'ClickUp',
      version: '1.0.0',
      description: 'Manage ClickUp tasks and projects',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_task',
          name: 'Create Task',
          description: 'Create a new task in ClickUp',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              status: { type: 'string' },
              priority: { type: 'number', enum: [1, 2, 3, 4] },
              assignees: { type: 'array', items: { type: 'string' } },
              dueDate: { type: 'number' },
            },
            required: ['listId', 'name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_tasks',
          name: 'Get Tasks',
          description: 'Get tasks from ClickUp',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              archived: { type: 'boolean' },
              page: { type: 'number' },
            },
            required: ['listId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              tasks: { type: 'array' },
            },
          },
        },
      ],
    });

    // OneDrive (Productivity)
    this.register({
      id: 'onedrive',
      name: 'OneDrive',
      version: '1.0.0',
      description: 'Upload and manage files in OneDrive',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['Files.ReadWrite'],
      },
      actions: [
        {
          id: 'upload_file',
          name: 'Upload File',
          description: 'Upload a file to OneDrive',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'list_files',
          name: 'List Files',
          description: 'List files in OneDrive',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array' },
            },
          },
        },
        {
          id: 'download_file',
          name: 'Download File',
          description: 'Download a file from OneDrive',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
          },
        },
      ],
    });

    // Box (Productivity)
    this.register({
      id: 'box',
      name: 'Box',
      version: '1.0.0',
      description: 'Upload and manage files in Box',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['root_readwrite'],
      },
      actions: [
        {
          id: 'upload_file',
          name: 'Upload File',
          description: 'Upload a file to Box',
          inputSchema: {
            type: 'object',
            properties: {
              parentFolderId: { type: 'string' },
              fileName: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['fileName', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'list_files',
          name: 'List Files',
          description: 'List files in Box',
          inputSchema: {
            type: 'object',
            properties: {
              folderId: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              entries: { type: 'array' },
            },
          },
        },
        {
          id: 'download_file',
          name: 'Download File',
          description: 'Download a file from Box',
          inputSchema: {
            type: 'object',
            properties: {
              fileId: { type: 'string' },
            },
            required: ['fileId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
          },
        },
      ],
    });

    // Linear (Productivity)
    this.register({
      id: 'linear',
      name: 'Linear',
      version: '1.0.0',
      description: 'Manage Linear issues and projects',
      category: 'productivity',
      auth: {
        type: 'api_key',
        description: 'Linear API key',
      },
      actions: [
        {
          id: 'create_issue',
          name: 'Create Issue',
          description: 'Create a new issue in Linear',
          inputSchema: {
            type: 'object',
            properties: {
              teamId: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'number' },
              stateId: { type: 'string' },
              assigneeId: { type: 'string' },
            },
            required: ['teamId', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_issues',
          name: 'Get Issues',
          description: 'Get issues from Linear',
          inputSchema: {
            type: 'object',
            properties: {
              teamId: { type: 'string' },
              first: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
            },
          },
        },
      ],
    });

    // Basecamp (Productivity)
    this.register({
      id: 'basecamp',
      name: 'Basecamp',
      version: '1.0.0',
      description: 'Manage Basecamp todos and projects',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_todo',
          name: 'Create Todo',
          description: 'Create a new todo in Basecamp',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              todoSetId: { type: 'string' },
              content: { type: 'string' },
              notes: { type: 'string' },
              dueOn: { type: 'string' },
              assigneeIds: { type: 'array', items: { type: 'number' } },
            },
            required: ['projectId', 'todoSetId', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_todos',
          name: 'Get Todos',
          description: 'Get todos from Basecamp',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              todoSetId: { type: 'string' },
              status: { type: 'string', enum: ['open', 'completed', 'archived'] },
            },
            required: ['projectId', 'todoSetId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              todos: { type: 'array' },
            },
          },
        },
      ],
    });

    // Wrike (Productivity)
    this.register({
      id: 'wrike',
      name: 'Wrike',
      version: '1.0.0',
      description: 'Manage Wrike tasks and projects',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['wsReadWrite'],
      },
      actions: [
        {
          id: 'create_task',
          name: 'Create Task',
          description: 'Create a new task in Wrike',
          inputSchema: {
            type: 'object',
            properties: {
              folderId: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              status: { type: 'string', enum: ['Active', 'Completed', 'Deferred', 'Cancelled'] },
              priority: { type: 'string', enum: ['High', 'Normal', 'Low'] },
              assignees: { type: 'array', items: { type: 'string' } },
              dueDate: { type: 'string' },
            },
            required: ['folderId', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_tasks',
          name: 'Get Tasks',
          description: 'Get tasks from Wrike',
          inputSchema: {
            type: 'object',
            properties: {
              folderId: { type: 'string' },
              status: { type: 'string', enum: ['Active', 'Completed', 'Deferred', 'Cancelled'] },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tasks: { type: 'array' },
            },
          },
        },
      ],
    });

    // Acuity Scheduling (Productivity)
    this.register({
      id: 'acuityscheduling',
      name: 'Acuity Scheduling',
      version: '1.0.0',
      description: 'Create and manage appointments in Acuity Scheduling',
      category: 'productivity',
      auth: {
        type: 'api_key',
        description: 'Acuity Scheduling User ID and API Key',
      },
      actions: [
        {
          id: 'create_appointment',
          name: 'Create Appointment',
          description: 'Create a new appointment',
          inputSchema: {
            type: 'object',
            properties: {
              appointmentTypeId: { type: 'number' },
              calendarId: { type: 'number' },
              datetime: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['appointmentTypeId', 'calendarId', 'datetime'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_appointments',
          name: 'Get Appointments',
          description: 'Get appointments from Acuity Scheduling',
          inputSchema: {
            type: 'object',
            properties: {
              minDate: { type: 'string' },
              maxDate: { type: 'string' },
              calendarID: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              appointments: { type: 'array' },
            },
          },
        },
      ],
    });

    // Amazon S3 (Productivity)
    this.register({
      id: 'aws_s3',
      name: 'Amazon S3',
      version: '1.0.0',
      description: 'Upload and manage files in Amazon S3',
      category: 'productivity',
      auth: {
        type: 'api_key',
        description: 'AWS Access Key ID and Secret Access Key',
      },
      actions: [
        {
          id: 'upload_file',
          name: 'Upload File',
          description: 'Upload a file to S3',
          inputSchema: {
            type: 'object',
            properties: {
              bucket: { type: 'string' },
              key: { type: 'string' },
              content: { type: 'string' },
              contentType: { type: 'string' },
            },
            required: ['bucket', 'key', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
          },
        },
        {
          id: 'get_file',
          name: 'Get File',
          description: 'Download a file from S3',
          inputSchema: {
            type: 'object',
            properties: {
              bucket: { type: 'string' },
              key: { type: 'string' },
            },
            required: ['bucket', 'key'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
            },
          },
        },
        {
          id: 'list_files',
          name: 'List Files',
          description: 'List files in an S3 bucket',
          inputSchema: {
            type: 'object',
            properties: {
              bucket: { type: 'string' },
              prefix: { type: 'string' },
              maxKeys: { type: 'number' },
            },
            required: ['bucket'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              files: { type: 'array' },
            },
          },
        },
      ],
    });

    // Microsoft SQL Server (Database)
    this.register({
      id: 'microsoft_sql_server',
      name: 'Microsoft SQL Server',
      version: '1.0.0',
      description: 'Execute queries on Microsoft SQL Server',
      category: 'database',
      auth: {
        type: 'connection_string',
        description: 'SQL Server connection string',
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
            },
          },
        },
        {
          id: 'list_tables',
          name: 'List Tables',
          description: 'List tables in the database',
          inputSchema: {
            type: 'object',
            properties: {
              schema: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tables: { type: 'array' },
            },
          },
        },
      ],
    });

    // Amazon RDS (Database)
    this.register({
      id: 'amazon_rds',
      name: 'Amazon RDS',
      version: '1.0.0',
      description: 'Execute queries on Amazon RDS instances',
      category: 'database',
      auth: {
        type: 'api_key',
        description: 'RDS connection details (host, port, database, username, password, engine)',
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
            },
          },
        },
        {
          id: 'list_tables',
          name: 'List Tables',
          description: 'List tables in the database',
          inputSchema: {
            type: 'object',
            properties: {
              schema: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tables: { type: 'array' },
            },
          },
        },
      ],
    });

    // Amazon DynamoDB (Database)
    this.register({
      id: 'dynamodb',
      name: 'Amazon DynamoDB',
      version: '1.0.0',
      description: 'Manage DynamoDB tables and items',
      category: 'database',
      auth: {
        type: 'api_key',
        description: 'AWS Access Key ID and Secret Access Key',
      },
      actions: [
        {
          id: 'put_item',
          name: 'Put Item',
          description: 'Put an item in a DynamoDB table',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: { type: 'string' },
              item: { type: 'object' },
            },
            required: ['tableName', 'item'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
        {
          id: 'get_item',
          name: 'Get Item',
          description: 'Get an item from a DynamoDB table',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: { type: 'string' },
              key: { type: 'object' },
            },
            required: ['tableName', 'key'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              item: { type: 'object' },
            },
          },
        },
        {
          id: 'query',
          name: 'Query',
          description: 'Query items from a DynamoDB table',
          inputSchema: {
            type: 'object',
            properties: {
              tableName: { type: 'string' },
              keyConditionExpression: { type: 'string' },
              expressionAttributeValues: { type: 'object' },
              indexName: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['tableName', 'keyConditionExpression'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              items: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register more CRM & Marketing connectors
   */
  private registerMoreCRMConnectors(): void {
    // Mailchimp (CRM & Sales)
    this.register({
      id: 'mailchimp',
      name: 'Mailchimp',
      version: '1.0.0',
      description: 'Manage Mailchimp email marketing campaigns',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'add_subscriber',
          name: 'Add Subscriber',
          description: 'Add or update a subscriber in Mailchimp',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              email: { type: 'string' },
              status: { type: 'string', enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending'] },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              mergeFields: { type: 'object' },
            },
            required: ['listId', 'email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'create_campaign',
          name: 'Create Campaign',
          description: 'Create a new email campaign',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              subject: { type: 'string' },
              fromName: { type: 'string' },
              replyTo: { type: 'string' },
              type: { type: 'string', enum: ['regular', 'plaintext', 'absplit', 'rss', 'variate'] },
            },
            required: ['listId', 'subject', 'fromName', 'replyTo'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // ActiveCampaign (CRM & Sales)
    this.register({
      id: 'activecampaign',
      name: 'ActiveCampaign',
      version: '1.0.0',
      description: 'Manage ActiveCampaign contacts and automation',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'ActiveCampaign API key and API URL',
      },
      actions: [
        {
          id: 'create_contact',
          name: 'Create Contact',
          description: 'Create or update a contact in ActiveCampaign',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phone: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_contacts',
          name: 'Get Contacts',
          description: 'Get contacts from ActiveCampaign',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              offset: { type: 'number' },
              email: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              contacts: { type: 'array' },
            },
          },
        },
      ],
    });

    // GitLab (Developer Tools)
    this.register({
      id: 'gitlab',
      name: 'GitLab',
      version: '1.0.0',
      description: 'Manage GitLab projects and issues',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['api', 'read_api', 'write_api'],
      },
      actions: [
        {
          id: 'create_project',
          name: 'Create Project',
          description: 'Create a new GitLab project',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              visibility: { type: 'string', enum: ['private', 'internal', 'public'] },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'create_issue',
          name: 'Create Issue',
          description: 'Create a new GitLab issue',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              labels: { type: 'array', items: { type: 'string' } },
              assigneeIds: { type: 'array', items: { type: 'number' } },
            },
            required: ['projectId', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_issues',
          name: 'Get Issues',
          description: 'Get issues from a GitLab project',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              state: { type: 'string', enum: ['opened', 'closed', 'all'] },
              perPage: { type: 'number' },
            },
            required: ['projectId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
            },
          },
        },
      ],
    });

    // Bitbucket (Developer Tools)
    this.register({
      id: 'bitbucket',
      name: 'Bitbucket',
      version: '1.0.0',
      description: 'Manage Bitbucket repositories and issues',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['repository:write', 'issue:write'],
      },
      actions: [
        {
          id: 'create_repository',
          name: 'Create Repository',
          description: 'Create a new Bitbucket repository',
          inputSchema: {
            type: 'object',
            properties: {
              workspace: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              isPrivate: { type: 'boolean' },
            },
            required: ['workspace', 'name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              uuid: { type: 'string' },
            },
          },
        },
        {
          id: 'create_issue',
          name: 'Create Issue',
          description: 'Create a new Bitbucket issue',
          inputSchema: {
            type: 'object',
            properties: {
              workspace: { type: 'string' },
              repoSlug: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              kind: { type: 'string', enum: ['bug', 'enhancement', 'proposal', 'task'] },
              priority: { type: 'string', enum: ['trivial', 'minor', 'major', 'critical', 'blocker'] },
            },
            required: ['workspace', 'repoSlug', 'title'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_issues',
          name: 'Get Issues',
          description: 'Get issues from a Bitbucket repository',
          inputSchema: {
            type: 'object',
            properties: {
              workspace: { type: 'string' },
              repoSlug: { type: 'string' },
              state: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['workspace', 'repoSlug'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              issues: { type: 'array' },
            },
          },
        },
      ],
    });

    // Vercel (Developer Tools)
    this.register({
      id: 'vercel',
      name: 'Vercel',
      version: '1.0.0',
      description: 'Deploy and manage Vercel projects',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_deployment',
          name: 'Create Deployment',
          description: 'Create a new Vercel deployment',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              files: { type: 'object' },
              projectSettings: { type: 'object' },
            },
            required: ['name', 'files'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_deployments',
          name: 'Get Deployments',
          description: 'Get Vercel deployments',
          inputSchema: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              deployments: { type: 'array' },
            },
          },
        },
        {
          id: 'list_projects',
          name: 'List Projects',
          description: 'List Vercel projects',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              projects: { type: 'array' },
            },
          },
        },
      ],
    });

    // Netlify (Developer Tools)
    this.register({
      id: 'netlify',
      name: 'Netlify',
      version: '1.0.0',
      description: 'Deploy and manage Netlify sites',
      category: 'productivity',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_site',
          name: 'Create Site',
          description: 'Create a new Netlify site',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              customDomain: { type: 'string' },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'deploy',
          name: 'Deploy',
          description: 'Deploy to Netlify',
          inputSchema: {
            type: 'object',
            properties: {
              siteId: { type: 'string' },
              files: { type: 'object' },
              draft: { type: 'boolean' },
            },
            required: ['siteId', 'files'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_sites',
          name: 'Get Sites',
          description: 'Get Netlify sites',
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              perPage: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              sites: { type: 'array' },
            },
          },
        },
      ],
    });

    // ConvertKit (CRM & Sales)
    this.register({
      id: 'convertkit',
      name: 'ConvertKit',
      version: '1.0.0',
      description: 'Manage ConvertKit subscribers and email marketing',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'ConvertKit API key',
      },
      actions: [
        {
          id: 'add_subscriber',
          name: 'Add Subscriber',
          description: 'Add a subscriber to ConvertKit',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              tags: { type: 'array', items: { type: 'number' } },
              fields: { type: 'object' },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              subscription: { type: 'object' },
            },
          },
        },
        {
          id: 'get_subscribers',
          name: 'Get Subscribers',
          description: 'Get subscribers from ConvertKit',
          inputSchema: {
            type: 'object',
            properties: {
              page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              subscribers: { type: 'array' },
            },
          },
        },
      ],
    });

    // Klaviyo (CRM & Sales)
    this.register({
      id: 'klaviyo',
      name: 'Klaviyo',
      version: '1.0.0',
      description: 'Manage Klaviyo profiles and email marketing',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Klaviyo API key',
      },
      actions: [
        {
          id: 'create_profile',
          name: 'Create Profile',
          description: 'Create or update a profile in Klaviyo',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phoneNumber: { type: 'string' },
              properties: { type: 'object' },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'subscribe_to_list',
          name: 'Subscribe to List',
          description: 'Subscribe a profile to a Klaviyo list',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              listId: { type: 'string' },
            },
            required: ['email', 'listId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              job_id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Clearbit (CRM & Sales)
    this.register({
      id: 'clearbit',
      name: 'Clearbit',
      version: '1.0.0',
      description: 'Enrich person and company data with Clearbit',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Clearbit API key',
      },
      actions: [
        {
          id: 'enrich_person',
          name: 'Enrich Person',
          description: 'Enrich person data by email',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              person: { type: 'object' },
            },
          },
        },
        {
          id: 'enrich_company',
          name: 'Enrich Company',
          description: 'Enrich company data by domain',
          inputSchema: {
            type: 'object',
            properties: {
              domain: { type: 'string' },
            },
            required: ['domain'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              company: { type: 'object' },
            },
          },
        },
      ],
    });

    // Apollo.io (CRM & Sales)
    this.register({
      id: 'apollo',
      name: 'Apollo.io',
      version: '1.0.0',
      description: 'Search for people and organizations in Apollo',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Apollo API key',
      },
      actions: [
        {
          id: 'search_people',
          name: 'Search People',
          description: 'Search for people in Apollo',
          inputSchema: {
            type: 'object',
            properties: {
              personTitles: { type: 'array', items: { type: 'string' } },
              personLocations: { type: 'array', items: { type: 'string' } },
              organizationDomains: { type: 'array', items: { type: 'string' } },
              page: { type: 'number' },
              perPage: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              people: { type: 'array' },
            },
          },
        },
        {
          id: 'search_organizations',
          name: 'Search Organizations',
          description: 'Search for organizations in Apollo',
          inputSchema: {
            type: 'object',
            properties: {
              organizationNames: { type: 'array', items: { type: 'string' } },
              organizationDomains: { type: 'array', items: { type: 'string' } },
              industries: { type: 'array', items: { type: 'string' } },
              page: { type: 'number' },
              perPage: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              organizations: { type: 'array' },
            },
          },
        },
      ],
    });

    // ZoomInfo (CRM & Sales)
    this.register({
      id: 'zoominfo',
      name: 'ZoomInfo',
      version: '1.0.0',
      description: 'Search for contacts and companies in ZoomInfo',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'ZoomInfo Username and Password',
      },
      actions: [
        {
          id: 'search_contacts',
          name: 'Search Contacts',
          description: 'Search for contacts in ZoomInfo',
          inputSchema: {
            type: 'object',
            properties: {
              companyName: { type: 'string' },
              jobTitle: { type: 'string' },
              location: { type: 'string' },
              page: { type: 'number' },
              pageSize: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              contacts: { type: 'array' },
            },
          },
        },
        {
          id: 'search_companies',
          name: 'Search Companies',
          description: 'Search for companies in ZoomInfo',
          inputSchema: {
            type: 'object',
            properties: {
              companyName: { type: 'string' },
              industry: { type: 'string' },
              location: { type: 'string' },
              page: { type: 'number' },
              pageSize: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              companies: { type: 'array' },
            },
          },
        },
      ],
    });

    // Close (CRM & Sales)
    this.register({
      id: 'close',
      name: 'Close',
      version: '1.0.0',
      description: 'Manage Close CRM leads and opportunities',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Close API key',
      },
      actions: [
        {
          id: 'create_lead',
          name: 'Create Lead',
          description: 'Create a new lead in Close',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: 'string' },
              description: { type: 'string' },
              contacts: { type: 'array' },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_leads',
          name: 'Get Leads',
          description: 'Get leads from Close',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      ],
    });

    // Streak (CRM & Sales)
    this.register({
      id: 'streak',
      name: 'Streak',
      version: '1.0.0',
      description: 'Manage Streak CRM pipelines and boxes',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_box',
          name: 'Create Box',
          description: 'Create a new box (deal) in Streak',
          inputSchema: {
            type: 'object',
            properties: {
              pipelineKey: { type: 'string' },
              name: { type: 'string' },
              stageKey: { type: 'string' },
              fields: { type: 'object' },
            },
            required: ['pipelineKey', 'name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
          },
        },
        {
          id: 'get_boxes',
          name: 'Get Boxes',
          description: 'Get boxes from Streak',
          inputSchema: {
            type: 'object',
            properties: {
              pipelineKey: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              results: { type: 'array' },
            },
          },
        },
      ],
    });

    // Outreach (CRM & Sales)
    this.register({
      id: 'outreach',
      name: 'Outreach',
      version: '1.0.0',
      description: 'Manage Outreach sales engagement',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_prospect',
          name: 'Create Prospect',
          description: 'Create a new prospect in Outreach',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              title: { type: 'string' },
              company: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_prospects',
          name: 'Get Prospects',
          description: 'Get prospects from Outreach',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              filter: { type: 'object' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      ],
    });

    // SalesLoft (CRM & Sales)
    this.register({
      id: 'salesloft',
      name: 'SalesLoft',
      version: '1.0.0',
      description: 'Manage SalesLoft sales engagement',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_person',
          name: 'Create Person',
          description: 'Create a new person in SalesLoft',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              title: { type: 'string' },
              companyName: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_people',
          name: 'Get People',
          description: 'Get people from SalesLoft',
          inputSchema: {
            type: 'object',
            properties: {
              perPage: { type: 'number' },
              page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      ],
    });

    // Gong (CRM & Sales)
    this.register({
      id: 'gong',
      name: 'Gong',
      version: '1.0.0',
      description: 'Access Gong revenue intelligence data',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Gong Access Key and Access Key Secret',
      },
      actions: [
        {
          id: 'get_calls',
          name: 'Get Calls',
          description: 'Get calls from Gong',
          inputSchema: {
            type: 'object',
            properties: {
              fromDate: { type: 'string' },
              toDate: { type: 'string' },
              limit: { type: 'number' },
              cursor: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              calls: { type: 'array' },
            },
          },
        },
        {
          id: 'get_call_details',
          name: 'Get Call Details',
          description: 'Get detailed information about a call',
          inputSchema: {
            type: 'object',
            properties: {
              callId: { type: 'string' },
            },
            required: ['callId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              call: { type: 'object' },
            },
          },
        },
      ],
    });

    // Microsoft Dynamics 365 (CRM & Sales)
    this.register({
      id: 'microsoft_dynamics_365',
      name: 'Microsoft Dynamics 365',
      version: '1.0.0',
      description: 'Manage Microsoft Dynamics 365 CRM records',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_record',
          name: 'Create Record',
          description: 'Create a new record in Dynamics 365',
          inputSchema: {
            type: 'object',
            properties: {
              entitySetName: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['entitySetName', 'data'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_records',
          name: 'Get Records',
          description: 'Get records from Dynamics 365',
          inputSchema: {
            type: 'object',
            properties: {
              entitySetName: { type: 'string' },
              filter: { type: 'string' },
              select: { type: 'string' },
              top: { type: 'number' },
              orderBy: { type: 'string' },
            },
            required: ['entitySetName'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              value: { type: 'array' },
            },
          },
        },
      ],
    });

    // SugarCRM (CRM & Sales)
    this.register({
      id: 'sugarcrm',
      name: 'SugarCRM',
      version: '1.0.0',
      description: 'Manage SugarCRM records',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_record',
          name: 'Create Record',
          description: 'Create a new record in SugarCRM',
          inputSchema: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['module', 'data'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_records',
          name: 'Get Records',
          description: 'Get records from SugarCRM',
          inputSchema: {
            type: 'object',
            properties: {
              module: { type: 'string' },
              filter: { type: 'array' },
              fields: { type: 'array', items: { type: 'string' } },
              maxResults: { type: 'number' },
              offset: { type: 'number' },
              orderBy: { type: 'string' },
            },
            required: ['module'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              records: { type: 'array' },
            },
          },
        },
      ],
    });

    // Constant Contact (CRM & Sales)
    this.register({
      id: 'constantcontact',
      name: 'Constant Contact',
      version: '1.0.0',
      description: 'Manage Constant Contact email marketing',
      category: 'crm',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['contact_data', 'offline_access'],
      },
      actions: [
        {
          id: 'add_contact',
          name: 'Add Contact',
          description: 'Add a contact to Constant Contact',
          inputSchema: {
            type: 'object',
            properties: {
              emailAddress: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              listMemberships: { type: 'array', items: { type: 'string' } },
              customFields: { type: 'array' },
            },
            required: ['emailAddress'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              contact_id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_contacts',
          name: 'Get Contacts',
          description: 'Get contacts from Constant Contact',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              email: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              contacts: { type: 'array' },
            },
          },
        },
      ],
    });

    // Campaign Monitor (CRM & Sales)
    this.register({
      id: 'campaignmonitor',
      name: 'Campaign Monitor',
      version: '1.0.0',
      description: 'Manage Campaign Monitor email marketing',
      category: 'crm',
      auth: {
        type: 'api_key',
        description: 'Campaign Monitor API key',
      },
      actions: [
        {
          id: 'add_subscriber',
          name: 'Add Subscriber',
          description: 'Add a subscriber to Campaign Monitor',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
              customFields: { type: 'array' },
              resubscribe: { type: 'boolean' },
            },
            required: ['listId', 'email'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              emailAddress: { type: 'string' },
            },
          },
        },
        {
          id: 'get_subscribers',
          name: 'Get Subscribers',
          description: 'Get subscribers from Campaign Monitor',
          inputSchema: {
            type: 'object',
            properties: {
              listId: { type: 'string' },
              page: { type: 'number' },
              pageSize: { type: 'number' },
              orderField: { type: 'string' },
              orderDirection: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['listId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              Results: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register more e-commerce connectors
   */
  private registerMoreEcommerceConnectors(): void {
    // BigCommerce (E-commerce)
    this.register({
      id: 'bigcommerce',
      name: 'BigCommerce',
      version: '1.0.0',
      description: 'Manage BigCommerce products and orders',
      category: 'ecommerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_product',
          name: 'Create Product',
          description: 'Create a new product in BigCommerce',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['physical', 'digital'] },
              weight: { type: 'number' },
              price: { type: 'string' },
              categories: { type: 'array', items: { type: 'number' } },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_products',
          name: 'Get Products',
          description: 'Get products from BigCommerce',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              page: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              products: { type: 'array' },
            },
          },
        },
      ],
    });

    // Square (E-commerce)
    this.register({
      id: 'square',
      name: 'Square',
      version: '1.0.0',
      description: 'Process payments and manage Square transactions',
      category: 'ecommerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['PAYMENTS_WRITE', 'PAYMENTS_READ'],
      },
      actions: [
        {
          id: 'create_payment',
          name: 'Create Payment',
          description: 'Process a payment via Square',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              currency: { type: 'string' },
              sourceId: { type: 'string' },
              idempotencyKey: { type: 'string' },
            },
            required: ['amount', 'sourceId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_payments',
          name: 'Get Payments',
          description: 'Get payments from Square',
          inputSchema: {
            type: 'object',
            properties: {
              beginTime: { type: 'string' },
              endTime: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              payments: { type: 'array' },
            },
          },
        },
      ],
    });

    // Braintree (E-commerce)
    this.register({
      id: 'braintree',
      name: 'Braintree',
      version: '1.0.0',
      description: 'Process payments via Braintree',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'Braintree Merchant ID, Public Key, and Private Key',
      },
      actions: [
        {
          id: 'create_transaction',
          name: 'Create Transaction',
          description: 'Process a payment transaction',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'string' },
              paymentMethodNonce: { type: 'string' },
              options: { type: 'object' },
            },
            required: ['amount', 'paymentMethodNonce'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_transaction',
          name: 'Get Transaction',
          description: 'Get a transaction from Braintree',
          inputSchema: {
            type: 'object',
            properties: {
              transactionId: { type: 'string' },
            },
            required: ['transactionId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Razorpay (E-commerce)
    this.register({
      id: 'razorpay',
      name: 'Razorpay',
      version: '1.0.0',
      description: 'Process payments via Razorpay',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'Razorpay Key ID and Key Secret',
      },
      actions: [
        {
          id: 'create_payment',
          name: 'Create Payment',
          description: 'Create a payment order',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              currency: { type: 'string' },
              receipt: { type: 'string' },
              notes: { type: 'object' },
            },
            required: ['amount'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_payments',
          name: 'Get Payments',
          description: 'Get payments from Razorpay',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'number' },
              skip: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              payments: { type: 'array' },
            },
          },
        },
      ],
    });

    // ShipStation (E-commerce)
    this.register({
      id: 'shipstation',
      name: 'ShipStation',
      version: '1.0.0',
      description: 'Manage shipments and orders via ShipStation',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'ShipStation API Key and API Secret',
      },
      actions: [
        {
          id: 'create_shipment',
          name: 'Create Shipment',
          description: 'Create a shipment label for an order',
          inputSchema: {
            type: 'object',
            properties: {
              orderId: { type: 'number' },
              carrierCode: { type: 'string' },
              serviceCode: { type: 'string' },
              shipDate: { type: 'string' },
            },
            required: ['orderId', 'carrierCode', 'serviceCode', 'shipDate'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              shipmentId: { type: 'number' },
            },
          },
        },
        {
          id: 'get_orders',
          name: 'Get Orders',
          description: 'Get orders from ShipStation',
          inputSchema: {
            type: 'object',
            properties: {
              orderStatus: { type: 'string' },
              page: { type: 'number' },
              pageSize: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              orders: { type: 'array' },
            },
          },
        },
      ],
    });

    // Shippo (E-commerce)
    this.register({
      id: 'shippo',
      name: 'Shippo',
      version: '1.0.0',
      description: 'Create shipments and purchase labels via Shippo',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'Shippo API Token',
      },
      actions: [
        {
          id: 'create_shipment',
          name: 'Create Shipment',
          description: 'Create a shipment and get rates',
          inputSchema: {
            type: 'object',
            properties: {
              addressFrom: { type: 'object' },
              addressTo: { type: 'object' },
              parcels: { type: 'array' },
            },
            required: ['addressFrom', 'addressTo', 'parcels'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              object_id: { type: 'string' },
            },
          },
        },
        {
          id: 'create_transaction',
          name: 'Create Transaction',
          description: 'Purchase a shipping label',
          inputSchema: {
            type: 'object',
            properties: {
              rate: { type: 'string' },
              async: { type: 'boolean' },
            },
            required: ['rate'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              object_id: { type: 'string' },
            },
          },
        },
      ],
    });

    // EasyPost (E-commerce)
    this.register({
      id: 'easypost',
      name: 'EasyPost',
      version: '1.0.0',
      description: 'Create shipments and purchase labels via EasyPost',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'EasyPost API Key',
      },
      actions: [
        {
          id: 'create_shipment',
          name: 'Create Shipment',
          description: 'Create a shipment and get rates',
          inputSchema: {
            type: 'object',
            properties: {
              toAddress: { type: 'object' },
              fromAddress: { type: 'object' },
              parcel: { type: 'object' },
            },
            required: ['toAddress', 'fromAddress', 'parcel'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'buy_shipment',
          name: 'Buy Shipment',
          description: 'Purchase a shipping label',
          inputSchema: {
            type: 'object',
            properties: {
              shipmentId: { type: 'string' },
              rateId: { type: 'string' },
            },
            required: ['shipmentId', 'rateId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });

    // Adyen (E-commerce)
    this.register({
      id: 'adyen',
      name: 'Adyen',
      version: '1.0.0',
      description: 'Process payments via Adyen',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'Adyen API Key and Merchant Account',
      },
      actions: [
        {
          id: 'create_payment',
          name: 'Create Payment',
          description: 'Process a payment via Adyen',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'object' },
              reference: { type: 'string' },
              paymentMethod: { type: 'object' },
              returnUrl: { type: 'string' },
            },
            required: ['amount', 'reference', 'paymentMethod'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              pspReference: { type: 'string' },
            },
          },
        },
        {
          id: 'get_payment_status',
          name: 'Get Payment Status',
          description: 'Get payment status from Adyen',
          inputSchema: {
            type: 'object',
            properties: {
              pspReference: { type: 'string' },
            },
            required: ['pspReference'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              resultCode: { type: 'string' },
            },
          },
        },
      ],
    });

    // Magento (E-commerce)
    this.register({
      id: 'magento',
      name: 'Magento',
      version: '1.0.0',
      description: 'Manage Magento products and orders',
      category: 'ecommerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'create_product',
          name: 'Create Product',
          description: 'Create a new product in Magento',
          inputSchema: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'number' },
              typeId: { type: 'string', enum: ['simple', 'configurable', 'virtual', 'bundle', 'downloadable'] },
              attributeSetId: { type: 'number' },
              status: { type: 'number', enum: [1, 2] },
              visibility: { type: 'number', enum: [1, 2, 3, 4] },
            },
            required: ['sku', 'name', 'price'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_products',
          name: 'Get Products',
          description: 'Get products from Magento',
          inputSchema: {
            type: 'object',
            properties: {
              searchCriteria: { type: 'object' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              items: { type: 'array' },
            },
          },
        },
      ],
    });

    // Squarespace Commerce (E-commerce)
    this.register({
      id: 'squarespace_commerce',
      name: 'Squarespace Commerce',
      version: '1.0.0',
      description: 'Manage Squarespace Commerce products',
      category: 'ecommerce',
      auth: {
        type: 'api_key',
        description: 'Squarespace API Key and Site ID',
      },
      actions: [
        {
          id: 'create_product',
          name: 'Create Product',
          description: 'Create a new product in Squarespace Commerce',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'number' },
              sku: { type: 'string' },
              inventory: { type: 'number' },
            },
            required: ['name'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_products',
          name: 'Get Products',
          description: 'Get products from Squarespace Commerce',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number' },
              cursor: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              products: { type: 'array' },
            },
          },
        },
      ],
    });

    // Etsy (E-commerce)
    this.register({
      id: 'etsy',
      name: 'Etsy',
      version: '1.0.0',
      description: 'Manage Etsy shop listings',
      category: 'ecommerce',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['listings_r', 'listings_w'],
      },
      actions: [
        {
          id: 'create_listing',
          name: 'Create Listing',
          description: 'Create a new listing in Etsy',
          inputSchema: {
            type: 'object',
            properties: {
              shopId: { type: 'number' },
              title: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'number' },
              quantity: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
              materials: { type: 'array', items: { type: 'string' } },
            },
            required: ['shopId', 'title', 'description', 'price', 'quantity'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              listingId: { type: 'number' },
            },
          },
        },
        {
          id: 'get_listings',
          name: 'Get Listings',
          description: 'Get listings from an Etsy shop',
          inputSchema: {
            type: 'object',
            properties: {
              shopId: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
            required: ['shopId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              results: { type: 'array' },
            },
          },
        },
      ],
    });

    // CircleCI (Developer Tools)
    this.register({
      id: 'circleci',
      name: 'CircleCI',
      version: '1.0.0',
      description: 'Trigger and manage CircleCI pipelines',
      category: 'productivity',
      auth: {
        type: 'api_key',
        description: 'CircleCI API token',
      },
      actions: [
        {
          id: 'trigger_pipeline',
          name: 'Trigger Pipeline',
          description: 'Trigger a CircleCI pipeline',
          inputSchema: {
            type: 'object',
            properties: {
              projectSlug: { type: 'string' },
              branch: { type: 'string' },
              parameters: { type: 'object' },
            },
            required: ['projectSlug', 'branch'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_pipelines',
          name: 'Get Pipelines',
          description: 'Get pipelines from CircleCI',
          inputSchema: {
            type: 'object',
            properties: {
              projectSlug: { type: 'string' },
              branch: { type: 'string' },
              pageToken: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              items: { type: 'array' },
            },
          },
        },
      ],
    });

    // Heroku (Developer Tools)
    this.register({
      id: 'heroku',
      name: 'Heroku',
      version: '1.0.0',
      description: 'Deploy and manage Heroku apps',
      category: 'productivity',
      auth: {
        type: 'api_key',
        description: 'Heroku API Key',
      },
      actions: [
        {
          id: 'create_app',
          name: 'Create App',
          description: 'Create a new Heroku app',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              region: { type: 'string' },
              stack: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_apps',
          name: 'Get Apps',
          description: 'Get Heroku apps',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              apps: { type: 'array' },
            },
          },
        },
        {
          id: 'create_release',
          name: 'Create Release',
          description: 'Create a new release for an app',
          inputSchema: {
            type: 'object',
            properties: {
              appId: { type: 'string' },
              slugId: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['appId', 'slugId'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register more database connectors
   */
  private registerMoreDatabaseConnectors(): void {
    // Snowflake (Database)
    this.register({
      id: 'snowflake',
      name: 'Snowflake',
      version: '1.0.0',
      description: 'Execute SQL queries in Snowflake',
      category: 'database',
      auth: {
        type: 'api_key',
        description: 'Snowflake Account, Username, and Password',
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query in Snowflake',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
            },
          },
        },
      ],
    });

    // BigQuery (Database)
    this.register({
      id: 'bigquery',
      name: 'BigQuery',
      version: '1.0.0',
      description: 'Execute SQL queries in Google BigQuery',
      category: 'database',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/bigquery'],
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query in BigQuery',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              useLegacySql: { type: 'boolean' },
              maxResults: { type: 'number' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
            },
          },
        },
        {
          id: 'get_datasets',
          name: 'Get Datasets',
          description: 'Get datasets from BigQuery',
          inputSchema: {
            type: 'object',
            properties: {
              maxResults: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              datasets: { type: 'array' },
            },
          },
        },
      ],
    });
  }

  /**
   * Register database connectors
   */
  private registerDatabaseConnectors(): void {
    // PostgreSQL (Database)
    this.register({
      id: 'postgresql',
      name: 'PostgreSQL',
      version: '1.0.0',
      description: 'Connect to PostgreSQL databases',
      category: 'database',
      auth: {
        type: 'connection_string',
        description: 'PostgreSQL connection string',
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query on PostgreSQL',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'SQL query to execute' },
              params: { type: 'array', description: 'Query parameters' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
              rowCount: { type: 'number' },
            },
          },
        },
        {
          id: 'list_tables',
          name: 'List Tables',
          description: 'List all tables in the database',
          inputSchema: {
            type: 'object',
            properties: {
              schema: { type: 'string', description: 'Schema name (default: public)' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tables: { type: 'array' },
            },
          },
        },
      ],
    });

    // MySQL (Database)
    this.register({
      id: 'mysql',
      name: 'MySQL',
      version: '1.0.0',
      description: 'Connect to MySQL databases',
      category: 'database',
      auth: {
        type: 'connection_string',
        description: 'MySQL connection string',
      },
      actions: [
        {
          id: 'execute_query',
          name: 'Execute Query',
          description: 'Execute a SQL query on MySQL',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'SQL query to execute' },
              params: { type: 'array', description: 'Query parameters' },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              rows: { type: 'array' },
              affectedRows: { type: 'number' },
            },
          },
        },
        {
          id: 'list_tables',
          name: 'List Tables',
          description: 'List all tables in the database',
          inputSchema: {
            type: 'object',
            properties: {
              database: { type: 'string', description: 'Database name' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tables: { type: 'array' },
            },
          },
        },
      ],
    });

    // MongoDB (Database)
    this.register({
      id: 'mongodb',
      name: 'MongoDB',
      version: '1.0.0',
      description: 'Connect to MongoDB databases',
      category: 'database',
      auth: {
        type: 'connection_string',
        description: 'MongoDB connection string',
      },
      actions: [
        {
          id: 'find',
          name: 'Find Documents',
          description: 'Find documents in a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              database: { type: 'string' },
              collection: { type: 'string' },
              filter: { type: 'object', description: 'MongoDB filter query' },
              limit: { type: 'number' },
            },
            required: ['database', 'collection'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              documents: { type: 'array' },
            },
          },
        },
        {
          id: 'insert',
          name: 'Insert Document',
          description: 'Insert a document into a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              database: { type: 'string' },
              collection: { type: 'string' },
              document: { type: 'object' },
            },
            required: ['database', 'collection', 'document'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              insertedId: { type: 'string' },
            },
          },
        },
      ],
    });

    // Redis (Database)
    this.register({
      id: 'redis',
      name: 'Redis',
      version: '1.0.0',
      description: 'Connect to Redis databases',
      category: 'database',
      auth: {
        type: 'connection_string',
        description: 'Redis connection string',
      },
      actions: [
        {
          id: 'get',
          name: 'Get Value',
          description: 'Get a value from Redis by key',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
            },
            required: ['key'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
        {
          id: 'set',
          name: 'Set Value',
          description: 'Set a value in Redis',
          inputSchema: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
              ttl: { type: 'number', description: 'Time to live in seconds' },
            },
            required: ['key', 'value'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      ],
    });

    // Supabase (Database)
    this.register({
      id: 'supabase',
      name: 'Supabase',
      version: '1.0.0',
      description: 'Connect to Supabase databases via API',
      category: 'database',
      auth: {
        type: 'api_key',
        description: 'Supabase API key and URL',
      },
      actions: [
        {
          id: 'query',
          name: 'Query Table',
          description: 'Query a Supabase table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string' },
              select: { type: 'string', description: 'Columns to select' },
              filter: { type: 'object', description: 'Filter conditions' },
              limit: { type: 'number' },
            },
            required: ['table'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
        {
          id: 'insert',
          name: 'Insert Row',
          description: 'Insert a row into a Supabase table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['table', 'data'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      ],
    });

    // Google Cloud Platform (Developer Tools)
    this.register({
      id: 'google_cloud_platform',
      name: 'Google Cloud Platform',
      version: '1.0.0',
      description: 'Execute operations on Google Cloud Platform services',
      category: 'developer_tools',
      auth: {
        type: 'api_key',
        description: 'GCP Service Account Key (JSON)',
      },
      actions: [
        {
          id: 'execute_operation',
          name: 'Execute Operation',
          description: 'Execute a generic GCP operation',
          inputSchema: {
            type: 'object',
            properties: {
              service: { type: 'string' },
              method: { type: 'string' },
              resource: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['service', 'method', 'resource'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              result: { type: 'object' },
            },
          },
        },
      ],
    });

    // AWS (Developer Tools)
    this.register({
      id: 'aws',
      name: 'Amazon Web Services',
      version: '1.0.0',
      description: 'Execute operations on AWS services',
      category: 'developer_tools',
      auth: {
        type: 'api_key',
        description: 'AWS Access Key ID and Secret Access Key',
      },
      actions: [
        {
          id: 'execute_operation',
          name: 'Execute Operation',
          description: 'Execute a generic AWS operation',
          inputSchema: {
            type: 'object',
            properties: {
              service: { type: 'string' },
              action: { type: 'string' },
              parameters: { type: 'object' },
            },
            required: ['service', 'action'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              result: { type: 'object' },
            },
          },
        },
      ],
    });

    // Microsoft Azure (Developer Tools)
    this.register({
      id: 'microsoft_azure',
      name: 'Microsoft Azure',
      version: '1.0.0',
      description: 'Execute operations on Microsoft Azure services',
      category: 'developer_tools',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['read', 'write'],
      },
      actions: [
        {
          id: 'execute_operation',
          name: 'Execute Operation',
          description: 'Execute a generic Azure operation',
          inputSchema: {
            type: 'object',
            properties: {
              resourcePath: { type: 'string' },
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
              body: { type: 'object' },
            },
            required: ['resourcePath'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'object' },
            },
          },
        },
      ],
    });

    // LinkedIn (Social Media)
    this.register({
      id: 'linkedin',
      name: 'LinkedIn',
      version: '1.0.0',
      description: 'Manage LinkedIn posts and profile',
      category: 'social_media',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['w_member_social', 'r_liteprofile'],
      },
      actions: [
        {
          id: 'create_post',
          name: 'Create Post',
          description: 'Create a post on LinkedIn',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              visibility: { type: 'string', enum: ['PUBLIC', 'CONNECTIONS'] },
            },
            required: ['text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_profile',
          name: 'Get Profile',
          description: 'Get LinkedIn user profile',
          inputSchema: {
            type: 'object',
            properties: {},
          },
          outputSchema: {
            type: 'object',
            properties: {
              profile: { type: 'object' },
            },
          },
        },
      ],
    });

    // Twitter/X (Social Media)
    this.register({
      id: 'twitter',
      name: 'Twitter/X',
      version: '1.0.0',
      description: 'Manage Twitter/X tweets and timeline',
      category: 'social_media',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['tweet.read', 'tweet.write', 'users.read'],
      },
      actions: [
        {
          id: 'create_tweet',
          name: 'Create Tweet',
          description: 'Create a tweet on Twitter/X',
          inputSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              replyToTweetId: { type: 'string' },
            },
            required: ['text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_timeline',
          name: 'Get Timeline',
          description: 'Get user timeline from Twitter/X',
          inputSchema: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              maxResults: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              tweets: { type: 'array' },
            },
          },
        },
      ],
    });

    // Facebook (Social Media)
    this.register({
      id: 'facebook',
      name: 'Facebook',
      version: '1.0.0',
      description: 'Manage Facebook posts and pages',
      category: 'social_media',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
      },
      actions: [
        {
          id: 'create_post',
          name: 'Create Post',
          description: 'Create a post on Facebook',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              pageId: { type: 'string' },
              link: { type: 'string' },
            },
            required: ['message'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_posts',
          name: 'Get Posts',
          description: 'Get posts from Facebook page or profile',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              posts: { type: 'array' },
            },
          },
        },
      ],
    });

    // Instagram (Social Media)
    this.register({
      id: 'instagram',
      name: 'Instagram',
      version: '1.0.0',
      description: 'Manage Instagram Business account media',
      category: 'social_media',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
      },
      actions: [
        {
          id: 'create_media',
          name: 'Create Media',
          description: 'Create a post on Instagram',
          inputSchema: {
            type: 'object',
            properties: {
              imageUrl: { type: 'string' },
              caption: { type: 'string' },
              accountId: { type: 'string' },
            },
            required: ['imageUrl', 'caption'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_media',
          name: 'Get Media',
          description: 'Get media from Instagram account',
          inputSchema: {
            type: 'object',
            properties: {
              accountId: { type: 'string' },
              limit: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              media: { type: 'array' },
            },
          },
        },
      ],
    });

    // YouTube (Social Media)
    this.register({
      id: 'youtube',
      name: 'YouTube',
      version: '1.0.0',
      description: 'Manage YouTube videos and channel',
      category: 'social_media',
      oauthProvider: 'nango',
      auth: {
        type: 'oauth2',
        scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
      },
      actions: [
        {
          id: 'upload_video',
          name: 'Upload Video',
          description: 'Upload a video to YouTube',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              videoFileUrl: { type: 'string' },
              privacyStatus: { type: 'string', enum: ['private', 'unlisted', 'public'] },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'description', 'videoFileUrl'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        {
          id: 'get_videos',
          name: 'Get Videos',
          description: 'Get videos from YouTube channel',
          inputSchema: {
            type: 'object',
            properties: {
              channelId: { type: 'string' },
              maxResults: { type: 'number' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              videos: { type: 'array' },
            },
          },
        },
      ],
    });

    // WordPress (CMS)
    this.register({
      id: 'wordpress',
      name: 'WordPress',
      version: '1.0.0',
      description: 'Manage WordPress posts and content',
      category: 'cms',
      auth: {
        type: 'api_key',
        description: 'WordPress Application Password or OAuth2 Access Token',
      },
      actions: [
        {
          id: 'create_post',
          name: 'Create Post',
          description: 'Create a post in WordPress',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              status: { type: 'string', enum: ['publish', 'draft', 'pending', 'private'] },
              excerpt: { type: 'string' },
              categories: { type: 'array', items: { type: 'number' } },
              tags: { type: 'array', items: { type: 'number' } },
              featuredMedia: { type: 'number' },
            },
            required: ['title', 'content'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
            },
          },
        },
        {
          id: 'get_posts',
          name: 'Get Posts',
          description: 'Get posts from WordPress',
          inputSchema: {
            type: 'object',
            properties: {
              perPage: { type: 'number' },
              page: { type: 'number' },
              status: { type: 'string' },
              categories: { type: 'array', items: { type: 'number' } },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              posts: { type: 'array' },
            },
          },
        },
      ],
    });
  }
}

export const connectorRegistry = new ConnectorRegistry();

