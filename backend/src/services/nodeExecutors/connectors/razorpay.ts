/**
 * Razorpay Connector Executor
 * 
 * Executes Razorpay connector actions using the Razorpay API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface RazorpayCredentials {
  key_id: string;
  key_secret: string;
}

/**
 * Create Razorpay API client
 */
function createRazorpayClient(credentials: RazorpayCredentials): AxiosInstance {
  const auth = Buffer.from(`${credentials.key_id}:${credentials.key_secret}`).toString('base64');
  
  return axios.create({
    baseURL: 'https://api.razorpay.com/v1',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a payment in Razorpay
 */
export async function executeRazorpayCreatePayment(
  amount: number,
  currency: string = 'INR',
  receipt?: string,
  notes?: Record<string, string>,
  credentials: RazorpayCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createRazorpayClient(credentials);
    
    const paymentData: Record<string, unknown> = {
      amount: amount * 100, // Razorpay expects amount in paise (smallest currency unit)
      currency,
      ...(receipt && { receipt }),
      ...(notes && Object.keys(notes).length > 0 && { notes }),
    };

    const response = await client.post('/orders', paymentData);

    return {
      success: true,
      output: {
        id: response.data.id,
        amount: response.data.amount,
        currency: response.data.currency,
        receipt: response.data.receipt,
        status: response.data.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.description || error.message || 'Razorpay payment creation failed',
        code: 'RAZORPAY_CREATE_PAYMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get payments from Razorpay
 */
export async function executeRazorpayGetPayments(
  count: number = 10,
  skip: number = 0,
  credentials: RazorpayCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createRazorpayClient(credentials);
    
    const params = {
      count,
      skip,
    };

    const response = await client.get('/payments', { params });

    return {
      success: true,
      output: {
        payments: response.data.items || [],
        count: response.data.count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.description || error.message || 'Razorpay get payments failed',
        code: 'RAZORPAY_GET_PAYMENTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Razorpay connector action
 */
export async function executeRazorpay(
  actionId: string,
  input: Record<string, unknown>,
  credentials: RazorpayCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_payment':
      const amount = input.amount as number;
      const currency = (input.currency as string) || 'INR';
      const receipt = input.receipt as string | undefined;
      const notes = input.notes as Record<string, string> | undefined;
      
      if (!amount) {
        return {
          success: false,
          error: {
            message: 'amount is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeRazorpayCreatePayment(amount, currency, receipt, notes, credentials);

    case 'get_payments':
      const count = (input.count as number) || 10;
      const skip = (input.skip as number) || 0;
      return executeRazorpayGetPayments(count, skip, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Razorpay action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

