/**
 * Google Meet Connector Executor
 * 
 * Executes Google Meet connector actions using the Google Calendar API
 * Note: Google Meet meetings are created via Google Calendar API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface GoogleMeetCredentials {
  access_token: string;
}

/**
 * Create Google Calendar API client (used for Google Meet)
 */
function createGoogleMeetClient(credentials: GoogleMeetCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://www.googleapis.com/calendar/v3',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a Google Meet meeting
 */
export async function executeGoogleMeetCreateMeeting(
  summary: string,
  startTime: string, // ISO 8601 format
  endTime: string, // ISO 8601 format
  attendees?: string[],
  description?: string,
  timeZone?: string,
  credentials: GoogleMeetCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGoogleMeetClient(credentials);
    
    const eventData: Record<string, unknown> = {
      summary,
      start: {
        dateTime: startTime,
        ...(timeZone && { timeZone }),
      },
      end: {
        dateTime: endTime,
        ...(timeZone && { timeZone }),
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
      ...(description && { description }),
      ...(attendees && attendees.length > 0 && {
        attendees: attendees.map(email => ({ email })),
      }),
    };

    const response = await client.post('/calendars/primary/events', eventData, {
      params: {
        conferenceDataVersion: 1,
      },
    });

    return {
      success: true,
      output: {
        id: response.data.id,
        summary: response.data.summary,
        hangoutLink: response.data.hangoutLink,
        conferenceData: response.data.conferenceData,
        start: response.data.start,
        end: response.data.end,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Google Meet meeting creation failed',
        code: 'GOOGLEMEET_CREATE_MEETING_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get Google Meet meetings
 */
export async function executeGoogleMeetGetMeetings(
  timeMin?: string, // ISO 8601 format
  timeMax?: string, // ISO 8601 format
  maxResults: number = 10,
  credentials: GoogleMeetCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGoogleMeetClient(credentials);
    
    const params: Record<string, unknown> = {
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    };
    
    if (timeMin) {
      params.timeMin = timeMin;
    }
    if (timeMax) {
      params.timeMax = timeMax;
    }

    const response = await client.get('/calendars/primary/events', { params });

    // Filter events that have Google Meet links
    const meetEvents = (response.data.items || []).filter((event: any) => 
      event.hangoutLink || event.conferenceData
    );

    return {
      success: true,
      output: {
        meetings: meetEvents,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Google Meet get meetings failed',
        code: 'GOOGLEMEET_GET_MEETINGS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Google Meet connector action
 */
export async function executeGoogleMeet(
  actionId: string,
  input: Record<string, unknown>,
  credentials: GoogleMeetCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_meeting':
      const summary = input.summary as string;
      const startTime = input.startTime as string;
      const endTime = input.endTime as string;
      const attendees = input.attendees as string[] | undefined;
      const description = input.description as string | undefined;
      const timeZone = input.timeZone as string | undefined;
      
      if (!summary || !startTime || !endTime) {
        return {
          success: false,
          error: {
            message: 'summary, startTime, and endTime are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeGoogleMeetCreateMeeting(summary, startTime, endTime, attendees, description, timeZone, credentials);

    case 'get_meetings':
      const timeMin = input.timeMin as string | undefined;
      const timeMax = input.timeMax as string | undefined;
      const maxResults = (input.maxResults as number) || 10;
      return executeGoogleMeetGetMeetings(timeMin, timeMax, maxResults, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Google Meet action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

