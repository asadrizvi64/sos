/**
 * Microsoft Azure Connector Executor
 * 
 * Executes Microsoft Azure connector actions
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface AzureCredentials {
  access_token: string;
  subscription_id?: string;
}

/**
 * Create Azure API client
 */
function createAzureClient(credentials: AzureCredentials, resource: string = 'https://management.azure.com'): AxiosInstance {
  return axios.create({
    baseURL: `https://management.azure.com`,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Execute a generic Azure API call
 */
export async function executeAzureOperation(
  resourcePath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>,
  credentials: AzureCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createAzureClient(credentials);
    
    const url = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
    const apiVersion = '2021-04-01'; // Default API version
    
    const fullUrl = `${url}?api-version=${apiVersion}`;
    
    let response;
    switch (method) {
      case 'GET':
        response = await client.get(fullUrl);
        break;
      case 'POST':
        response = await client.post(fullUrl, body);
        break;
      case 'PUT':
        response = await client.put(fullUrl, body);
        break;
      case 'DELETE':
        response = await client.delete(fullUrl);
        break;
    }
    
    return {
      success: true,
      output: {
        data: response.data,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Azure operation failed',
        code: 'AZURE_OPERATION_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Microsoft Azure connector action
 */
export async function executeMicrosoftAzure(
  actionId: string,
  input: Record<string, unknown>,
  credentials: AzureCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'execute_operation':
      const resourcePath = input.resourcePath as string;
      const method = (input.method as 'GET' | 'POST' | 'PUT' | 'DELETE') || 'GET';
      const body = input.body as Record<string, unknown> | undefined;
      
      if (!resourcePath) {
        return {
          success: false,
          error: {
            message: 'resourcePath is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeAzureOperation(resourcePath, method, body, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Microsoft Azure action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

