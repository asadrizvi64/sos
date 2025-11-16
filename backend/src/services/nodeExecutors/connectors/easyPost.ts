/**
 * EasyPost Connector Executor
 * 
 * Executes EasyPost connector actions using the EasyPost API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface EasyPostCredentials {
  api_key: string;
}

/**
 * Create EasyPost API client
 */
function createEasyPostClient(credentials: EasyPostCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.easypost.com/v2',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a shipment in EasyPost
 */
export async function executeEasyPostCreateShipment(
  toAddress: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  },
  fromAddress: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  },
  parcel: {
    length: number;
    width: number;
    height: number;
    weight: number;
  },
  credentials: EasyPostCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createEasyPostClient(credentials);
    
    const shipmentData = {
      to_address: toAddress,
      from_address: fromAddress,
      parcel,
    };

    const response = await client.post('/shipments', shipmentData);

    return {
      success: true,
      output: {
        id: response.data.id,
        mode: response.data.mode,
        rates: response.data.rates,
        selected_rate: response.data.selected_rate,
        tracking_code: response.data.tracking_code,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'EasyPost shipment creation failed',
        code: 'EASYPOST_CREATE_SHIPMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Buy a shipment (purchase label) in EasyPost
 */
export async function executeEasyPostBuyShipment(
  shipmentId: string,
  rateId: string,
  credentials: EasyPostCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createEasyPostClient(credentials);
    
    const buyData = {
      rate: {
        id: rateId,
      },
    };

    const response = await client.post(`/shipments/${shipmentId}/buy`, buyData);

    return {
      success: true,
      output: {
        id: response.data.id,
        tracking_code: response.data.tracking_code,
        postage_label: response.data.postage_label,
        tracking_url: response.data.tracking_url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'EasyPost buy shipment failed',
        code: 'EASYPOST_BUY_SHIPMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute EasyPost connector action
 */
export async function executeEasyPost(
  actionId: string,
  input: Record<string, unknown>,
  credentials: EasyPostCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_shipment':
      const toAddress = input.toAddress as {
        name: string;
        street1: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
      const fromAddress = input.fromAddress as {
        name: string;
        street1: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      };
      const parcel = input.parcel as {
        length: number;
        width: number;
        height: number;
        weight: number;
      };
      
      if (!toAddress || !fromAddress || !parcel) {
        return {
          success: false,
          error: {
            message: 'toAddress, fromAddress, and parcel are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeEasyPostCreateShipment(toAddress, fromAddress, parcel, credentials);

    case 'buy_shipment':
      const shipmentId = input.shipmentId as string;
      const rateId = input.rateId as string;
      
      if (!shipmentId || !rateId) {
        return {
          success: false,
          error: {
            message: 'shipmentId and rateId are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeEasyPostBuyShipment(shipmentId, rateId, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown EasyPost action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

