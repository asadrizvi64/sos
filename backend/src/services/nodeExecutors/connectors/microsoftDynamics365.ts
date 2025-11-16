/**
 * Microsoft Dynamics 365 Connector Executor
 * 
 * Executes Microsoft Dynamics 365 connector actions using the Dynamics 365 Web API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface Dynamics365Credentials {
  access_token: string;
  instance_url: string; // e.g., 'https://yourorg.crm.dynamics.com'
}

/**
 * Create Dynamics 365 API client
 */
function createDynamics365Client(credentials: Dynamics365Credentials): AxiosInstance {
  const baseURL = credentials.instance_url.endsWith('/')
    ? `${credentials.instance_url}api/data/v9.2`
    : `${credentials.instance_url}/api/data/v9.2`;
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  });
}

/**
 * Create a record in Dynamics 365
 */
export async function executeDynamics365CreateRecord(
  entitySetName: string, // e.g., 'contacts', 'accounts', 'leads'
  data: Record<string, unknown>,
  credentials: Dynamics365Credentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDynamics365Client(credentials);
    
    const response = await client.post(`/${entitySetName}`, data);

    // Dynamics 365 returns the ID in the OData-EntityId header
    const entityId = response.headers['odata-entityid']?.split('(')[1]?.split(')')[0] || 
                     response.headers['odata-entityid']?.split("'")[1] || 
                     'unknown';

    return {
      success: true,
      output: {
        id: entityId,
        entitySetName,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Dynamics 365 record creation failed',
        code: 'DYNAMICS365_CREATE_RECORD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get records from Dynamics 365
 */
export async function executeDynamics365GetRecords(
  entitySetName: string,
  filter?: string, // OData filter expression
  select?: string, // Comma-separated list of fields
  top?: number,
  orderBy?: string,
  credentials: Dynamics365Credentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDynamics365Client(credentials);
    
    const params: Record<string, unknown> = {};
    
    if (filter) {
      params.$filter = filter;
    }
    if (select) {
      params.$select = select;
    }
    if (top) {
      params.$top = top;
    }
    if (orderBy) {
      params.$orderby = orderBy;
    }

    const response = await client.get(`/${entitySetName}`, { params });

    return {
      success: true,
      output: {
        value: response.data.value || [],
        '@odata.context': response.data['@odata.context'],
        '@odata.nextLink': response.data['@odata.nextLink'],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Dynamics 365 get records failed',
        code: 'DYNAMICS365_GET_RECORDS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Microsoft Dynamics 365 connector action
 */
export async function executeMicrosoftDynamics365(
  actionId: string,
  input: Record<string, unknown>,
  credentials: Dynamics365Credentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_record':
      const entitySetName = input.entitySetName as string;
      const data = input.data as Record<string, unknown>;
      
      if (!entitySetName || !data) {
        return {
          success: false,
          error: {
            message: 'entitySetName and data are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDynamics365CreateRecord(entitySetName, data, credentials);

    case 'get_records':
      const getEntitySetName = input.entitySetName as string;
      const filter = input.filter as string | undefined;
      const select = input.select as string | undefined;
      const top = input.top as number | undefined;
      const orderBy = input.orderBy as string | undefined;
      
      if (!getEntitySetName) {
        return {
          success: false,
          error: {
            message: 'entitySetName is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDynamics365GetRecords(getEntitySetName, filter, select, top, orderBy, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Microsoft Dynamics 365 action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

