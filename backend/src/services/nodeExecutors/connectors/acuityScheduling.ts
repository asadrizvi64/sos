/**
 * Acuity Scheduling Connector Executor
 * 
 * Executes Acuity Scheduling connector actions using the Acuity API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface AcuitySchedulingCredentials {
  user_id: string;
  api_key: string;
}

/**
 * Create Acuity Scheduling API client
 */
function createAcuitySchedulingClient(credentials: AcuitySchedulingCredentials): AxiosInstance {
  const auth = Buffer.from(`${credentials.user_id}:${credentials.api_key}`).toString('base64');
  
  return axios.create({
    baseURL: 'https://acuityscheduling.com/api/v1',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create an appointment in Acuity Scheduling
 */
export async function executeAcuitySchedulingCreateAppointment(
  appointmentTypeId: number,
  calendarId: number,
  datetime: string, // ISO 8601 format
  firstName?: string,
  lastName?: string,
  email?: string,
  phone?: string,
  notes?: string,
  credentials: AcuitySchedulingCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createAcuitySchedulingClient(credentials);
    
    const appointmentData: Record<string, unknown> = {
      appointmentTypeID: appointmentTypeId,
      calendarID: calendarId,
      datetime,
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(notes && { notes }),
    };

    const response = await client.post('/appointments', appointmentData);

    return {
      success: true,
      output: {
        id: response.data.id,
        datetime: response.data.datetime,
        appointmentTypeID: response.data.appointmentTypeID,
        calendarID: response.data.calendarID,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Acuity Scheduling appointment creation failed',
        code: 'ACUITY_CREATE_APPOINTMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get appointments from Acuity Scheduling
 */
export async function executeAcuitySchedulingGetAppointments(
  minDate?: string, // ISO 8601 format
  maxDate?: string, // ISO 8601 format
  calendarID?: number,
  credentials: AcuitySchedulingCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createAcuitySchedulingClient(credentials);
    
    const params: Record<string, unknown> = {};
    
    if (minDate) {
      params.minDate = minDate;
    }
    if (maxDate) {
      params.maxDate = maxDate;
    }
    if (calendarID) {
      params.calendarID = calendarID;
    }

    const response = await client.get('/appointments', { params });

    return {
      success: true,
      output: {
        appointments: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Acuity Scheduling get appointments failed',
        code: 'ACUITY_GET_APPOINTMENTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Acuity Scheduling connector action
 */
export async function executeAcuityScheduling(
  actionId: string,
  input: Record<string, unknown>,
  credentials: AcuitySchedulingCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_appointment':
      const appointmentTypeId = input.appointmentTypeId as number;
      const calendarId = input.calendarId as number;
      const datetime = input.datetime as string;
      const firstName = input.firstName as string | undefined;
      const lastName = input.lastName as string | undefined;
      const email = input.email as string | undefined;
      const phone = input.phone as string | undefined;
      const notes = input.notes as string | undefined;
      
      if (!appointmentTypeId || !calendarId || !datetime) {
        return {
          success: false,
          error: {
            message: 'appointmentTypeId, calendarId, and datetime are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeAcuitySchedulingCreateAppointment(appointmentTypeId, calendarId, datetime, firstName, lastName, email, phone, notes, credentials);

    case 'get_appointments':
      const minDate = input.minDate as string | undefined;
      const maxDate = input.maxDate as string | undefined;
      const calendarID = input.calendarID as number | undefined;
      return executeAcuitySchedulingGetAppointments(minDate, maxDate, calendarID, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Acuity Scheduling action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

