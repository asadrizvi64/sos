/**
 * Adyen Connector Executor
 * 
 * Executes Adyen connector actions using the Adyen API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface AdyenCredentials {
  api_key: string;
  merchant_account: string;
  environment?: 'test' | 'live';
}

/**
 * Create Adyen API client
 */
function createAdyenClient(credentials: AdyenCredentials): AxiosInstance {
  const environment = credentials.environment || 'test';
  const baseURL = environment === 'live'
    ? 'https://pal-live.adyen.com/pal/servlet'
    : 'https://pal-test.adyen.com/pal/servlet';
  
  return axios.create({
    baseURL,
    headers: {
      'X-API-Key': credentials.api_key,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a payment in Adyen
 */
export async function executeAdyenCreatePayment(
  amount: {
    value: number;
    currency: string;
  },
  reference: string,
  paymentMethod: Record<string, unknown>,
  returnUrl?: string,
  credentials: AdyenCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createAdyenClient(credentials);
    
    const paymentData: Record<string, unknown> = {
      amount,
      reference,
      merchantAccount: credentials.merchant_account,
      paymentMethod,
      ...(returnUrl && { returnUrl }),
    };

    const response = await client.post('/Payment/v68/payments', paymentData);

    return {
      success: true,
      output: {
        pspReference: response.data.pspReference,
        resultCode: response.data.resultCode,
        action: response.data.action,
        paymentData: response.data.paymentData,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Adyen payment creation failed',
        code: 'ADYEN_CREATE_PAYMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get payment status from Adyen
 */
export async function executeAdyenGetPaymentStatus(
  pspReference: string,
  credentials: AdyenCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createAdyenClient(credentials);
    
    const params = {
      merchantAccount: credentials.merchant_account,
    };

    const response = await client.get(`/Payment/v68/payments/${pspReference}`, { params });

    return {
      success: true,
      output: {
        pspReference: response.data.pspReference,
        resultCode: response.data.resultCode,
        amount: response.data.amount,
        merchantReference: response.data.merchantReference,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Adyen get payment status failed',
        code: 'ADYEN_GET_PAYMENT_STATUS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Adyen connector action
 */
export async function executeAdyen(
  actionId: string,
  input: Record<string, unknown>,
  credentials: AdyenCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_payment':
      const amount = input.amount as { value: number; currency: string };
      const reference = input.reference as string;
      const paymentMethod = input.paymentMethod as Record<string, unknown>;
      const returnUrl = input.returnUrl as string | undefined;
      
      if (!amount || !reference || !paymentMethod) {
        return {
          success: false,
          error: {
            message: 'amount, reference, and paymentMethod are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeAdyenCreatePayment(amount, reference, paymentMethod, returnUrl, credentials);

    case 'get_payment_status':
      const pspReference = input.pspReference as string;
      
      if (!pspReference) {
        return {
          success: false,
          error: {
            message: 'pspReference is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeAdyenGetPaymentStatus(pspReference, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Adyen action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

