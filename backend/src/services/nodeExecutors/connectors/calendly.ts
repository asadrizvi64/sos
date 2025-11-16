/**
 * Calendly Connector Executor
 * 
 * Executes Calendly connector actions using the Calendly API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CalendlyCredentials {
  access_token: string;
}

/**
 * Create Calendly API client
 */
function createCalendlyClient(credentials: CalendlyCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.calendly.com',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create an event in Calendly
 */
export async function executeCalendlyCreateEvent(
  eventTypeUri: string,
  inviteeEmail: string,
  inviteeName?: string,
  startTime?: string, // ISO 8601 format
  timezone?: string,
  credentials: CalendlyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCalendlyClient(credentials);
    
    const eventData: Record<string, unknown> = {
      event: {
        event_type: eventTypeUri,
        invitees: [
          {
            email: inviteeEmail,
            ...(inviteeName && { name: inviteeName }),
          },
        ],
        ...(startTime && { start_time: startTime }),
        ...(timezone && { timezone }),
      },
    };

    const response = await client.post('/scheduled_events', eventData);

    return {
      success: true,
      output: {
        uri: response.data.resource.uri,
        name: response.data.resource.name,
        status: response.data.resource.status,
        start_time: response.data.resource.start_time,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Calendly event creation failed',
        code: 'CALENDLY_CREATE_EVENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get events from Calendly
 */
export async function executeCalendlyGetEvents(
  user?: string,
  organization?: string,
  count: number = 20,
  credentials: CalendlyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCalendlyClient(credentials);
    
    const params: Record<string, unknown> = {
      count,
    };
    
    if (user) {
      params.user = user;
    }
    if (organization) {
      params.organization = organization;
    }

    const response = await client.get('/scheduled_events', { params });

    return {
      success: true,
      output: {
        events: response.data.collection || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Calendly get events failed',
        code: 'CALENDLY_GET_EVENTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Calendly connector action
 */
export async function executeCalendly(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CalendlyCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_event':
      const eventTypeUri = input.eventTypeUri as string;
      const inviteeEmail = input.inviteeEmail as string;
      const inviteeName = input.inviteeName as string | undefined;
      const startTime = input.startTime as string | undefined;
      const timezone = input.timezone as string | undefined;
      
      if (!eventTypeUri || !inviteeEmail) {
        return {
          success: false,
          error: {
            message: 'eventTypeUri and inviteeEmail are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCalendlyCreateEvent(eventTypeUri, inviteeEmail, inviteeName, startTime, timezone, credentials);

    case 'get_events':
      const user = input.user as string | undefined;
      const organization = input.organization as string | undefined;
      const count = (input.count as number) || 20;
      return executeCalendlyGetEvents(user, organization, count, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Calendly action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

