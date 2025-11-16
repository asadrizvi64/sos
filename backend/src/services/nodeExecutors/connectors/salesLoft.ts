/**
 * SalesLoft Connector Executor
 * 
 * Executes SalesLoft connector actions using the SalesLoft API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface SalesLoftCredentials {
  access_token: string;
}

/**
 * Create SalesLoft API client
 */
function createSalesLoftClient(credentials: SalesLoftCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.salesloft.com/v2',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a person in SalesLoft
 */
export async function executeSalesLoftCreatePerson(
  email: string,
  firstName?: string,
  lastName?: string,
  title?: string,
  companyName?: string,
  tags?: string[],
  credentials: SalesLoftCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSalesLoftClient(credentials);
    
    const personData: Record<string, unknown> = {
      email_address: email,
      ...(firstName && { first_name: firstName }),
      ...(lastName && { last_name: lastName }),
      ...(title && { title }),
      ...(company_name && { company_name: companyName }),
      ...(tags && tags.length > 0 && { tags }),
    };

    const response = await client.post('/people.json', personData);

    return {
      success: true,
      output: {
        id: response.data.data.id,
        email_address: response.data.data.email_address,
        first_name: response.data.data.first_name,
        last_name: response.data.data.last_name,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'SalesLoft person creation failed',
        code: 'SALESLOFT_CREATE_PERSON_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get people from SalesLoft
 */
export async function executeSalesLoftGetPeople(
  perPage: number = 25,
  page: number = 1,
  credentials: SalesLoftCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSalesLoftClient(credentials);
    
    const params = {
      per_page: perPage,
      page,
    };

    const response = await client.get('/people.json', { params });

    return {
      success: true,
      output: {
        data: response.data.data || [],
        metadata: response.data.metadata,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'SalesLoft get people failed',
        code: 'SALESLOFT_GET_PEOPLE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute SalesLoft connector action
 */
export async function executeSalesLoft(
  actionId: string,
  input: Record<string, unknown>,
  credentials: SalesLoftCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_person':
      const email = input.email as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const title = input.title as string | undefined;
      const companyName = input.companyName as string | undefined;
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
      return executeSalesLoftCreatePerson(email, firstName, lastName, title, companyName, tags, credentials);

    case 'get_people':
      const perPage = (input.perPage as number) || 25;
      const page = (input.page as number) || 1;
      return executeSalesLoftGetPeople(perPage, page, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown SalesLoft action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

