/**
 * BigCommerce Connector Executor
 * 
 * Executes BigCommerce connector actions using the BigCommerce API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BigCommerceCredentials {
  access_token: string;
  store_hash: string;
  client_id?: string;
}

/**
 * Create BigCommerce API client
 */
function createBigCommerceClient(credentials: BigCommerceCredentials): AxiosInstance {
  const baseURL = `https://api.bigcommerce.com/stores/${credentials.store_hash}/v3`;
  
  return axios.create({
    baseURL,
    headers: {
      'X-Auth-Token': credentials.access_token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
}

/**
 * Create a product in BigCommerce
 */
export async function executeBigCommerceCreateProduct(
  name: string,
  type: 'physical' | 'digital' = 'physical',
  weight?: number,
  price: string = '0.00',
  categories?: number[],
  credentials: BigCommerceCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBigCommerceClient(credentials);
    
    const productData: Record<string, unknown> = {
      name,
      type,
      price,
      ...(weight && { weight }),
      ...(categories && categories.length > 0 && { categories }),
    };

    const response = await client.post('/catalog/products', productData);

    return {
      success: true,
      output: {
        id: response.data.data.id,
        name: response.data.data.name,
        price: response.data.data.price,
        type: response.data.data.type,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'BigCommerce product creation failed',
        code: 'BIGCOMMERCE_CREATE_PRODUCT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get products from BigCommerce
 */
export async function executeBigCommerceGetProducts(
  limit: number = 10,
  page: number = 1,
  credentials: BigCommerceCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBigCommerceClient(credentials);
    
    const params = {
      limit,
      page,
    };

    const response = await client.get('/catalog/products', { params });

    return {
      success: true,
      output: {
        products: response.data.data || [],
        meta: response.data.meta,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'BigCommerce get products failed',
        code: 'BIGCOMMERCE_GET_PRODUCTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute BigCommerce connector action
 */
export async function executeBigCommerce(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BigCommerceCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_product':
      const name = input.name as string;
      const type = (input.type as 'physical' | 'digital') || 'physical';
      const weight = input.weight as number | undefined;
      const price = (input.price as string) || '0.00';
      const categories = input.categories as number[] | undefined;
      
      if (!name) {
        return {
          success: false,
          error: {
            message: 'name is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBigCommerceCreateProduct(name, type, weight, price, categories, credentials);

    case 'get_products':
      const limit = (input.limit as number) || 10;
      const page = (input.page as number) || 1;
      return executeBigCommerceGetProducts(limit, page, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown BigCommerce action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

