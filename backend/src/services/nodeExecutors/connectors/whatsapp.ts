/**
 * WhatsApp Business API Connector Executor
 * 
 * Executes WhatsApp connector actions using the WhatsApp Business API
 * Supports both Twilio WhatsApp API and Meta WhatsApp Business API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface WhatsAppCredentials {
  account_sid?: string; // For Twilio
  auth_token?: string; // For Twilio
  access_token?: string; // For Meta WhatsApp Business API
  phone_number_id?: string; // For Meta WhatsApp Business API
  provider: 'twilio' | 'meta';
}

/**
 * Create WhatsApp API client based on provider
 */
function createWhatsAppClient(credentials: WhatsAppCredentials): AxiosInstance {
  if (credentials.provider === 'twilio') {
    const auth = Buffer.from(`${credentials.account_sid}:${credentials.auth_token}`).toString('base64');
    return axios.create({
      baseURL: 'https://api.twilio.com/2010-04-01',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } else {
    // Meta WhatsApp Business API
    return axios.create({
      baseURL: `https://graph.facebook.com/v18.0/${credentials.phone_number_id}`,
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Send a WhatsApp message
 */
export async function executeWhatsAppSendMessage(
  to: string,
  message: string,
  mediaUrl?: string,
  credentials: WhatsAppCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createWhatsAppClient(credentials);
    
    if (credentials.provider === 'twilio') {
      // Twilio WhatsApp API
      const params = new URLSearchParams({
        From: `whatsapp:${credentials.account_sid}`, // This should be your Twilio WhatsApp number
        To: `whatsapp:${to}`,
        Body: message,
      });
      
      if (mediaUrl) {
        params.append('MediaUrl', mediaUrl);
      }
      
      const response = await client.post('/Accounts/' + credentials.account_sid + '/Messages.json', params);
      
      return {
        success: true,
        output: {
          sid: response.data.sid,
          status: response.data.status,
        },
      };
    } else {
      // Meta WhatsApp Business API
      const payload: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        to,
        type: mediaUrl ? 'image' : 'text',
      };
      
      if (mediaUrl) {
        payload.image = { link: mediaUrl };
      } else {
        payload.text = { body: message };
      }
      
      const response = await client.post('/messages', payload);
      
      return {
        success: true,
        output: {
          messageId: response.data.messages[0].id,
        },
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'WhatsApp message send failed',
        code: 'WHATSAPP_SEND_MESSAGE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute WhatsApp connector action
 */
export async function executeWhatsApp(
  actionId: string,
  input: Record<string, unknown>,
  credentials: WhatsAppCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'send_message':
      const to = input.to as string;
      const message = input.message as string;
      const mediaUrl = input.mediaUrl as string | undefined;
      
      if (!to || !message) {
        return {
          success: false,
          error: {
            message: 'to and message are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeWhatsAppSendMessage(to, message, mediaUrl, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown WhatsApp action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

