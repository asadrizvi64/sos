/**
 * Squarespace Commerce Connector Executor
 * 
 * Executes Squarespace Commerce connector actions using the Squarespace Commerce API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface SquarespaceCommerceCredentials {
  api_key: string;
  site_id: string; // Squarespace site ID
}

/**
 * Create Squarespace Commerce API client
 */
function createSquarespaceClient(credentials: SquarespaceCommerceCredentials): AxiosInstance {
  return axios.create({
    baseURL: `https://api.squarespace.com/1.0/commerce`,
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a product in Squarespace Commerce
 */
export async function executeSquarespaceCreateProduct(
  name: string,
  description?: string,
  price?: number,
  sku?: string,
  inventory?: number,
  credentials: SquarespaceCommerceCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSquarespaceClient(credentials);
    
    const productData: Record<string, unknown> = {
      name,
      ...(description && { description }),
      ...(price !== undefined && { price }),
      ...(sku && { sku }),
      ...(inventory !== undefined && { inventory }),
    };

    const response = await client.post('/products', productData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        sku: response.data.sku,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Squarespace product creation failed',
        code: 'SQUARESPACE_CREATE_PRODUCT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get products from Squarespace Commerce
 */
export async function executeSquarespaceGetProducts(
  limit: number = 50,
  cursor?: string,
  credentials: SquarespaceCommerceCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createSquarespaceClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await client.get('/products', { params });

    return {
      success: true,
      output: {
        products: response.data.products || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Squarespace get products failed',
        code: 'SQUARESPACE_GET_PRODUCTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Squarespace Commerce connector action
 */
export async function executeSquarespaceCommerce(
  actionId: string,
  input: Record<string, unknown>,
  credentials: SquarespaceCommerceCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_product':
      const name = input.name as string;
      const description = input.description as string | undefined;
      const price = input.price as number | undefined;
      const sku = input.sku as string | undefined;
      const inventory = input.inventory as number | undefined;
      
      if (!name) {
        return {
          success: false,
          error: {
            message: 'name is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeSquarespaceCreateProduct(name, description, price, sku, inventory, credentials);

    case 'get_products':
      const limit = (input.limit as number) || 50;
      const cursor = input.cursor as string | undefined;
      return executeSquarespaceGetProducts(limit, cursor, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Squarespace Commerce action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

