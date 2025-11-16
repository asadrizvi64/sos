/**
 * SugarCRM Connector Executor
 * 
 * Executes SugarCRM connector actions using the SugarCRM REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface SugarCRMCredentials {
  access_token: string;
  instance_url: string; // e.g., 'https://yourinstance.sugarcrm.com'
}

/**
 * Create SugarCRM API client
 */
function createSugarCRMClient(credentials: SugarCRMCredentials): AxiosInstance {
  const baseURL = credentials.instance_url.endsWith('/')
    ? `${credentials.instance_url}rest/v11`
    : `${credentials.instance_url}/rest/v11`;
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a record in SugarCRM
 */
export async function executeSugarCRMCreateRecord(
  module: string, // e.g., 'Contacts', 'Accounts', 'Leads', 'Opportunities'
  data: Record<string, unknown>,
  credentials: SugarCRMCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSugarCRMClient(credentials);
    
    const response = await client.post(`/${module}`, data);

    return {
      success: true,
      output: {
        id: response.data.id,
        module,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.response?.data?.error_message || error.message || 'SugarCRM record creation failed',
        code: 'SUGARCRM_CREATE_RECORD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get records from SugarCRM
 */
export async function executeSugarCRMGetRecords(
  module: string,
  filter?: Array<{
    name: string;
    operator: string;
    value: string | number | boolean;
  }>,
  fields?: string[], // Array of field names to return
  maxResults?: number,
  offset?: number,
  orderBy?: string,
  credentials: SugarCRMCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSugarCRMClient(credentials);
    
    const params: Record<string, unknown> = {};
    
    if (filter && filter.length > 0) {
      params.filter = filter;
    }
    if (fields && fields.length > 0) {
      params.fields = fields;
    }
    if (maxResults) {
      params.max_num = maxResults;
    }
    if (offset) {
      params.offset = offset;
    }
    if (orderBy) {
      params.order_by = orderBy;
    }

    const response = await client.get(`/${module}`, { params });

    return {
      success: true,
      output: {
        records: response.data.records || [],
        next_offset: response.data.next_offset,
        record_count: response.data.record_count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.response?.data?.error_message || error.message || 'SugarCRM get records failed',
        code: 'SUGARCRM_GET_RECORDS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute SugarCRM connector action
 */
export async function executeSugarCRM(
  actionId: string,
  input: Record<string, unknown>,
  credentials: SugarCRMCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_record':
      const module = input.module as string;
      const data = input.data as Record<string, unknown>;
      
      if (!module || !data) {
        return {
          success: false,
          error: {
            message: 'module and data are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeSugarCRMCreateRecord(module, data, credentials);

    case 'get_records':
      const getModule = input.module as string;
      const filter = input.filter as Array<{
        name: string;
        operator: string;
        value: string | number | boolean;
      }> | undefined;
      const fields = input.fields as string[] | undefined;
      const maxResults = input.maxResults as number | undefined;
      const offset = input.offset as number | undefined;
      const orderBy = input.orderBy as string | undefined;
      
      if (!getModule) {
        return {
          success: false,
          error: {
            message: 'module is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeSugarCRMGetRecords(getModule, filter, fields, maxResults, offset, orderBy, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown SugarCRM action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

