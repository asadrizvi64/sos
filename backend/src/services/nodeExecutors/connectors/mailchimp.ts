/**
 * Mailchimp Connector Executor
 * 
 * Executes Mailchimp connector actions using the Mailchimp API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface MailchimpCredentials {
  api_key: string;
  server?: string; // e.g., 'us1', 'us2', etc. (extracted from API key if not provided)
}

/**
 * Extract server prefix from Mailchimp API key
 */
function extractServer(apiKey: string): string {
  const parts = apiKey.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : 'us1';
}

/**
 * Create Mailchimp API client
 */
function createMailchimpClient(credentials: MailchimpCredentials): AxiosInstance {
  const server = credentials.server || extractServer(credentials.api_key);
  
  return axios.create({
    baseURL: `https://${server}.api.mailchimp.com/3.0`,
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Add or update a subscriber in Mailchimp
 */
export async function executeMailchimpAddSubscriber(
  listId: string,
  email: string,
  status: 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending' = 'subscribed',
  firstName?: string,
  lastName?: string,
  mergeFields?: Record<string, unknown>,
  credentials: MailchimpCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createMailchimpClient(credentials);
    
    const memberData: Record<string, unknown> = {
      email_address: email,
      status,
      ...(firstName || lastName) && {
        merge_fields: {
          ...(firstName && { FNAME: firstName }),
          ...(lastName && { LNAME: lastName }),
          ...mergeFields,
        },
      },
    };

    const response = await client.put(`/lists/${listId}/members/${Buffer.from(email).toString('base64url')}`, memberData);

    return {
      success: true,
      output: {
        id: response.data.id,
        email_address: response.data.email_address,
        status: response.data.status,
        list_id: response.data.list_id,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Mailchimp add subscriber failed',
        code: 'MAILCHIMP_ADD_SUBSCRIBER_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Create a campaign in Mailchimp
 */
export async function executeMailchimpCreateCampaign(
  listId: string,
  subject: string,
  fromName: string,
  replyTo: string,
  type: 'regular' | 'plaintext' | 'absplit' | 'rss' | 'variate' = 'regular',
  credentials: MailchimpCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createMailchimpClient(credentials);
    
    const campaignData = {
      type,
      recipients: {
        list_id: listId,
      },
      settings: {
        subject_line: subject,
        from_name: fromName,
        reply_to: replyTo,
      },
    };

    const response = await client.post('/campaigns', campaignData);

    return {
      success: true,
      output: {
        id: response.data.id,
        web_id: response.data.web_id,
        type: response.data.type,
        status: response.data.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Mailchimp campaign creation failed',
        code: 'MAILCHIMP_CREATE_CAMPAIGN_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Mailchimp connector action
 */
export async function executeMailchimp(
  actionId: string,
  input: Record<string, unknown>,
  credentials: MailchimpCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'add_subscriber':
      const listId = input.listId as string;
      const email = input.email as string;
      const status = (input.status as 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending') || 'subscribed';
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const mergeFields = input.mergeFields as Record<string, unknown> | undefined;
      
      if (!listId || !email) {
        return {
          success: false,
          error: {
            message: 'listId and email are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeMailchimpAddSubscriber(listId, email, status, firstName, lastName, mergeFields, credentials);

    case 'create_campaign':
      const campaignListId = input.listId as string;
      const subject = input.subject as string;
      const fromName = input.fromName as string;
      const replyTo = input.replyTo as string;
      const type = (input.type as 'regular' | 'plaintext' | 'absplit' | 'rss' | 'variate') || 'regular';
      
      if (!campaignListId || !subject || !fromName || !replyTo) {
        return {
          success: false,
          error: {
            message: 'listId, subject, fromName, and replyTo are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeMailchimpCreateCampaign(campaignListId, subject, fromName, replyTo, type, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Mailchimp action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

