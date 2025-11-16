/**
 * Constant Contact Connector Executor
 * 
 * Executes Constant Contact connector actions using the Constant Contact API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ConstantContactCredentials {
  access_token: string;
  api_key?: string;
}

/**
 * Create Constant Contact API client
 */
function createConstantContactClient(credentials: ConstantContactCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.cc.email/v3',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      ...(credentials.api_key && { 'X-API-Key': credentials.api_key }),
    },
  });
}

/**
 * Add a contact to Constant Contact
 */
export async function executeConstantContactAddContact(
  emailAddress: string,
  firstName?: string,
  lastName?: string,
  listMemberships?: string[],
  customFields?: Array<{ custom_field_id: string; value: string }>,
  credentials: ConstantContactCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createConstantContactClient(credentials);
    
    const contactData: Record<string, unknown> = {
      email_address: {
        address: emailAddress,
        permission_to_send: 'explicit',
      },
      ...(firstName && { first_name: firstName }),
      ...(lastName && { last_name: lastName }),
      ...(listMemberships && listMemberships.length > 0 && {
        list_memberships: listMemberships.map(listId => ({ list_id: listId })),
      }),
      ...(customFields && customFields.length > 0 && { custom_fields: customFields }),
    };

    const response = await client.post('/contacts', contactData);

    return {
      success: true,
      output: {
        contact_id: response.data.contact_id,
        email_address: response.data.email_address,
        first_name: response.data.first_name,
        last_name: response.data.last_name,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error_key || error.message || 'Constant Contact add contact failed',
        code: 'CONSTANTCONTACT_ADD_CONTACT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get contacts from Constant Contact
 */
export async function executeConstantContactGetContacts(
  limit: number = 500,
  email?: string,
  credentials: ConstantContactCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createConstantContactClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (email) {
      params.email = email;
    }

    const response = await client.get('/contacts', { params });

    return {
      success: true,
      output: {
        contacts: response.data.contacts || [],
        _links: response.data._links,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error_key || error.message || 'Constant Contact get contacts failed',
        code: 'CONSTANTCONTACT_GET_CONTACTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Constant Contact connector action
 */
export async function executeConstantContact(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ConstantContactCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'add_contact':
      const emailAddress = input.emailAddress as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const listMemberships = input.listMemberships as string[] | undefined;
      const customFields = input.customFields as Array<{ custom_field_id: string; value: string }> | undefined;
      
      if (!emailAddress) {
        return {
          success: false,
          error: {
            message: 'emailAddress is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeConstantContactAddContact(emailAddress, firstName, lastName, listMemberships, customFields, credentials);

    case 'get_contacts':
      const limit = (input.limit as number) || 500;
      const email = input.email as string | undefined;
      return executeConstantContactGetContacts(limit, email, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Constant Contact action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

