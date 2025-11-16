/**
 * Gong Connector Executor
 * 
 * Executes Gong connector actions using the Gong API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface GongCredentials {
  access_key: string;
  access_key_secret: string;
}

/**
 * Create Gong API client
 */
function createGongClient(credentials: GongCredentials): AxiosInstance {
  // Gong uses access key and secret for authentication
  const auth = Buffer.from(`${credentials.access_key}:${credentials.access_key_secret}`).toString('base64');
  
  return axios.create({
    baseURL: 'https://api.gong.io/v2',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Get calls from Gong
 */
export async function executeGongGetCalls(
  fromDate?: string, // ISO 8601 format
  toDate?: string, // ISO 8601 format
  limit: number = 100,
  cursor?: string,
  credentials: GongCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGongClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (fromDate) {
      params.fromDateTime = fromDate;
    }
    if (toDate) {
      params.toDateTime = toDate;
    }
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await client.get('/calls', { params });

    return {
      success: true,
      output: {
        calls: response.data.calls || [],
        records: response.data.records,
        cursor: response.data.cursor,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Gong get calls failed',
        code: 'GONG_GET_CALLS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get call details from Gong
 */
export async function executeGongGetCallDetails(
  callId: string,
  credentials: GongCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGongClient(credentials);
    
    const response = await client.get(`/calls/${callId}`);

    return {
      success: true,
      output: {
        call: response.data.call,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Gong get call details failed',
        code: 'GONG_GET_CALL_DETAILS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Gong connector action
 */
export async function executeGong(
  actionId: string,
  input: Record<string, unknown>,
  credentials: GongCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'get_calls':
      const fromDate = input.fromDate as string | undefined;
      const toDate = input.toDate as string | undefined;
      const limit = (input.limit as number) || 100;
      const cursor = input.cursor as string | undefined;
      return executeGongGetCalls(fromDate, toDate, limit, cursor, credentials);

    case 'get_call_details':
      const callId = input.callId as string;
      
      if (!callId) {
        return {
          success: false,
          error: {
            message: 'callId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeGongGetCallDetails(callId, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Gong action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

