/**
 * Etsy Connector Executor
 * 
 * Executes Etsy connector actions using the Etsy API v3
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface EtsyCredentials {
  access_token: string;
  api_key?: string; // For OAuth apps
}

/**
 * Create Etsy API client
 */
function createEtsyClient(credentials: EtsyCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://openapi.etsy.com/v3',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'x-api-key': credentials.api_key || '',
    },
  });
}

/**
 * Create a listing in Etsy
 */
export async function executeEtsyCreateListing(
  shopId: number,
  title: string,
  description: string,
  price: number,
  quantity: number,
  tags?: string[],
  materials?: string[],
  credentials: EtsyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createEtsyClient(credentials);
    
    const listingData: Record<string, unknown> = {
      title,
      description,
      price,
      quantity,
      ...(tags && tags.length > 0 && { tags }),
      ...(materials && materials.length > 0 && { materials }),
    };

    const response = await client.post(`/application/shops/${shopId}/listings`, listingData);

    return {
      success: true,
      output: {
        listingId: response.data.listing_id,
        title: response.data.title,
        price: response.data.price,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Etsy listing creation failed',
        code: 'ETSY_CREATE_LISTING_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get listings from Etsy shop
 */
export async function executeEtsyGetListings(
  shopId: number,
  limit: number = 25,
  offset: number = 0,
  credentials: EtsyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createEtsyClient(credentials);
    
    const params = {
      limit,
      offset,
    };

    const response = await client.get(`/application/shops/${shopId}/listings`, { params });

    return {
      success: true,
      output: {
        results: response.data.results || [],
        count: response.data.count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Etsy get listings failed',
        code: 'ETSY_GET_LISTINGS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Etsy connector action
 */
export async function executeEtsy(
  actionId: string,
  input: Record<string, unknown>,
  credentials: EtsyCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_listing':
      const shopId = input.shopId as number;
      const title = input.title as string;
      const description = input.description as string;
      const price = input.price as number;
      const quantity = input.quantity as number;
      const tags = input.tags as string[] | undefined;
      const materials = input.materials as string[] | undefined;
      
      if (!shopId || !title || !description || price === undefined || quantity === undefined) {
        return {
          success: false,
          error: {
            message: 'shopId, title, description, price, and quantity are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeEtsyCreateListing(shopId, title, description, price, quantity, tags, materials, credentials);

    case 'get_listings':
      const getShopId = input.shopId as number;
      const limit = (input.limit as number) || 25;
      const offset = (input.offset as number) || 0;
      
      if (!getShopId) {
        return {
          success: false,
          error: {
            message: 'shopId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeEtsyGetListings(getShopId, limit, offset, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Etsy action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

