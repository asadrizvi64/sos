/**
 * Intercom Connector Executor
 * 
 * Executes Intercom connector actions using the Intercom REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface IntercomCredentials {
  access_token: string;
}

/**
 * Create Intercom API client
 */
function createIntercomClient(credentials: IntercomCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.intercom.io',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'Intercom-Version': '2.10',
    },
  });
}

/**
 * Create a conversation in Intercom
 */
export async function executeIntercomCreateConversation(
  userId: string,
  body: string,
  type: 'user' | 'lead' = 'user',
  credentials: IntercomCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createIntercomClient(credentials);
    
    const conversationData = {
      from: {
        type,
        id: userId,
      },
      body,
    };

    const response = await client.post('/conversations', conversationData);

    return {
      success: true,
      output: {
        id: response.data.id,
        created_at: response.data.created_at,
        state: response.data.state,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Intercom conversation creation failed',
        code: 'INTERCOM_CREATE_CONVERSATION_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get conversations from Intercom
 */
export async function executeIntercomGetConversations(
  limit: number = 10,
  credentials: IntercomCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createIntercomClient(credentials);
    
    const params = {
      per_page: limit,
    };

    const response = await client.get('/conversations', { params });

    return {
      success: true,
      output: {
        conversations: response.data.conversations || [],
        total_count: response.data.total_count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Intercom get conversations failed',
        code: 'INTERCOM_GET_CONVERSATIONS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Intercom connector action
 */
export async function executeIntercom(
  actionId: string,
  input: Record<string, unknown>,
  credentials: IntercomCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_conversation':
      const userId = input.userId as string;
      const body = input.body as string;
      const type = (input.type as 'user' | 'lead') || 'user';
      
      if (!userId || !body) {
        return {
          success: false,
          error: {
            message: 'userId and body are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeIntercomCreateConversation(userId, body, type, credentials);

    case 'get_conversations':
      const limit = (input.limit as number) || 10;
      return executeIntercomGetConversations(limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Intercom action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

