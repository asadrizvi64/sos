/**
 * Freshdesk Connector Executor
 * 
 * Executes Freshdesk connector actions using the Freshdesk REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface FreshdeskCredentials {
  api_key: string;
  domain: string;
}

/**
 * Create Freshdesk API client
 */
function createFreshdeskClient(credentials: FreshdeskCredentials): AxiosInstance {
  const domain = credentials.domain || process.env.FRESHDESK_DOMAIN || '';
  
  return axios.create({
    baseURL: `https://${domain}.freshdesk.com/api/v2`,
    auth: {
      username: credentials.api_key,
      password: 'X', // Freshdesk uses API key as username, 'X' as password
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a ticket in Freshdesk
 */
export async function executeFreshdeskCreateTicket(
  subject: string,
  description: string,
  email: string,
  priority?: 1 | 2 | 3 | 4, // 1=Low, 2=Medium, 3=High, 4=Urgent
  status?: 2 | 3 | 4 | 5, // 2=Open, 3=Pending, 4=Resolved, 5=Closed
  credentials: FreshdeskCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createFreshdeskClient(credentials);
    
    const ticketData: Record<string, unknown> = {
      subject,
      description,
      email,
      priority: priority || 1,
      status: status || 2,
    };

    const response = await client.post('/tickets', ticketData);

    return {
      success: true,
      output: {
        id: response.data.id,
        subject: response.data.subject,
        status: response.data.status,
        priority: response.data.priority,
        created_at: response.data.created_at,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Freshdesk ticket creation failed',
        code: 'FRESHDESK_CREATE_TICKET_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get tickets from Freshdesk
 */
export async function executeFreshdeskGetTickets(
  status?: number,
  priority?: number,
  perPage: number = 30,
  credentials: FreshdeskCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createFreshdeskClient(credentials);
    
    const params: Record<string, unknown> = {
      per_page: perPage,
    };
    
    if (status !== undefined) {
      params.status = status;
    }
    if (priority !== undefined) {
      params.priority = priority;
    }

    const response = await client.get('/tickets', { params });

    return {
      success: true,
      output: {
        tickets: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Freshdesk get tickets failed',
        code: 'FRESHDESK_GET_TICKETS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Freshdesk connector action
 */
export async function executeFreshdesk(
  actionId: string,
  input: Record<string, unknown>,
  credentials: FreshdeskCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_ticket':
      const subject = input.subject as string;
      const description = input.description as string;
      const email = input.email as string;
      const priority = input.priority as 1 | 2 | 3 | 4 | undefined;
      const status = input.status as 2 | 3 | 4 | 5 | undefined;
      
      if (!subject || !description || !email) {
        return {
          success: false,
          error: {
            message: 'subject, description, and email are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeFreshdeskCreateTicket(subject, description, email, priority, status, credentials);

    case 'get_tickets':
      const getStatus = input.status as number | undefined;
      const getPriority = input.priority as number | undefined;
      const perPage = (input.perPage as number) || 30;
      return executeFreshdeskGetTickets(getStatus, getPriority, perPage, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Freshdesk action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

