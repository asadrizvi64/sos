/**
 * Shippo Connector Executor
 * 
 * Executes Shippo connector actions using the Shippo API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ShippoCredentials {
  api_token: string;
}

/**
 * Create Shippo API client
 */
function createShippoClient(credentials: ShippoCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.goshippo.com',
    headers: {
      'Authorization': `ShippoToken ${credentials.api_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a shipment in Shippo
 */
export async function executeShippoCreateShipment(
  addressFrom: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  },
  addressTo: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  },
  parcels: Array<{
    length: string;
    width: string;
    height: string;
    distance_unit: string;
    weight: string;
    mass_unit: string;
  }>,
  credentials: ShippoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createShippoClient(credentials);
    
    const shipmentData = {
      address_from: addressFrom,
      address_to: addressTo,
      parcels,
    };

    const response = await client.post('/shipments', shipmentData);

    return {
      success: true,
      output: {
        object_id: response.data.object_id,
        status: response.data.status,
        address_from: response.data.address_from,
        address_to: response.data.address_to,
        rates: response.data.rates,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Shippo shipment creation failed',
        code: 'SHIPPO_CREATE_SHIPMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Create a transaction (purchase label) in Shippo
 */
export async function executeShippoCreateTransaction(
  rate: string, // Rate object ID
  async: boolean = false,
  credentials: ShippoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createShippoClient(credentials);
    
    const transactionData = {
      rate,
      async,
    };

    const response = await client.post('/transactions', transactionData);

    return {
      success: true,
      output: {
        object_id: response.data.object_id,
        status: response.data.status,
        tracking_number: response.data.tracking_number,
        label_url: response.data.label_url,
        commercial_invoice_url: response.data.commercial_invoice_url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Shippo transaction creation failed',
        code: 'SHIPPO_CREATE_TRANSACTION_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Shippo connector action
 */
export async function executeShippo(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ShippoCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_shipment':
      const addressFrom = input.addressFrom as {
        name: string;
        street1: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
      const addressTo = input.addressTo as {
        name: string;
        street1: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
      const parcels = input.parcels as Array<{
        length: string;
        width: string;
        height: string;
        distance_unit: string;
        weight: string;
        mass_unit: string;
      }>;
      
      if (!addressFrom || !addressTo || !parcels) {
        return {
          success: false,
          error: {
            message: 'addressFrom, addressTo, and parcels are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeShippoCreateShipment(addressFrom, addressTo, parcels, credentials);

    case 'create_transaction':
      const rate = input.rate as string;
      const async = (input.async as boolean) || false;
      
      if (!rate) {
        return {
          success: false,
          error: {
            message: 'rate is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeShippoCreateTransaction(rate, async, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Shippo action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

