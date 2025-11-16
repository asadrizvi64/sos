/**
 * Notion Connector Executor
 * 
 * Executes Notion connector actions using the Notion API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface NotionCredentials {
  api_key: string;
}

/**
 * Create Notion API client
 */
function createNotionClient(credentials: NotionCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.notion.com/v1',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a page in Notion
 */
export async function executeNotionCreatePage(
  parentId: string,
  parentType: 'database_id' | 'page_id',
  title: string,
  properties?: Record<string, unknown>,
  content?: Array<Record<string, unknown>>,
  credentials: NotionCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNotionClient(credentials);
    
    const pageData: Record<string, unknown> = {
      parent: {
        [parentType]: parentId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
        ...properties,
      },
    };
    
    if (content && content.length > 0) {
      pageData.children = content;
    }

    const response = await client.post('/pages', pageData);

    return {
      success: true,
      output: {
        id: response.data.id,
        url: response.data.url,
        created_time: response.data.created_time,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Notion page creation failed',
        code: 'NOTION_CREATE_PAGE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get a page from Notion
 */
export async function executeNotionGetPage(
  pageId: string,
  credentials: NotionCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNotionClient(credentials);
    
    const response = await client.get(`/pages/${pageId}`);

    return {
      success: true,
      output: {
        id: response.data.id,
        url: response.data.url,
        properties: response.data.properties,
        created_time: response.data.created_time,
        last_edited_time: response.data.last_edited_time,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Notion get page failed',
        code: 'NOTION_GET_PAGE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Query a database in Notion
 */
export async function executeNotionQueryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, unknown>>,
  pageSize: number = 100,
  credentials: NotionCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNotionClient(credentials);
    
    const queryData: Record<string, unknown> = {
      page_size: pageSize,
    };
    
    if (filter) {
      queryData.filter = filter;
    }
    if (sorts) {
      queryData.sorts = sorts;
    }

    const response = await client.post(`/databases/${databaseId}/query`, queryData);

    return {
      success: true,
      output: {
        results: response.data.results || [],
        has_more: response.data.has_more,
        next_cursor: response.data.next_cursor,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Notion query database failed',
        code: 'NOTION_QUERY_DATABASE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Notion connector action
 */
export async function executeNotion(
  actionId: string,
  input: Record<string, unknown>,
  credentials: NotionCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_page':
      const parentId = input.parentId as string;
      const parentType = (input.parentType as 'database_id' | 'page_id') || 'page_id';
      const title = input.title as string;
      const properties = input.properties as Record<string, unknown> | undefined;
      const content = input.content as Array<Record<string, unknown>> | undefined;
      
      if (!parentId || !title) {
        return {
          success: false,
          error: {
            message: 'parentId and title are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeNotionCreatePage(parentId, parentType, title, properties, content, credentials);

    case 'get_page':
      const pageId = input.pageId as string;
      
      if (!pageId) {
        return {
          success: false,
          error: {
            message: 'pageId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeNotionGetPage(pageId, credentials);

    case 'query_database':
      const databaseId = input.databaseId as string;
      const filter = input.filter as Record<string, unknown> | undefined;
      const sorts = input.sorts as Array<Record<string, unknown>> | undefined;
      const pageSize = (input.pageSize as number) || 100;
      
      if (!databaseId) {
        return {
          success: false,
          error: {
            message: 'databaseId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeNotionQueryDatabase(databaseId, filter, sorts, pageSize, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Notion action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

