/**
 * Crisp Connector Executor
 * 
 * Executes Crisp connector actions using the Crisp API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CrispCredentials {
  identifier: string;
  key: string;
}

/**
 * Create Crisp API client
 */
function createCrispClient(credentials: CrispCredentials): AxiosInstance {
  const auth = Buffer.from(`${credentials.identifier}:${credentials.key}`).toString('base64');
  
  return axios.create({
    baseURL: 'https://api.crisp.chat/v1',
    headers: {
      'Authorization': `Basic ${auth}`,
      'X-Crisp-Tier': 'plugin',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Send a message in Crisp
 */
export async function executeCrispSendMessage(
  websiteId: string,
  sessionId: string,
  content: string,
  type: 'text' | 'file' | 'animation' | 'audio' | 'picker' = 'text',
  from: 'user' | 'operator' = 'operator',
  credentials: CrispCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCrispClient(credentials);
    
    const messageData = {
      type,
      content,
      from,
    };

    const response = await client.post(`/website/${websiteId}/conversation/${sessionId}/message`, messageData);

    return {
      success: true,
      output: {
        timestamp: response.data.data.timestamp,
        fingerprint: response.data.data.fingerprint,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.reason || error.message || 'Crisp send message failed',
        code: 'CRISP_SEND_MESSAGE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get conversations from Crisp
 */
export async function executeCrispGetConversations(
  websiteId: string,
  pageNumber: number = 1,
  credentials: CrispCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCrispClient(credentials);
    
    const params = {
      page_number: pageNumber,
    };

    const response = await client.get(`/website/${websiteId}/conversation/list`, { params });

    return {
      success: true,
      output: {
        conversations: response.data.data || [],
        count: response.data.count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.reason || error.message || 'Crisp get conversations failed',
        code: 'CRISP_GET_CONVERSATIONS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Crisp connector action
 */
export async function executeCrisp(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CrispCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'send_message':
      const websiteId = input.websiteId as string;
      const sessionId = input.sessionId as string;
      const content = input.content as string;
      const type = (input.type as 'text' | 'file' | 'animation' | 'audio' | 'picker') || 'text';
      const from = (input.from as 'user' | 'operator') || 'operator';
      
      if (!websiteId || !sessionId || !content) {
        return {
          success: false,
          error: {
            message: 'websiteId, sessionId, and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCrispSendMessage(websiteId, sessionId, content, type, from, credentials);

    case 'get_conversations':
      const getWebsiteId = input.websiteId as string;
      const pageNumber = (input.pageNumber as number) || 1;
      
      if (!getWebsiteId) {
        return {
          success: false,
          error: {
            message: 'websiteId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCrispGetConversations(getWebsiteId, pageNumber, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Crisp action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

