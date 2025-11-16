/**
 * Facebook/Meta Connector Executor
 * 
 * Executes Facebook connector actions using the Facebook Graph API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface FacebookCredentials {
  access_token: string;
  page_id?: string; // For page-specific operations
}

/**
 * Create Facebook API client
 */
function createFacebookClient(credentials: FacebookCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://graph.facebook.com/v18.0',
    headers: {
      'Content-Type': 'application/json',
    },
    params: {
      access_token: credentials.access_token,
    },
  });
}

/**
 * Create a post on Facebook
 */
export async function executeFacebookCreatePost(
  message: string,
  pageId?: string,
  link?: string,
  credentials: FacebookCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createFacebookClient(credentials);
    
    const targetId = pageId || credentials.page_id || 'me';
    
    const postData: Record<string, unknown> = {
      message,
    };
    
    if (link) {
      postData.link = link;
    }
    
    const response = await client.post(`/${targetId}/feed`, postData);
    
    return {
      success: true,
      output: {
        id: response.data.id,
        postId: response.data.id,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Facebook post creation failed',
        code: 'FACEBOOK_CREATE_POST_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get posts from Facebook page or profile
 */
export async function executeFacebookGetPosts(
  pageId?: string,
  limit: number = 25,
  credentials: FacebookCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createFacebookClient(credentials);
    
    const targetId = pageId || credentials.page_id || 'me';
    
    const response = await client.get(`/${targetId}/posts`, {
      params: {
        limit,
        fields: 'id,message,created_time,likes.summary(true),comments.summary(true)',
      },
    });
    
    return {
      success: true,
      output: {
        posts: response.data.data || [],
        paging: response.data.paging,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Facebook get posts failed',
        code: 'FACEBOOK_GET_POSTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Facebook connector action
 */
export async function executeFacebook(
  actionId: string,
  input: Record<string, unknown>,
  credentials: FacebookCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_post':
      const message = input.message as string;
      const pageId = input.pageId as string | undefined;
      const link = input.link as string | undefined;
      
      if (!message) {
        return {
          success: false,
          error: {
            message: 'message is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeFacebookCreatePost(message, pageId, link, credentials);

    case 'get_posts':
      const getPageId = input.pageId as string | undefined;
      const limit = (input.limit as number) || 25;
      return executeFacebookGetPosts(getPageId, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Facebook action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

