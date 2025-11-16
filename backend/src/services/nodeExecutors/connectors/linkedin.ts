/**
 * LinkedIn Connector Executor
 * 
 * Executes LinkedIn connector actions using the LinkedIn API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface LinkedInCredentials {
  access_token: string;
}

/**
 * Create LinkedIn API client
 */
function createLinkedInClient(credentials: LinkedInCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.linkedin.com/v2',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a post on LinkedIn
 */
export async function executeLinkedInCreatePost(
  text: string,
  visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC',
  credentials: LinkedInCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createLinkedInClient(credentials);
    
    // First, get the user's profile to get their URN
    const profileResponse = await client.get('/me');
    const personUrn = profileResponse.data.id;
    
    // Create the post
    const postData = {
      author: `urn:li:person:${personUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };
    
    const response = await client.post('/ugcPosts', postData);
    
    return {
      success: true,
      output: {
        id: response.data.id,
        activity: response.data.activity,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'LinkedIn post creation failed',
        code: 'LINKEDIN_CREATE_POST_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get user profile from LinkedIn
 */
export async function executeLinkedInGetProfile(
  credentials: LinkedInCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createLinkedInClient(credentials);
    
    const response = await client.get('/me', {
      params: {
        projection: '(id,firstName,lastName,profilePicture(displayImage~:playableStreams))',
      },
    });
    
    return {
      success: true,
      output: {
        profile: response.data,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'LinkedIn get profile failed',
        code: 'LINKEDIN_GET_PROFILE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute LinkedIn connector action
 */
export async function executeLinkedIn(
  actionId: string,
  input: Record<string, unknown>,
  credentials: LinkedInCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_post':
      const text = input.text as string;
      const visibility = (input.visibility as 'PUBLIC' | 'CONNECTIONS') || 'PUBLIC';
      
      if (!text) {
        return {
          success: false,
          error: {
            message: 'text is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeLinkedInCreatePost(text, visibility, credentials);

    case 'get_profile':
      return executeLinkedInGetProfile(credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown LinkedIn action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

