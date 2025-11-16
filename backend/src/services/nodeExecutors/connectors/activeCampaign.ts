/**
 * ActiveCampaign Connector Executor
 * 
 * Executes ActiveCampaign connector actions using the ActiveCampaign API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ActiveCampaignCredentials {
  api_key: string;
  api_url: string; // e.g., 'https://youraccount.api-us1.com'
}

/**
 * Create ActiveCampaign API client
 */
function createActiveCampaignClient(credentials: ActiveCampaignCredentials): AxiosInstance {
  const baseURL = credentials.api_url.endsWith('/') 
    ? `${credentials.api_url}api/3` 
    : `${credentials.api_url}/api/3`;
  
  return axios.create({
    baseURL,
    headers: {
      'Api-Token': credentials.api_key,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create or update a contact in ActiveCampaign
 */
export async function executeActiveCampaignCreateContact(
  email: string,
  firstName?: string,
  lastName?: string,
  phone?: string,
  tags?: string[],
  credentials: ActiveCampaignCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createActiveCampaignClient(credentials);
    
    const contactData: Record<string, unknown> = {
      contact: {
        email,
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phone && { phone }),
      },
    };

    const response = await client.post('/contacts', contactData);
    
    // Add tags if provided
    if (tags && tags.length > 0 && response.data.contact) {
      const contactId = response.data.contact.id;
      for (const tag of tags) {
        try {
          await client.post('/contactTags', {
            contactTag: {
              contact: contactId,
              tag: tag,
            },
          });
        } catch (tagError) {
          // Tag might already exist or be invalid, continue
          console.warn(`Failed to add tag ${tag}:`, tagError);
        }
      }
    }

    return {
      success: true,
      output: {
        id: response.data.contact.id,
        email: response.data.contact.email,
        firstName: response.data.contact.firstName,
        lastName: response.data.contact.lastName,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'ActiveCampaign contact creation failed',
        code: 'ACTIVECAMPAIGN_CREATE_CONTACT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get contacts from ActiveCampaign
 */
export async function executeActiveCampaignGetContacts(
  limit: number = 100,
  offset: number = 0,
  email?: string,
  credentials: ActiveCampaignCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createActiveCampaignClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
      offset,
    };
    
    if (email) {
      params['filters[email]'] = email;
    }

    const response = await client.get('/contacts', { params });

    return {
      success: true,
      output: {
        contacts: response.data.contacts || [],
        meta: response.data.meta,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'ActiveCampaign get contacts failed',
        code: 'ACTIVECAMPAIGN_GET_CONTACTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute ActiveCampaign connector action
 */
export async function executeActiveCampaign(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ActiveCampaignCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_contact':
      const email = input.email as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const phone = input.phone as string | undefined;
      const tags = input.tags as string[] | undefined;
      
      if (!email) {
        return {
          success: false,
          error: {
            message: 'email is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeActiveCampaignCreateContact(email, firstName, lastName, phone, tags, credentials);

    case 'get_contacts':
      const limit = (input.limit as number) || 100;
      const offset = (input.offset as number) || 0;
      const contactEmail = input.email as string | undefined;
      return executeActiveCampaignGetContacts(limit, offset, contactEmail, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown ActiveCampaign action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

