/**
 * ConvertKit Connector Executor
 * 
 * Executes ConvertKit connector actions using the ConvertKit API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ConvertKitCredentials {
  api_key: string;
  api_secret?: string;
}

/**
 * Create ConvertKit API client
 */
function createConvertKitClient(credentials: ConvertKitCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.convertkit.com/v3',
    params: {
      api_key: credentials.api_key,
      ...(credentials.api_secret && { api_secret: credentials.api_secret }),
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Add a subscriber to ConvertKit
 */
export async function executeConvertKitAddSubscriber(
  email: string,
  firstName?: string,
  tags?: number[],
  fields?: Record<string, unknown>,
  credentials: ConvertKitCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createConvertKitClient(credentials);
    
    const subscriberData: Record<string, unknown> = {
      email,
      ...(firstName && { first_name: firstName }),
      ...(tags && tags.length > 0 && { tags }),
      ...(fields && Object.keys(fields).length > 0 && { fields }),
    };

    const response = await client.post('/subscribers', subscriberData);

    return {
      success: true,
      output: {
        subscription: response.data.subscription,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'ConvertKit add subscriber failed',
        code: 'CONVERTKIT_ADD_SUBSCRIBER_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get subscribers from ConvertKit
 */
export async function executeConvertKitGetSubscribers(
  page: number = 1,
  credentials: ConvertKitCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createConvertKitClient(credentials);
    
    const params = {
      page,
    };

    const response = await client.get('/subscribers', { params });

    return {
      success: true,
      output: {
        subscribers: response.data.subscribers || [],
        total_subscribers: response.data.total_subscribers,
        page: response.data.page,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'ConvertKit get subscribers failed',
        code: 'CONVERTKIT_GET_SUBSCRIBERS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute ConvertKit connector action
 */
export async function executeConvertKit(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ConvertKitCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'add_subscriber':
      const email = input.email as string;
      const firstName = input.firstName as string | undefined;
      const tags = input.tags as number[] | undefined;
      const fields = input.fields as Record<string, unknown> | undefined;
      
      if (!email) {
        return {
          success: false,
          error: {
            message: 'email is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeConvertKitAddSubscriber(email, firstName, tags, fields, credentials);

    case 'get_subscribers':
      const page = (input.page as number) || 1;
      return executeConvertKitGetSubscribers(page, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown ConvertKit action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

