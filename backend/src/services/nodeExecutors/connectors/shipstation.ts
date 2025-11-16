/**
 * ShipStation Connector Executor
 * 
 * Executes ShipStation connector actions using the ShipStation API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ShipStationCredentials {
  api_key: string;
  api_secret: string;
}

/**
 * Create ShipStation API client
 */
function createShipStationClient(credentials: ShipStationCredentials): AxiosInstance {
  const auth = Buffer.from(`${credentials.api_key}:${credentials.api_secret}`).toString('base64');
  
  return axios.create({
    baseURL: 'https://ssapi.shipstation.com',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a shipment in ShipStation
 */
export async function executeShipStationCreateShipment(
  orderId: number,
  carrierCode: string,
  serviceCode: string,
  shipDate: string, // ISO 8601 format
  credentials: ShipStationCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createShipStationClient(credentials);
    
    const shipmentData = {
      orderId,
      carrierCode,
      serviceCode,
      shipDate,
    };

    const response = await client.post('/orders/createlabelfororder', shipmentData);

    return {
      success: true,
      output: {
        shipmentId: response.data.shipmentId,
        shipmentCost: response.data.shipmentCost,
        trackingNumber: response.data.trackingNumber,
        labelData: response.data.labelData,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.Message || error.message || 'ShipStation shipment creation failed',
        code: 'SHIPSTATION_CREATE_SHIPMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get orders from ShipStation
 */
export async function executeShipStationGetOrders(
  orderStatus?: string,
  page: number = 1,
  pageSize: number = 50,
  credentials: ShipStationCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createShipStationClient(credentials);
    
    const params: Record<string, unknown> = {
      page,
      pageSize,
    };
    
    if (orderStatus) {
      params.orderStatus = orderStatus;
    }

    const response = await client.get('/orders', { params });

    return {
      success: true,
      output: {
        orders: response.data.orders || [],
        total: response.data.total,
        page: response.data.page,
        pages: response.data.pages,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.Message || error.message || 'ShipStation get orders failed',
        code: 'SHIPSTATION_GET_ORDERS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute ShipStation connector action
 */
export async function executeShipStation(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ShipStationCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_shipment':
      const orderId = input.orderId as number;
      const carrierCode = input.carrierCode as string;
      const serviceCode = input.serviceCode as string;
      const shipDate = input.shipDate as string;
      
      if (!orderId || !carrierCode || !serviceCode || !shipDate) {
        return {
          success: false,
          error: {
            message: 'orderId, carrierCode, serviceCode, and shipDate are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeShipStationCreateShipment(orderId, carrierCode, serviceCode, shipDate, credentials);

    case 'get_orders':
      const orderStatus = input.orderStatus as string | undefined;
      const page = (input.page as number) || 1;
      const pageSize = (input.pageSize as number) || 50;
      return executeShipStationGetOrders(orderStatus, page, pageSize, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown ShipStation action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

