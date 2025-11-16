/**
 * Clearbit Connector Executor
 * 
 * Executes Clearbit connector actions using the Clearbit API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ClearbitCredentials {
  api_key: string;
}

/**
 * Create Clearbit API client
 */
function createClearbitClient(credentials: ClearbitCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://person.clearbit.com/v2',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Enrich a person with Clearbit
 */
export async function executeClearbitEnrichPerson(
  email: string,
  credentials: ClearbitCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createClearbitClient(credentials);
    
    const params = {
      email,
    };

    const response = await client.get('/combined/find', { params });

    return {
      success: true,
      output: {
        person: response.data.person,
        company: response.data.company,
      },
    };
  } catch (error: any) {
    // Clearbit returns 404 if no data found, which is not necessarily an error
    if (error.response?.status === 404) {
      return {
        success: true,
        output: {
          person: null,
          company: null,
          message: 'No data found for this email',
        },
      };
    }
    
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Clearbit person enrichment failed',
        code: 'CLEARBIT_ENRICH_PERSON_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Enrich a company with Clearbit
 */
export async function executeClearbitEnrichCompany(
  domain: string,
  credentials: ClearbitCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createClearbitClient(credentials);
    
    const params = {
      domain,
    };

    const response = await client.get('/companies/find', { params });

    return {
      success: true,
      output: {
        company: response.data,
      },
    };
  } catch (error: any) {
    // Clearbit returns 404 if no data found, which is not necessarily an error
    if (error.response?.status === 404) {
      return {
        success: true,
        output: {
          company: null,
          message: 'No data found for this domain',
        },
      };
    }
    
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Clearbit company enrichment failed',
        code: 'CLEARBIT_ENRICH_COMPANY_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Clearbit connector action
 */
export async function executeClearbit(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ClearbitCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'enrich_person':
      const email = input.email as string;
      
      if (!email) {
        return {
          success: false,
          error: {
            message: 'email is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeClearbitEnrichPerson(email, credentials);

    case 'enrich_company':
      const domain = input.domain as string;
      
      if (!domain) {
        return {
          success: false,
          error: {
            message: 'domain is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeClearbitEnrichCompany(domain, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Clearbit action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

