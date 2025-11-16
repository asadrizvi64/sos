/**
 * Vonage (Nexmo) Connector Executor
 * 
 * Executes Vonage connector actions for SMS and Voice
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface VonageCredentials {
  api_key: string;
  api_secret: string;
}

/**
 * Create Vonage API client
 */
function createVonageClient(credentials: VonageCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://rest.nexmo.com',
    headers: {
      'Content-Type': 'application/json',
    },
    auth: {
      username: credentials.api_key,
      password: credentials.api_secret,
    },
  });
}

/**
 * Send an SMS via Vonage
 */
export async function executeVonageSendSMS(
  to: string,
  from: string,
  text: string,
  credentials: VonageCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createVonageClient(credentials);
    
    const params = new URLSearchParams({
      api_key: credentials.api_key,
      api_secret: credentials.api_secret,
      to,
      from,
      text,
    });
    
    const response = await client.post('/sms/json', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const message = response.data.messages[0];
    
    if (message.status !== '0') {
      return {
        success: false,
        error: {
          message: message['error-text'] || 'SMS send failed',
          code: 'VONAGE_SMS_ERROR',
          details: message,
        },
      };
    }
    
    return {
      success: true,
      output: {
        messageId: message['message-id'],
        status: message.status,
        to: message.to,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Vonage SMS send failed',
        code: 'VONAGE_SMS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Make a voice call via Vonage
 */
export async function executeVonageMakeCall(
  to: string,
  from: string,
  answerUrl: string,
  credentials: VonageCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createVonageClient(credentials);
    
    const params = new URLSearchParams({
      api_key: credentials.api_key,
      api_secret: credentials.api_secret,
      to,
      from,
      answer_url: answerUrl,
    });
    
    const response = await client.post('/call/json', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    if (response.data.status !== '0') {
      return {
        success: false,
        error: {
          message: response.data['error-text'] || 'Call initiation failed',
          code: 'VONAGE_CALL_ERROR',
          details: response.data,
        },
      };
    }
    
    return {
      success: true,
      output: {
        callId: response.data['call-id'],
        status: response.data.status,
        to: response.data.to,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Vonage call failed',
        code: 'VONAGE_CALL_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Vonage connector action
 */
export async function executeVonage(
  actionId: string,
  input: Record<string, unknown>,
  credentials: VonageCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'send_sms':
      const to = input.to as string;
      const from = input.from as string;
      const text = input.text as string;
      
      if (!to || !from || !text) {
        return {
          success: false,
          error: {
            message: 'to, from, and text are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeVonageSendSMS(to, from, text, credentials);

    case 'make_call':
      const callTo = input.to as string;
      const callFrom = input.from as string;
      const answerUrl = input.answerUrl as string;
      
      if (!callTo || !callFrom || !answerUrl) {
        return {
          success: false,
          error: {
            message: 'to, from, and answerUrl are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeVonageMakeCall(callTo, callFrom, answerUrl, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Vonage action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

