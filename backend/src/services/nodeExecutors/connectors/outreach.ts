/**
 * Outreach Connector Executor
 * 
 * Executes Outreach connector actions using the Outreach API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface OutreachCredentials {
  access_token: string;
  client_id?: string;
  client_secret?: string;
}

/**
 * Create Outreach API client
 */
function createOutreachClient(credentials: OutreachCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.outreach.io/api/v2',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/vnd.api+json',
    },
  });
}

/**
 * Create a prospect in Outreach
 */
export async function executeOutreachCreateProspect(
  email: string,
  firstName?: string,
  lastName?: string,
  title?: string,
  company?: string,
  tags?: string[],
  credentials: OutreachCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createOutreachClient(credentials);
    
    const prospectData = {
      data: {
        type: 'prospect',
        attributes: {
          emails: [{ email, status: 'verified' }],
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(title && { title }),
          ...(company && { company }),
          ...(tags && tags.length > 0 && { tags }),
        },
      },
    };

    const response = await client.post('/prospects', prospectData);

    return {
      success: true,
      output: {
        id: response.data.data.id,
        email: response.data.data.attributes.emails?.[0]?.email,
        firstName: response.data.data.attributes.firstName,
        lastName: response.data.data.attributes.lastName,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Outreach prospect creation failed',
        code: 'OUTREACH_CREATE_PROSPECT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get prospects from Outreach
 */
export async function executeOutreachGetProspects(
  limit: number = 25,
  filter?: Record<string, unknown>,
  credentials: OutreachCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createOutreachClient(credentials);
    
    const params: Record<string, unknown> = {
      'page[size]': limit,
    };
    
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        params[`filter[${key}]`] = value;
      });
    }

    const response = await client.get('/prospects', { params });

    return {
      success: true,
      output: {
        data: response.data.data || [],
        meta: response.data.meta,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Outreach get prospects failed',
        code: 'OUTREACH_GET_PROSPECTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Outreach connector action
 */
export async function executeOutreach(
  actionId: string,
  input: Record<string, unknown>,
  credentials: OutreachCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_prospect':
      const email = input.email as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const title = input.title as string | undefined;
      const company = input.company as string | undefined;
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
      return executeOutreachCreateProspect(email, firstName, lastName, title, company, tags, credentials);

    case 'get_prospects':
      const limit = (input.limit as number) || 25;
      const filter = input.filter as Record<string, unknown> | undefined;
      return executeOutreachGetProspects(limit, filter, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Outreach action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

