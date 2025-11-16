/**
 * Campaign Monitor Connector Executor
 * 
 * Executes Campaign Monitor connector actions using the Campaign Monitor API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CampaignMonitorCredentials {
  api_key: string;
  client_id?: string;
}

/**
 * Create Campaign Monitor API client
 */
function createCampaignMonitorClient(credentials: CampaignMonitorCredentials): AxiosInstance {
  const auth = Buffer.from(`${credentials.api_key}:x`).toString('base64');
  const baseURL = credentials.client_id
    ? `https://api.createsend.com/api/v3.2/clients/${credentials.client_id}`
    : 'https://api.createsend.com/api/v3.2';
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Add a subscriber to Campaign Monitor
 */
export async function executeCampaignMonitorAddSubscriber(
  listId: string,
  email: string,
  name?: string,
  customFields?: Array<{ Key: string; Value: string }>,
  resubscribe: boolean = false,
  credentials: CampaignMonitorCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCampaignMonitorClient(credentials);
    
    const subscriberData: Record<string, unknown> = {
      EmailAddress: email,
      ...(name && { Name: name }),
      ...(customFields && customFields.length > 0 && { CustomFields: customFields }),
      Resubscribe: resubscribe,
      RestartSubscriptionBasedAutoresponders: resubscribe,
    };

    const response = await client.post(`/subscribers/${listId}.json`, subscriberData);

    return {
      success: true,
      output: {
        emailAddress: response.data.EmailAddress,
        name: response.data.Name,
        state: response.data.State,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.Message || error.message || 'Campaign Monitor add subscriber failed',
        code: 'CAMPAIGNMONITOR_ADD_SUBSCRIBER_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get subscribers from Campaign Monitor
 */
export async function executeCampaignMonitorGetSubscribers(
  listId: string,
  page: number = 1,
  pageSize: number = 1000,
  orderField: string = 'email',
  orderDirection: 'asc' | 'desc' = 'asc',
  credentials: CampaignMonitorCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCampaignMonitorClient(credentials);
    
    const params = {
      page,
      pagesize: pageSize,
      orderfield: orderField,
      orderdirection: orderDirection,
    };

    const response = await client.get(`/subscribers/${listId}.json`, { params });

    return {
      success: true,
      output: {
        Results: response.data.Results || [],
        ResultsOrderedBy: response.data.ResultsOrderedBy,
        OrderDirection: response.data.OrderDirection,
        PageNumber: response.data.PageNumber,
        PageSize: response.data.PageSize,
        RecordsOnThisPage: response.data.RecordsOnThisPage,
        TotalNumberOfRecords: response.data.TotalNumberOfRecords,
        NumberOfPages: response.data.NumberOfPages,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.Message || error.message || 'Campaign Monitor get subscribers failed',
        code: 'CAMPAIGNMONITOR_GET_SUBSCRIBERS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Campaign Monitor connector action
 */
export async function executeCampaignMonitor(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CampaignMonitorCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'add_subscriber':
      const listId = input.listId as string;
      const email = input.email as string;
      const name = input.name as string | undefined;
      const customFields = input.customFields as Array<{ Key: string; Value: string }> | undefined;
      const resubscribe = (input.resubscribe as boolean) || false;
      
      if (!listId || !email) {
        return {
          success: false,
          error: {
            message: 'listId and email are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCampaignMonitorAddSubscriber(listId, email, name, customFields, resubscribe, credentials);

    case 'get_subscribers':
      const getListId = input.listId as string;
      const page = (input.page as number) || 1;
      const pageSize = (input.pageSize as number) || 1000;
      const orderField = (input.orderField as string) || 'email';
      const orderDirection = (input.orderDirection as 'asc' | 'desc') || 'asc';
      
      if (!getListId) {
        return {
          success: false,
          error: {
            message: 'listId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCampaignMonitorGetSubscribers(getListId, page, pageSize, orderField, orderDirection, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Campaign Monitor action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

