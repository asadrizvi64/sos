/**
 * Resend Connector Executor
 * 
 * Executes Resend connector actions using the Resend REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ResendCredentials {
  api_key: string;
}

/**
 * Create Resend API client
 */
function createResendClient(credentials: ResendCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.resend.com',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Send email via Resend
 */
export async function executeResendSendEmail(
  to: string,
  from: string,
  subject: string,
  text?: string,
  html?: string,
  cc?: string[],
  bcc?: string[],
  replyTo?: string,
  credentials: ResendCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createResendClient(credentials);
    
    const emailData: Record<string, unknown> = {
      to,
      from,
      subject,
    };
    
    if (text) emailData.text = text;
    if (html) emailData.html = html;
    if (cc && cc.length > 0) emailData.cc = cc;
    if (bcc && bcc.length > 0) emailData.bcc = bcc;
    if (replyTo) emailData.reply_to = replyTo;

    const response = await client.post('/emails', emailData);

    return {
      success: true,
      output: {
        id: response.data.id,
        from: response.data.from,
        to: response.data.to,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Resend email send failed',
        code: 'RESEND_SEND_EMAIL_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Resend connector action
 */
export async function executeResend(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ResendCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'send_email':
      const to = input.to as string;
      const from = input.from as string;
      const subject = input.subject as string;
      const text = input.text as string | undefined;
      const html = input.html as string | undefined;
      const cc = input.cc as string[] | undefined;
      const bcc = input.bcc as string[] | undefined;
      const replyTo = input.replyTo as string | undefined;
      
      if (!to || !from || !subject) {
        return {
          success: false,
          error: {
            message: 'to, from, and subject are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      
      if (!text && !html) {
        return {
          success: false,
          error: {
            message: 'Either text or html content is required',
            code: 'MISSING_CONTENT',
          },
        };
      }
      
      return executeResendSendEmail(to, from, subject, text, html, cc, bcc, replyTo, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Resend action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

