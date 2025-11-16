/**
 * Drift Connector Executor
 * 
 * Executes Drift connector actions using the Drift API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface DriftCredentials {
  access_token: string;
}

/**
 * Create Drift API client
 */
function createDriftClient(credentials: DriftCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.drift.com/v1',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Send a message in Drift
 */
export async function executeDriftSendMessage(
  conversationId: number,
  body: string,
  type: 'chat' | 'private_note' = 'chat',
  credentials: DriftCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDriftClient(credentials);
    
    const messageData = {
      body,
      type,
    };

    const response = await client.post(`/conversations/${conversationId}/messages`, messageData);

    return {
      success: true,
      output: {
        id: response.data.data.id,
        body: response.data.data.body,
        createdAt: response.data.data.createdAt,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Drift send message failed',
        code: 'DRIFT_SEND_MESSAGE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get conversations from Drift
 */
export async function executeDriftGetConversations(
  limit: number = 20,
  cursor?: string,
  credentials: DriftCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDriftClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await client.get('/conversations', { params });

    return {
      success: true,
      output: {
        conversations: response.data.data || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Drift get conversations failed',
        code: 'DRIFT_GET_CONVERSATIONS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Drift connector action
 */
export async function executeDrift(
  actionId: string,
  input: Record<string, unknown>,
  credentials: DriftCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'send_message':
      const conversationId = input.conversationId as number;
      const body = input.body as string;
      const type = (input.type as 'chat' | 'private_note') || 'chat';
      
      if (!conversationId || !body) {
        return {
          success: false,
          error: {
            message: 'conversationId and body are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDriftSendMessage(conversationId, body, type, credentials);

    case 'get_conversations':
      const limit = (input.limit as number) || 20;
      const cursor = input.cursor as string | undefined;
      return executeDriftGetConversations(limit, cursor, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Drift action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

