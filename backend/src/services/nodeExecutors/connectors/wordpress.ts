/**
 * WordPress Connector Executor
 * 
 * Executes WordPress connector actions using the WordPress REST API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface WordPressCredentials {
  site_url: string; // e.g., 'https://yoursite.com'
  username?: string; // For Application Password auth
  application_password?: string; // WordPress Application Password
  access_token?: string; // For OAuth2
}

/**
 * Create WordPress API client
 */
function createWordPressClient(credentials: WordPressCredentials): AxiosInstance {
  const baseURL = credentials.site_url.endsWith('/')
    ? `${credentials.site_url}wp-json/wp/v2`
    : `${credentials.site_url}/wp-json/wp/v2`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Use Application Password if provided
  if (credentials.username && credentials.application_password) {
    const auth = Buffer.from(`${credentials.username}:${credentials.application_password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else if (credentials.access_token) {
    headers['Authorization'] = `Bearer ${credentials.access_token}`;
  }
  
  return axios.create({
    baseURL,
    headers,
  });
}

/**
 * Create a post in WordPress
 */
export async function executeWordPressCreatePost(
  title: string,
  content: string,
  status: 'publish' | 'draft' | 'pending' | 'private' = 'draft',
  excerpt?: string,
  categories?: number[],
  tags?: number[],
  featuredMedia?: number,
  credentials: WordPressCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createWordPressClient(credentials);
    
    const postData: Record<string, unknown> = {
      title,
      content,
      status,
      ...(excerpt && { excerpt }),
      ...(categories && categories.length > 0 && { categories }),
      ...(tags && tags.length > 0 && { tags }),
      ...(featuredMedia && { featured_media: featuredMedia }),
    };
    
    const response = await client.post('/posts', postData);
    
    return {
      success: true,
      output: {
        id: response.data.id,
        title: response.data.title.rendered,
        link: response.data.link,
        status: response.data.status,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'WordPress post creation failed',
        code: 'WORDPRESS_CREATE_POST_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get posts from WordPress
 */
export async function executeWordPressGetPosts(
  perPage: number = 10,
  page: number = 1,
  status?: string,
  categories?: number[],
  credentials: WordPressCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createWordPressClient(credentials);
    
    const params: Record<string, unknown> = {
      per_page: perPage,
      page,
      ...(status && { status }),
      ...(categories && categories.length > 0 && { categories: categories.join(',') }),
    };
    
    const response = await client.get('/posts', { params });
    
    return {
      success: true,
      output: {
        posts: response.data || [],
        totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10),
        total: parseInt(response.headers['x-wp-total'] || '0', 10),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'WordPress get posts failed',
        code: 'WORDPRESS_GET_POSTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute WordPress connector action
 */
export async function executeWordPress(
  actionId: string,
  input: Record<string, unknown>,
  credentials: WordPressCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_post':
      const title = input.title as string;
      const content = input.content as string;
      const status = (input.status as 'publish' | 'draft' | 'pending' | 'private') || 'draft';
      const excerpt = input.excerpt as string | undefined;
      const categories = input.categories as number[] | undefined;
      const tags = input.tags as number[] | undefined;
      const featuredMedia = input.featuredMedia as number | undefined;
      
      if (!title || !content) {
        return {
          success: false,
          error: {
            message: 'title and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeWordPressCreatePost(title, content, status, excerpt, categories, tags, featuredMedia, credentials);

    case 'get_posts':
      const perPage = (input.perPage as number) || 10;
      const page = (input.page as number) || 1;
      const getStatus = input.status as string | undefined;
      const getCategories = input.categories as number[] | undefined;
      return executeWordPressGetPosts(perPage, page, getStatus, getCategories, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown WordPress action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

