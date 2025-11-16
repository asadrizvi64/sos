import { NodeExecutionContext, NodeExecutionResult } from '@sos/shared';
import { connectorRouter, ConnectorProvider } from '../connectorRouter';
import { connectorRegistry } from '../connectors/registry';
import { nangoService } from '../nangoService';
import { db } from '../../config/database';
import { connectorCredentials } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Execute a connector node using the connector router
 * 
 * This function:
 * 1. Determines which provider to use (Nango, custom OAuth, etc.)
 * 2. Retrieves credentials from the appropriate source
 * 3. Executes the connector action
 */
export async function executeConnector(context: NodeExecutionContext): Promise<NodeExecutionResult> {
  const { config, input, workflowId } = context;
  const nodeConfig = config as any;

  // Extract connector ID from node type (e.g., 'integration.slack' -> 'slack')
  const nodeType = nodeConfig.type || '';
  const connectorId = nodeType.replace('integration.', '');
  const actionId = nodeConfig.action || nodeConfig.operation || 'default';

  // Get connector manifest
  const connector = connectorRegistry.get(connectorId);
  if (!connector) {
    return {
      success: false,
      error: {
        message: `Connector ${connectorId} not found`,
        code: 'CONNECTOR_NOT_FOUND',
      },
    };
  }

  // Get user and organization from context (should be set by workflow executor)
  const userId = (context as any).userId || '';
  const organizationId = (context as any).organizationId || '';

  if (!userId) {
    return {
      success: false,
      error: {
        message: 'User ID is required for connector execution',
        code: 'MISSING_USER_ID',
      },
    };
  }

  // Create OpenTelemetry span for connector execution
  const tracer = trace.getTracer('sos-connector-executor');
  const span = tracer.startSpan('connector.execute', {
    attributes: {
      'connector.id': connectorId,
      'connector.action': actionId,
      'connector.provider': connector.auth?.type || 'unknown',
      'node.id': context.nodeId,
      'workflow.id': workflowId,
      'workflow.execution_id': context.executionId,
      'user.id': userId,
      'organization.id': organizationId || '',
    },
  });

  const startTime = Date.now();
  let traceId: string | undefined;

  try {
    const spanContext = span.spanContext();
    traceId = spanContext.traceId;
    // Route to determine which provider to use
    const routingDecision = await connectorRouter.routeSimple(connectorId, userId, organizationId);
    
    span.setAttributes({
      'connector.routing_provider': routingDecision.provider,
    });

    // Get credentials based on provider
    let credentials: Record<string, unknown> | null = null;

    if (routingDecision.provider === ConnectorProvider.NANGO) {
      // Get credentials from Nango
      const connections = await nangoService.getConnections(userId, organizationId);
      const connection = connections.find((conn) => conn.provider === connectorId);

      if (!connection) {
        return {
          success: false,
          error: {
            message: `No connection found for ${connectorId}. Please connect your account first.`,
            code: 'NO_CONNECTION',
            metadata: {
              connectorId,
              provider: 'nango',
              authUrl: `/api/v1/nango/oauth/${connectorId}/authorize`,
            },
          },
        };
      }

      // Get access token from Nango
      const connectionId = `${userId}-${connectorId}-${Date.now()}`;
      const token = await nangoService.getToken(connectorId, connection.id);
      credentials = {
        access_token: token,
        ...connection.credentials,
      };
    } else if (routingDecision.provider === ConnectorProvider.CUSTOM_OAUTH) {
      // Get credentials from database (for custom OAuth like Gmail/Outlook)
      const [storedCredentials] = await db
        .select()
        .from(connectorCredentials)
        .where(
          and(
            eq(connectorCredentials.connectorId, connectorId),
            eq(connectorCredentials.userId, userId),
            organizationId ? eq(connectorCredentials.organizationId, organizationId) : undefined
          )
        )
        .limit(1);

      if (!storedCredentials) {
        return {
          success: false,
          error: {
            message: `No credentials found for ${connectorId}. Please connect your account first.`,
            code: 'NO_CREDENTIALS',
            metadata: {
              connectorId,
              provider: 'custom_oauth',
            },
          },
        };
      }

      credentials = storedCredentials.credentials as Record<string, unknown>;
    } else if (routingDecision.provider === ConnectorProvider.ERROR) {
      return {
        success: false,
        error: {
          message: routingDecision.reason,
          code: 'ROUTING_ERROR',
          metadata: routingDecision.metadata,
        },
      };
    } else {
      // Future providers (Panora, Composio, etc.) - not yet implemented
      return {
        success: false,
        error: {
          message: `Provider ${routingDecision.provider} is not yet implemented`,
          code: 'PROVIDER_NOT_IMPLEMENTED',
          metadata: routingDecision.metadata,
        },
      };
    }

    // Execute the connector action
    const result = await executeConnectorAction(connectorId, actionId, input, credentials, nodeConfig);
    
    const latencyMs = Date.now() - startTime;
    
    // Update span with result
    if (result.success) {
      span.setAttributes({
        'connector.status': 'success',
        'connector.latency_ms': latencyMs,
      });
      span.setStatus({ code: SpanStatusCode.OK });
    } else {
      span.setAttributes({
        'connector.status': 'error',
        'connector.latency_ms': latencyMs,
        'connector.error': result.error?.message || 'Connector execution failed',
        'connector.error_code': result.error?.code || 'CONNECTOR_ERROR',
      });
      if (result.error) {
        span.recordException(new Error(result.error.message || 'Connector execution failed'));
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: result.error?.message || 'Connector execution failed',
      });
    }
    span.end();
    
    return result;
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    
    span.setAttributes({
      'connector.status': 'error',
      'connector.latency_ms': latencyMs,
      'connector.error': error.message || 'Connector execution failed',
      'connector.error_code': 'CONNECTOR_EXECUTION_ERROR',
    });
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message || 'Connector execution failed',
    });
    span.end();
    
    return {
      success: false,
      error: {
        message: error.message || 'Connector execution failed',
        code: 'CONNECTOR_EXECUTION_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Execute a specific connector action
 */
async function executeConnectorAction(
  connectorId: string,
  actionId: string,
  input: Record<string, unknown>,
  credentials: Record<string, unknown>,
  nodeConfig: Record<string, unknown>
): Promise<NodeExecutionResult> {
  const accessToken = credentials.access_token as string;

  if (!accessToken) {
    return {
      success: false,
      error: {
        message: 'Access token not found in credentials',
        code: 'MISSING_ACCESS_TOKEN',
      },
    };
  }

  // Route to connector-specific executors
  try {
    switch (connectorId) {
      case 'salesforce': {
        const { executeSalesforce } = await import('./connectors/salesforce');
        return executeSalesforce(actionId, input, credentials as any);
      }

      case 'hubspot': {
        const { executeHubSpot } = await import('./connectors/hubspot');
        return executeHubSpot(actionId, input, credentials as any);
      }

      case 'pipedrive': {
        const { executePipedrive } = await import('./connectors/pipedrive');
        return executePipedrive(actionId, input, credentials as any);
      }

      case 'zoho_crm': {
        const { executeZoho } = await import('./connectors/zoho');
        return executeZoho(actionId, input, credentials as any);
      }

      case 'twilio': {
        const { executeTwilio } = await import('./connectors/twilio');
        return executeTwilio(actionId, input, credentials as any);
      }

      case 'sendgrid': {
        const { executeSendGrid } = await import('./connectors/sendgrid');
        return executeSendGrid(actionId, input, credentials as any);
      }

      case 'postgresql': {
        const { executePostgreSQL } = await import('./connectors/postgresql');
        return executePostgreSQL(actionId, input, credentials as any);
      }

      case 'mysql': {
        const { executeMySQL } = await import('./connectors/mysql');
        return executeMySQL(actionId, input, credentials as any);
      }

      case 'mongodb': {
        const { executeMongoDB } = await import('./connectors/mongodb');
        return executeMongoDB(actionId, input, credentials as any);
      }

      case 'redis': {
        const { executeRedis } = await import('./connectors/redis');
        return executeRedis(actionId, input, credentials as any);
      }

      case 'supabase': {
        const { executeSupabase } = await import('./connectors/supabase');
        return executeSupabase(actionId, input, credentials as any);
      }

      case 'monday': {
        const { executeMonday } = await import('./connectors/monday');
        return executeMonday(actionId, input, credentials as any);
      }

      case 'jira': {
        const { executeJira } = await import('./connectors/jira');
        return executeJira(actionId, input, credentials as any);
      }

      case 'trello': {
        const { executeTrello } = await import('./connectors/trello');
        return executeTrello(actionId, input, credentials as any);
      }

      case 'asana': {
        const { executeAsana } = await import('./connectors/asana');
        return executeAsana(actionId, input, credentials as any);
      }

      case 'microsoft_teams': {
        const { executeMicrosoftTeams } = await import('./connectors/microsoftTeams');
        return executeMicrosoftTeams(actionId, input, credentials as any);
      }

      case 'discord': {
        const { executeDiscord } = await import('./connectors/discord');
        return executeDiscord(actionId, input, credentials as any);
      }

      case 'stripe': {
        const { executeStripe } = await import('./connectors/stripe');
        return executeStripe(actionId, input, credentials as any);
      }

      case 'shopify': {
        const { executeShopify } = await import('./connectors/shopify');
        return executeShopify(actionId, input, credentials as any);
      }

      case 'gmail': {
        const { executeGmail } = await import('./connectors/gmail');
        return executeGmail(actionId, input, credentials as any);
      }

      case 'outlook': {
        const { executeOutlook } = await import('./connectors/outlook');
        return executeOutlook(actionId, input, credentials as any);
      }

      case 'mailgun': {
        const { executeMailgun } = await import('./connectors/mailgun');
        return executeMailgun(actionId, input, credentials as any);
      }

      case 'postmark': {
        const { executePostmark } = await import('./connectors/postmark');
        return executePostmark(actionId, input, credentials as any);
      }

      case 'telegram': {
        const { executeTelegram } = await import('./connectors/telegram');
        return executeTelegram(actionId, input, credentials as any);
      }

      case 'zendesk': {
        const { executeZendesk } = await import('./connectors/zendesk');
        return executeZendesk(actionId, input, credentials as any);
      }

      case 'zoom': {
        const { executeZoom } = await import('./connectors/zoom');
        return executeZoom(actionId, input, credentials as any);
      }

      case 'google_calendar': {
        const { executeGoogleCalendar } = await import('./connectors/googleCalendar');
        return executeGoogleCalendar(actionId, input, credentials as any);
      }

      case 'google_drive': {
        const { executeGoogleDrive } = await import('./connectors/googleDrive');
        return executeGoogleDrive(actionId, input, credentials as any);
      }

      case 'github': {
        const { executeGitHub } = await import('./connectors/github');
        return executeGitHub(actionId, input, credentials as any);
      }

      case 'gitlab': {
        const { executeGitLab } = await import('./connectors/gitlab');
        return executeGitLab(actionId, input, credentials as any);
      }

      case 'bitbucket': {
        const { executeBitbucket } = await import('./connectors/bitbucket');
        return executeBitbucket(actionId, input, credentials as any);
      }

      case 'vercel': {
        const { executeVercel } = await import('./connectors/vercel');
        return executeVercel(actionId, input, credentials as any);
      }

      case 'netlify': {
        const { executeNetlify } = await import('./connectors/netlify');
        return executeNetlify(actionId, input, credentials as any);
      }

      case 'amazon_ses': {
        const { executeAmazonSES } = await import('./connectors/amazonSES');
        return executeAmazonSES(actionId, input, credentials as any);
      }

      case 'resend': {
        const { executeResend } = await import('./connectors/resend');
        return executeResend(actionId, input, credentials as any);
      }

      case 'intercom': {
        const { executeIntercom } = await import('./connectors/intercom');
        return executeIntercom(actionId, input, credentials as any);
      }

      case 'freshdesk': {
        const { executeFreshdesk } = await import('./connectors/freshdesk');
        return executeFreshdesk(actionId, input, credentials as any);
      }

      case 'dropbox': {
        const { executeDropbox } = await import('./connectors/dropbox');
        return executeDropbox(actionId, input, credentials as any);
      }

      case 'notion': {
        const { executeNotion } = await import('./connectors/notion');
        return executeNotion(actionId, input, credentials as any);
      }

      case 'clickup': {
        const { executeClickUp } = await import('./connectors/clickUp');
        return executeClickUp(actionId, input, credentials as any);
      }

      case 'mailchimp': {
        const { executeMailchimp } = await import('./connectors/mailchimp');
        return executeMailchimp(actionId, input, credentials as any);
      }

      case 'activecampaign': {
        const { executeActiveCampaign } = await import('./connectors/activeCampaign');
        return executeActiveCampaign(actionId, input, credentials as any);
      }

      case 'onedrive': {
        const { executeOneDrive } = await import('./connectors/oneDrive');
        return executeOneDrive(actionId, input, credentials as any);
      }

      case 'box': {
        const { executeBox } = await import('./connectors/box');
        return executeBox(actionId, input, credentials as any);
      }

      case 'linear': {
        const { executeLinear } = await import('./connectors/linear');
        return executeLinear(actionId, input, credentials as any);
      }

      case 'basecamp': {
        const { executeBasecamp } = await import('./connectors/basecamp');
        return executeBasecamp(actionId, input, credentials as any);
      }

      case 'wrike': {
        const { executeWrike } = await import('./connectors/wrike');
        return executeWrike(actionId, input, credentials as any);
      }

      case 'bigcommerce': {
        const { executeBigCommerce } = await import('./connectors/bigCommerce');
        return executeBigCommerce(actionId, input, credentials as any);
      }

      case 'square': {
        const { executeSquare } = await import('./connectors/square');
        return executeSquare(actionId, input, credentials as any);
      }

      case 'braintree': {
        const { executeBraintree } = await import('./connectors/braintree');
        return executeBraintree(actionId, input, credentials as any);
      }

      case 'convertkit': {
        const { executeConvertKit } = await import('./connectors/convertKit');
        return executeConvertKit(actionId, input, credentials as any);
      }

      case 'klaviyo': {
        const { executeKlaviyo } = await import('./connectors/klaviyo');
        return executeKlaviyo(actionId, input, credentials as any);
      }

      case 'helpscout': {
        const { executeHelpScout } = await import('./connectors/helpScout');
        return executeHelpScout(actionId, input, credentials as any);
      }

      case 'crisp': {
        const { executeCrisp } = await import('./connectors/crisp');
        return executeCrisp(actionId, input, credentials as any);
      }

      case 'calendly': {
        const { executeCalendly } = await import('./connectors/calendly');
        return executeCalendly(actionId, input, credentials as any);
      }

      case 'calcom': {
        const { executeCalCom } = await import('./connectors/calCom');
        return executeCalCom(actionId, input, credentials as any);
      }

      case 'circleci': {
        const { executeCircleCI } = await import('./connectors/circleCI');
        return executeCircleCI(actionId, input, credentials as any);
      }

      case 'heroku': {
        const { executeHeroku } = await import('./connectors/heroku');
        return executeHeroku(actionId, input, credentials as any);
      }

      case 'razorpay': {
        const { executeRazorpay } = await import('./connectors/razorpay');
        return executeRazorpay(actionId, input, credentials as any);
      }

      case 'shipstation': {
        const { executeShipStation } = await import('./connectors/shipstation');
        return executeShipStation(actionId, input, credentials as any);
      }

      case 'shippo': {
        const { executeShippo } = await import('./connectors/shippo');
        return executeShippo(actionId, input, credentials as any);
      }

      case 'easypost': {
        const { executeEasyPost } = await import('./connectors/easyPost');
        return executeEasyPost(actionId, input, credentials as any);
      }

      case 'snowflake': {
        const { executeSnowflake } = await import('./connectors/snowflake');
        return executeSnowflake(actionId, input, credentials as any);
      }

      case 'bigquery': {
        const { executeBigQuery } = await import('./connectors/bigQuery');
        return executeBigQuery(actionId, input, credentials as any);
      }

      case 'clearbit': {
        const { executeClearbit } = await import('./connectors/clearbit');
        return executeClearbit(actionId, input, credentials as any);
      }

      case 'apollo': {
        const { executeApollo } = await import('./connectors/apollo');
        return executeApollo(actionId, input, credentials as any);
      }

      case 'constantcontact': {
        const { executeConstantContact } = await import('./connectors/constantContact');
        return executeConstantContact(actionId, input, credentials as any);
      }

      case 'campaignmonitor': {
        const { executeCampaignMonitor } = await import('./connectors/campaignMonitor');
        return executeCampaignMonitor(actionId, input, credentials as any);
      }

      case 'acuityscheduling': {
        const { executeAcuityScheduling } = await import('./connectors/acuityScheduling');
        return executeAcuityScheduling(actionId, input, credentials as any);
      }

      case 'googlemeet': {
        const { executeGoogleMeet } = await import('./connectors/googleMeet');
        return executeGoogleMeet(actionId, input, credentials as any);
      }

      case 'drift': {
        const { executeDrift } = await import('./connectors/drift');
        return executeDrift(actionId, input, credentials as any);
      }

      case 'zoominfo': {
        const { executeZoomInfo } = await import('./connectors/zoomInfo');
        return executeZoomInfo(actionId, input, credentials as any);
      }

      case 'adyen': {
        const { executeAdyen } = await import('./connectors/adyen');
        return executeAdyen(actionId, input, credentials as any);
      }

      case 'close': {
        const { executeClose } = await import('./connectors/close');
        return executeClose(actionId, input, credentials as any);
      }

      case 'streak': {
        const { executeStreak } = await import('./connectors/streak');
        return executeStreak(actionId, input, credentials as any);
      }

      case 'outreach': {
        const { executeOutreach } = await import('./connectors/outreach');
        return executeOutreach(actionId, input, credentials as any);
      }

      case 'salesloft': {
        const { executeSalesLoft } = await import('./connectors/salesLoft');
        return executeSalesLoft(actionId, input, credentials as any);
      }

      case 'gong': {
        const { executeGong } = await import('./connectors/gong');
        return executeGong(actionId, input, credentials as any);
      }

      case 'aws_s3': {
        const { executeAWSS3 } = await import('./connectors/awsS3');
        return executeAWSS3(actionId, input, credentials as any);
      }

      case 'magento': {
        const { executeMagento } = await import('./connectors/magento');
        return executeMagento(actionId, input, credentials as any);
      }

      case 'microsoft_dynamics_365': {
        const { executeMicrosoftDynamics365 } = await import('./connectors/microsoftDynamics365');
        return executeMicrosoftDynamics365(actionId, input, credentials as any);
      }

      case 'sugarcrm': {
        const { executeSugarCRM } = await import('./connectors/sugarCRM');
        return executeSugarCRM(actionId, input, credentials as any);
      }

      case 'microsoft_sql_server': {
        const { executeMicrosoftSQLServer } = await import('./connectors/microsoftSQLServer');
        return executeMicrosoftSQLServer(actionId, input, credentials as any);
      }

      case 'amazon_rds': {
        const { executeAmazonRDS } = await import('./connectors/amazonRDS');
        return executeAmazonRDS(actionId, input, credentials as any);
      }

      case 'dynamodb': {
        const { executeDynamoDB } = await import('./connectors/dynamoDB');
        return executeDynamoDB(actionId, input, credentials as any);
      }

      case 'whatsapp': {
        const { executeWhatsApp } = await import('./connectors/whatsapp');
        return executeWhatsApp(actionId, input, credentials as any);
      }

      case 'vonage': {
        const { executeVonage } = await import('./connectors/vonage');
        return executeVonage(actionId, input, credentials as any);
      }

      case 'google_cloud_platform': {
        const { executeGoogleCloudPlatform } = await import('./connectors/googleCloudPlatform');
        return executeGoogleCloudPlatform(actionId, input, credentials as any);
      }

      case 'squarespace_commerce': {
        const { executeSquarespaceCommerce } = await import('./connectors/squarespaceCommerce');
        return executeSquarespaceCommerce(actionId, input, credentials as any);
      }

      case 'etsy': {
        const { executeEtsy } = await import('./connectors/etsy');
        return executeEtsy(actionId, input, credentials as any);
      }

      case 'aws': {
        const { executeAWS } = await import('./connectors/aws');
        return executeAWS(actionId, input, credentials as any);
      }

      case 'microsoft_azure': {
        const { executeMicrosoftAzure } = await import('./connectors/microsoftAzure');
        return executeMicrosoftAzure(actionId, input, credentials as any);
      }

      case 'linkedin': {
        const { executeLinkedIn } = await import('./connectors/linkedin');
        return executeLinkedIn(actionId, input, credentials as any);
      }

      case 'twitter': {
        const { executeTwitter } = await import('./connectors/twitter');
        return executeTwitter(actionId, input, credentials as any);
      }

      case 'facebook': {
        const { executeFacebook } = await import('./connectors/facebook');
        return executeFacebook(actionId, input, credentials as any);
      }

      case 'instagram': {
        const { executeInstagram } = await import('./connectors/instagram');
        return executeInstagram(actionId, input, credentials as any);
      }

      case 'youtube': {
        const { executeYouTube } = await import('./connectors/youtube');
        return executeYouTube(actionId, input, credentials as any);
      }

      case 'wordpress': {
        const { executeWordPress } = await import('./connectors/wordpress');
        return executeWordPress(actionId, input, credentials as any);
      }

      case 'slack': {
        // Use existing Slack executor
        const { executeSlack } = await import('./slack');
        const context = {
          nodeId: `connector-${connectorId}`,
          workflowId: 'connector-execution',
          executionId: 'connector-execution',
          input,
          previousOutputs: {},
          config: nodeConfig,
        };
        return executeSlack(context);
      }

      case 'airtable': {
        // Use existing Airtable executor
        const { executeAirtable } = await import('./integrations');
        const context = {
          nodeId: `connector-${connectorId}`,
          workflowId: 'connector-execution',
          executionId: 'connector-execution',
          input,
          previousOutputs: {},
          config: nodeConfig,
        };
        return executeAirtable(context);
      }

      case 'google_sheets': {
        // Use existing Google Sheets executor
        const { executeGoogleSheets } = await import('./integrations');
        const context = {
          nodeId: `connector-${connectorId}`,
          workflowId: 'connector-execution',
          executionId: 'connector-execution',
          input,
          previousOutputs: {},
          config: nodeConfig,
        };
        return executeGoogleSheets(context);
      }

      default:
        // For connectors without specific executors, return a helpful error
        return {
          success: false,
          error: {
            message: `Connector ${connectorId} action ${actionId} execution is not yet fully implemented. Credentials are available.`,
            code: 'ACTION_NOT_IMPLEMENTED',
            metadata: {
              connectorId,
              actionId,
              hasCredentials: !!accessToken,
            },
          },
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'Action execution failed',
        code: 'ACTION_EXECUTION_ERROR',
        details: error,
      },
    };
  }
}

