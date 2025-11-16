/**
 * Magento Connector Executor
 * 
 * Executes Magento connector actions using the Magento REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface MagentoCredentials {
  access_token: string;
  base_url: string; // e.g., 'https://yourstore.com'
}

/**
 * Create Magento API client
 */
function createMagentoClient(credentials: MagentoCredentials): AxiosInstance {
  const baseURL = credentials.base_url.endsWith('/')
    ? `${credentials.base_url}rest/V1`
    : `${credentials.base_url}/rest/V1`;
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a product in Magento
 */
export async function executeMagentoCreateProduct(
  sku: string,
  name: string,
  price: number,
  typeId: 'simple' | 'configurable' | 'virtual' | 'bundle' | 'downloadable' = 'simple',
  attributeSetId?: number,
  status?: 1 | 2, // 1 = Enabled, 2 = Disabled
  visibility?: 1 | 2 | 3 | 4, // 1 = Not Visible, 2 = Catalog, 3 = Search, 4 = Catalog & Search
  credentials: MagentoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createMagentoClient(credentials);
    
    const productData: Record<string, unknown> = {
      product: {
        sku,
        name,
        price,
        type_id: typeId,
        ...(attributeSetId && { attribute_set_id: attributeSetId }),
        ...(status && { status }),
        ...(visibility && { visibility }),
      },
    };

    const response = await client.post('/products', productData);

    return {
      success: true,
      output: {
        id: response.data.id,
        sku: response.data.sku,
        name: response.data.name,
        price: response.data.price,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Magento product creation failed',
        code: 'MAGENTO_CREATE_PRODUCT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get products from Magento
 */
export async function executeMagentoGetProducts(
  searchCriteria?: {
    filterGroups?: Array<{
      filters?: Array<{
        field: string;
        value: string;
        conditionType?: string;
      }>;
    }>;
    pageSize?: number;
    currentPage?: number;
  },
  credentials: MagentoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createMagentoClient(credentials);
    
    const params: Record<string, unknown> = {};
    
    if (searchCriteria) {
      if (searchCriteria.pageSize) {
        params['searchCriteria[pageSize]'] = searchCriteria.pageSize;
      }
      if (searchCriteria.currentPage) {
        params['searchCriteria[currentPage]'] = searchCriteria.currentPage;
      }
      // Add filter groups if provided
      if (searchCriteria.filterGroups) {
        searchCriteria.filterGroups.forEach((group, groupIndex) => {
          if (group.filters) {
            group.filters.forEach((filter, filterIndex) => {
              params[`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][field]`] = filter.field;
              params[`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][value]`] = filter.value;
              if (filter.conditionType) {
                params[`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][conditionType]`] = filter.conditionType;
              }
            });
          }
        });
      }
    }

    const response = await client.get('/products', { params });

    return {
      success: true,
      output: {
        items: response.data.items || [],
        total_count: response.data.total_count,
        search_criteria: response.data.search_criteria,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Magento get products failed',
        code: 'MAGENTO_GET_PRODUCTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Magento connector action
 */
export async function executeMagento(
  actionId: string,
  input: Record<string, unknown>,
  credentials: MagentoCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_product':
      const sku = input.sku as string;
      const name = input.name as string;
      const price = input.price as number;
      const typeId = (input.typeId as 'simple' | 'configurable' | 'virtual' | 'bundle' | 'downloadable') || 'simple';
      const attributeSetId = input.attributeSetId as number | undefined;
      const status = input.status as 1 | 2 | undefined;
      const visibility = input.visibility as 1 | 2 | 3 | 4 | undefined;
      
      if (!sku || !name || price === undefined) {
        return {
          success: false,
          error: {
            message: 'sku, name, and price are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeMagentoCreateProduct(sku, name, price, typeId, attributeSetId, status, visibility, credentials);

    case 'get_products':
      const searchCriteria = input.searchCriteria as {
        filterGroups?: Array<{
          filters?: Array<{
            field: string;
            value: string;
            conditionType?: string;
          }>;
        }>;
        pageSize?: number;
        currentPage?: number;
      } | undefined;
      return executeMagentoGetProducts(searchCriteria, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Magento action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

