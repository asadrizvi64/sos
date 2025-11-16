/**
 * Instagram Connector Executor
 * 
 * Executes Instagram connector actions using the Instagram Graph API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface InstagramCredentials {
  access_token: string;
  instagram_business_account_id?: string;
}

/**
 * Create Instagram API client
 */
function createInstagramClient(credentials: InstagramCredentials): AxiosInstance {
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
 * Create a media container on Instagram
 */
export async function executeInstagramCreateMedia(
  imageUrl: string,
  caption: string,
  accountId?: string,
  credentials: InstagramCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createInstagramClient(credentials);
    
    const targetAccountId = accountId || credentials.instagram_business_account_id;
    
    if (!targetAccountId) {
      return {
        success: false,
        error: {
          message: 'Instagram Business Account ID is required',
          code: 'MISSING_ACCOUNT_ID',
        },
      };
    }
    
    // Step 1: Create media container
    const containerResponse = await client.post(`/${targetAccountId}/media`, {
      image_url: imageUrl,
      caption,
    });
    
    const creationId = containerResponse.data.id;
    
    // Step 2: Publish the media
    const publishResponse = await client.post(`/${targetAccountId}/media_publish`, {
      creation_id: creationId,
    });
    
    return {
      success: true,
      output: {
        id: publishResponse.data.id,
        creationId,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Instagram media creation failed',
        code: 'INSTAGRAM_CREATE_MEDIA_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get media from Instagram account
 */
export async function executeInstagramGetMedia(
  accountId?: string,
  limit: number = 25,
  credentials: InstagramCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createInstagramClient(credentials);
    
    const targetAccountId = accountId || credentials.instagram_business_account_id;
    
    if (!targetAccountId) {
      return {
        success: false,
        error: {
          message: 'Instagram Business Account ID is required',
          code: 'MISSING_ACCOUNT_ID',
        },
      };
    }
    
    const response = await client.get(`/${targetAccountId}/media`, {
      params: {
        limit,
        fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
      },
    });
    
    return {
      success: true,
      output: {
        media: response.data.data || [],
        paging: response.data.paging,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Instagram get media failed',
        code: 'INSTAGRAM_GET_MEDIA_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Instagram connector action
 */
export async function executeInstagram(
  actionId: string,
  input: Record<string, unknown>,
  credentials: InstagramCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_media':
      const imageUrl = input.imageUrl as string;
      const caption = input.caption as string;
      const accountId = input.accountId as string | undefined;
      
      if (!imageUrl || !caption) {
        return {
          success: false,
          error: {
            message: 'imageUrl and caption are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeInstagramCreateMedia(imageUrl, caption, accountId, credentials);

    case 'get_media':
      const getAccountId = input.accountId as string | undefined;
      const limit = (input.limit as number) || 25;
      return executeInstagramGetMedia(getAccountId, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Instagram action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

