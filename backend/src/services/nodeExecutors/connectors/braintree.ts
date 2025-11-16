/**
 * Braintree Connector Executor
 * 
 * Executes Braintree connector actions using the Braintree API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BraintreeCredentials {
  merchant_id: string;
  public_key: string;
  private_key: string;
  environment?: 'sandbox' | 'production';
}

/**
 * Create Braintree API client
 */
function createBraintreeClient(credentials: BraintreeCredentials): AxiosInstance {
  const environment = credentials.environment || 'sandbox';
  const baseURL = environment === 'sandbox'
    ? 'https://api.sandbox.braintreegateway.com'
    : 'https://api.braintreegateway.com';
  
  const auth = Buffer.from(`${credentials.public_key}:${credentials.private_key}`).toString('base64');
  
  return axios.create({
    baseURL: `${baseURL}/merchants/${credentials.merchant_id}`,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml',
    },
  });
}

/**
 * Create a transaction in Braintree
 */
export async function executeBraintreeCreateTransaction(
  amount: string,
  paymentMethodNonce: string,
  options?: {
    submitForSettlement?: boolean;
    storeInVault?: boolean;
    [key: string]: unknown;
  },
  credentials: BraintreeCredentials
): Promise<NodeExecutionResult> {
  try {
    // Note: Braintree uses XML for their API, but for simplicity we'll use their Node SDK approach
    // In production, you should use the official Braintree SDK
    const client = createBraintreeClient(credentials);
    
    // Braintree requires XML format, but for this implementation we'll return a helpful message
    // In production, use the official Braintree Node.js SDK
    return {
      success: false,
      error: {
        message: 'Braintree integration requires the official Braintree SDK. Please use @braintree/sdk for full implementation.',
        code: 'BRAINTREE_SDK_REQUIRED',
        details: {
          amount,
          paymentMethodNonce,
          options,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'Braintree transaction creation failed',
        code: 'BRAINTREE_CREATE_TRANSACTION_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Get a transaction from Braintree
 */
export async function executeBraintreeGetTransaction(
  transactionId: string,
  credentials: BraintreeCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBraintreeClient(credentials);
    
    // Braintree requires XML format, but for this implementation we'll return a helpful message
    return {
      success: false,
      error: {
        message: 'Braintree integration requires the official Braintree SDK. Please use @braintree/sdk for full implementation.',
        code: 'BRAINTREE_SDK_REQUIRED',
        details: {
          transactionId,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'Braintree get transaction failed',
        code: 'BRAINTREE_GET_TRANSACTION_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Execute Braintree connector action
 */
export async function executeBraintree(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BraintreeCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_transaction':
      const amount = input.amount as string;
      const paymentMethodNonce = input.paymentMethodNonce as string;
      const options = input.options as Record<string, unknown> | undefined;
      
      if (!amount || !paymentMethodNonce) {
        return {
          success: false,
          error: {
            message: 'amount and paymentMethodNonce are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBraintreeCreateTransaction(amount, paymentMethodNonce, options, credentials);

    case 'get_transaction':
      const transactionId = input.transactionId as string;
      
      if (!transactionId) {
        return {
          success: false,
          error: {
            message: 'transactionId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBraintreeGetTransaction(transactionId, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Braintree action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

