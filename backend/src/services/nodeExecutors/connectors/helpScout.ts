/**
 * Help Scout Connector Executor
 * 
 * Executes Help Scout connector actions using the Help Scout API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface HelpScoutCredentials {
  app_id: string;
  app_secret: string;
}

/**
 * Get access token from Help Scout
 */
async function getHelpScoutAccessToken(credentials: HelpScoutCredentials): Promise<string> {
  const response = await axios.post('https://api.helpscout.net/v2/oauth2/token', {
    grant_type: 'client_credentials',
    client_id: credentials.app_id,
    client_secret: credentials.app_secret,
  });

  return response.data.access_token;
}

/**
 * Create Help Scout API client
 */
async function createHelpScoutClient(credentials: HelpScoutCredentials): Promise<AxiosInstance> {
  const accessToken = await getHelpScoutAccessToken(credentials);
  
  return axios.create({
    baseURL: 'https://api.helpscout.net/v2',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a conversation in Help Scout
 */
export async function executeHelpScoutCreateConversation(
  mailboxId: string,
  subject: string,
  customerEmail: string,
  text: string,
  type: 'email' | 'chat' | 'phone' | 'voicemail' = 'email',
  credentials: HelpScoutCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = await createHelpScoutClient(credentials);
    
    const conversationData = {
      subject,
      mailboxId: parseInt(mailboxId),
      type,
      customer: {
        email: customerEmail,
      },
      threads: [
        {
          type: 'customer',
          customer: {
            email: customerEmail,
          },
          text,
        },
      ],
    };

    const response = await client.post('/conversations', conversationData);

    return {
      success: true,
      output: {
        id: response.data.resource.id,
        number: response.data.resource.number,
        subject: response.data.resource.subject,
        status: response.data.resource.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Help Scout conversation creation failed',
        code: 'HELPSCOUT_CREATE_CONVERSATION_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get conversations from Help Scout
 */
export async function executeHelpScoutGetConversations(
  mailboxId?: string,
  status?: 'open' | 'pending' | 'closed' | 'spam',
  page: number = 1,
  credentials: HelpScoutCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = await createHelpScoutClient(credentials);
    
    const params: Record<string, unknown> = {
      page,
    };
    
    if (mailboxId) {
      params.mailbox = mailboxId;
    }
    if (status) {
      params.status = status;
    }

    const response = await client.get('/conversations', { params });

    return {
      success: true,
      output: {
        conversations: response.data._embedded?.conversations || [],
        page: response.data.page,
        totalPages: response.data.page?.totalPages,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Help Scout get conversations failed',
        code: 'HELPSCOUT_GET_CONVERSATIONS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Help Scout connector action
 */
export async function executeHelpScout(
  actionId: string,
  input: Record<string, unknown>,
  credentials: HelpScoutCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_conversation':
      const mailboxId = input.mailboxId as string;
      const subject = input.subject as string;
      const customerEmail = input.customerEmail as string;
      const text = input.text as string;
      const type = (input.type as 'email' | 'chat' | 'phone' | 'voicemail') || 'email';
      
      if (!mailboxId || !subject || !customerEmail || !text) {
        return {
          success: false,
          error: {
            message: 'mailboxId, subject, customerEmail, and text are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeHelpScoutCreateConversation(mailboxId, subject, customerEmail, text, type, credentials);

    case 'get_conversations':
      const getMailboxId = input.mailboxId as string | undefined;
      const status = input.status as 'open' | 'pending' | 'closed' | 'spam' | undefined;
      const page = (input.page as number) || 1;
      return executeHelpScoutGetConversations(getMailboxId, status, page, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Help Scout action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

