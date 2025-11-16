/**
 * Klaviyo Connector Executor
 * 
 * Executes Klaviyo connector actions using the Klaviyo API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface KlaviyoCredentials {
  api_key: string;
}

/**
 * Create Klaviyo API client
 */
function createKlaviyoClient(credentials: KlaviyoCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://a.klaviyo.com/api',
    headers: {
      'Authorization': `Klaviyo-API-Key ${credentials.api_key}`,
      'revision': '2024-02-15',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create or update a profile in Klaviyo
 */
export async function executeKlaviyoCreateProfile(
  email: string,
  firstName?: string,
  lastName?: string,
  phoneNumber?: string,
  properties?: Record<string, unknown>,
  credentials: KlaviyoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createKlaviyoClient(credentials);
    
    const profileData: Record<string, unknown> = {
      data: {
        type: 'profile',
        attributes: {
          email,
          ...(firstName && { first_name: firstName }),
          ...(lastName && { last_name: lastName }),
          ...(phoneNumber && { phone_number: phoneNumber }),
          ...(properties && Object.keys(properties).length > 0 && { properties }),
        },
      },
    };

    const response = await client.post('/profiles/', profileData);

    return {
      success: true,
      output: {
        id: response.data.data.id,
        email: response.data.data.attributes.email,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Klaviyo profile creation failed',
        code: 'KLAVIYO_CREATE_PROFILE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Subscribe a profile to a list in Klaviyo
 */
export async function executeKlaviyoSubscribeToList(
  email: string,
  listId: string,
  credentials: KlaviyoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createKlaviyoClient(credentials);
    
    const subscriptionData = {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [
              {
                type: 'profile',
                attributes: {
                  email,
                },
              },
            ],
          },
        },
        relationships: {
          list: {
            data: {
              type: 'list',
              id: listId,
            },
          },
        },
      },
    };

    const response = await client.post('/profile-subscription-bulk-create-jobs/', subscriptionData);

    return {
      success: true,
      output: {
        job_id: response.data.data.id,
        status: response.data.data.attributes.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Klaviyo subscribe to list failed',
        code: 'KLAVIYO_SUBSCRIBE_LIST_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Klaviyo connector action
 */
export async function executeKlaviyo(
  actionId: string,
  input: Record<string, unknown>,
  credentials: KlaviyoCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_profile':
      const email = input.email as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const phoneNumber = input.phoneNumber as string | undefined;
      const properties = input.properties as Record<string, unknown> | undefined;
      
      if (!email) {
        return {
          success: false,
          error: {
            message: 'email is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeKlaviyoCreateProfile(email, firstName, lastName, phoneNumber, properties, credentials);

    case 'subscribe_to_list':
      const subscribeEmail = input.email as string;
      const listId = input.listId as string;
      
      if (!subscribeEmail || !listId) {
        return {
          success: false,
          error: {
            message: 'email and listId are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeKlaviyoSubscribeToList(subscribeEmail, listId, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Klaviyo action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

