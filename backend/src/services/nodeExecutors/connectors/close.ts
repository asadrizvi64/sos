/**
 * Close Connector Executor
 * 
 * Executes Close connector actions using the Close API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CloseCredentials {
  api_key: string;
}

/**
 * Create Close API client
 */
function createCloseClient(credentials: CloseCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.close.com/api/v1',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a lead in Close
 */
export async function executeCloseCreateLead(
  name: string,
  url?: string,
  description?: string,
  contacts?: Array<{
    name?: string;
    emails?: Array<{ email: string; type?: string }>;
    phones?: Array<{ phone: string; type?: string }>;
  }>,
  credentials: CloseCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCloseClient(credentials);
    
    const leadData: Record<string, unknown> = {
      name,
      ...(url && { url }),
      ...(description && { description }),
      ...(contacts && contacts.length > 0 && { contacts }),
    };

    const response = await client.post('/lead/', leadData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        url: response.data.url,
        status_id: response.data.status_id,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Close lead creation failed',
        code: 'CLOSE_CREATE_LEAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get leads from Close
 */
export async function executeCloseGetLeads(
  query?: string,
  limit: number = 25,
  credentials: CloseCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCloseClient(credentials);
    
    const params: Record<string, unknown> = {
      _limit: limit,
    };
    
    if (query) {
      params.query = query;
    }

    const response = await client.get('/lead/', { params });

    return {
      success: true,
      output: {
        data: response.data.data || [],
        has_more: response.data.has_more,
        next_cursor: response.data.next_cursor,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Close get leads failed',
        code: 'CLOSE_GET_LEADS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Close connector action
 */
export async function executeClose(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CloseCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_lead':
      const name = input.name as string;
      const url = input.url as string | undefined;
      const description = input.description as string | undefined;
      const contacts = input.contacts as Array<{
        name?: string;
        emails?: Array<{ email: string; type?: string }>;
        phones?: Array<{ phone: string; type?: string }>;
      }> | undefined;
      
      if (!name) {
        return {
          success: false,
          error: {
            message: 'name is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCloseCreateLead(name, url, description, contacts, credentials);

    case 'get_leads':
      const query = input.query as string | undefined;
      const limit = (input.limit as number) || 25;
      return executeCloseGetLeads(query, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Close action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

