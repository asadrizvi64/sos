/**
 * Cal.com Connector Executor
 * 
 * Executes Cal.com connector actions using the Cal.com API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CalComCredentials {
  api_key: string;
  base_url?: string; // For self-hosted instances
}

/**
 * Create Cal.com API client
 */
function createCalComClient(credentials: CalComCredentials): AxiosInstance {
  const baseURL = credentials.base_url 
    ? `${credentials.base_url}/api/v1`
    : 'https://api.cal.com/v1';
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a booking in Cal.com
 */
export async function executeCalComCreateBooking(
  eventTypeId: number,
  start: string, // ISO 8601 format
  end: string, // ISO 8601 format
  responses: {
    name: string;
    email: string;
    notes?: string;
    [key: string]: unknown;
  },
  timeZone?: string,
  language?: string,
  metadata?: Record<string, unknown>,
  credentials: CalComCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCalComClient(credentials);
    
    const bookingData: Record<string, unknown> = {
      eventTypeId,
      start,
      end,
      responses,
      ...(timeZone && { timeZone }),
      ...(language && { language }),
      ...(metadata && { metadata }),
    };

    const response = await client.post('/bookings', bookingData);

    return {
      success: true,
      output: {
        id: response.data.booking.id,
        uid: response.data.booking.uid,
        title: response.data.booking.title,
        startTime: response.data.booking.startTime,
        endTime: response.data.booking.endTime,
        status: response.data.booking.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Cal.com booking creation failed',
        code: 'CALCOM_CREATE_BOOKING_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get bookings from Cal.com
 */
export async function executeCalComGetBookings(
  eventTypeId?: number,
  limit: number = 20,
  credentials: CalComCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCalComClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (eventTypeId) {
      params.eventTypeId = eventTypeId;
    }

    const response = await client.get('/bookings', { params });

    return {
      success: true,
      output: {
        bookings: response.data.bookings || [],
        nextCursor: response.data.nextCursor,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Cal.com get bookings failed',
        code: 'CALCOM_GET_BOOKINGS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Cal.com connector action
 */
export async function executeCalCom(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CalComCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_booking':
      const eventTypeId = input.eventTypeId as number;
      const start = input.start as string;
      const end = input.end as string;
      const responses = input.responses as {
        name: string;
        email: string;
        notes?: string;
        [key: string]: unknown;
      };
      const timeZone = input.timeZone as string | undefined;
      const language = input.language as string | undefined;
      const metadata = input.metadata as Record<string, unknown> | undefined;
      
      if (!eventTypeId || !start || !end || !responses) {
        return {
          success: false,
          error: {
            message: 'eventTypeId, start, end, and responses are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCalComCreateBooking(eventTypeId, start, end, responses, timeZone, language, metadata, credentials);

    case 'get_bookings':
      const getEventTypeId = input.eventTypeId as number | undefined;
      const limit = (input.limit as number) || 20;
      return executeCalComGetBookings(getEventTypeId, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Cal.com action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

