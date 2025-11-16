/**
 * Square Connector Executor
 * 
 * Executes Square connector actions using the Square API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface SquareCredentials {
  access_token: string;
  environment?: 'sandbox' | 'production';
}

/**
 * Create Square API client
 */
function createSquareClient(credentials: SquareCredentials): AxiosInstance {
  const environment = credentials.environment || 'production';
  const baseURL = environment === 'sandbox' 
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
    },
  });
}

/**
 * Create a payment in Square
 */
export async function executeSquareCreatePayment(
  amount: number,
  currency: string = 'USD',
  sourceId: string, // Card nonce or card ID
  idempotencyKey: string,
  credentials: SquareCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSquareClient(credentials);
    
    const paymentData = {
      idempotency_key: idempotencyKey,
      source_id: sourceId,
      amount_money: {
        amount,
        currency,
      },
    };

    const response = await client.post('/payments', paymentData);

    return {
      success: true,
      output: {
        id: response.data.payment.id,
        status: response.data.payment.status,
        amount_money: response.data.payment.amount_money,
        created_at: response.data.payment.created_at,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Square payment creation failed',
        code: 'SQUARE_CREATE_PAYMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get payments from Square
 */
export async function executeSquareGetPayments(
  beginTime?: string, // ISO 8601 format
  endTime?: string, // ISO 8601 format
  limit: number = 10,
  credentials: SquareCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSquareClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (beginTime) {
      params.begin_time = beginTime;
    }
    if (endTime) {
      params.end_time = endTime;
    }

    const response = await client.get('/payments', { params });

    return {
      success: true,
      output: {
        payments: response.data.payments || [],
        cursor: response.data.cursor,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.detail || error.message || 'Square get payments failed',
        code: 'SQUARE_GET_PAYMENTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Square connector action
 */
export async function executeSquare(
  actionId: string,
  input: Record<string, unknown>,
  credentials: SquareCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_payment':
      const amount = input.amount as number;
      const currency = (input.currency as string) || 'USD';
      const sourceId = input.sourceId as string;
      const idempotencyKey = input.idempotencyKey as string || `payment-${Date.now()}`;
      
      if (!amount || !sourceId) {
        return {
          success: false,
          error: {
            message: 'amount and sourceId are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeSquareCreatePayment(amount, currency, sourceId, idempotencyKey, credentials);

    case 'get_payments':
      const beginTime = input.beginTime as string | undefined;
      const endTime = input.endTime as string | undefined;
      const limit = (input.limit as number) || 10;
      return executeSquareGetPayments(beginTime, endTime, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Square action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

