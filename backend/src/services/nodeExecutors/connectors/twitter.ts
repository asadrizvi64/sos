/**
 * Twitter/X Connector Executor
 * 
 * Executes Twitter connector actions using the Twitter API v2
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface TwitterCredentials {
  bearer_token?: string;
  api_key?: string;
  api_secret?: string;
  access_token?: string;
  access_token_secret?: string;
}

/**
 * Create Twitter API client
 */
function createTwitterClient(credentials: TwitterCredentials): AxiosInstance {
  const authHeader = credentials.bearer_token
    ? `Bearer ${credentials.bearer_token}`
    : undefined;
  
  return axios.create({
    baseURL: 'https://api.twitter.com/2',
    headers: {
      'Authorization': authHeader || '',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a tweet on Twitter
 */
export async function executeTwitterCreateTweet(
  text: string,
  replyToTweetId?: string,
  credentials: TwitterCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createTwitterClient(credentials);
    
    const tweetData: Record<string, unknown> = {
      text,
    };
    
    if (replyToTweetId) {
      tweetData.reply = {
        in_reply_to_tweet_id: replyToTweetId,
      };
    }
    
    const response = await client.post('/tweets', tweetData);
    
    return {
      success: true,
      output: {
        id: response.data.data.id,
        text: response.data.data.text,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Twitter tweet creation failed',
        code: 'TWITTER_CREATE_TWEET_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get user timeline from Twitter
 */
export async function executeTwitterGetTimeline(
  userId?: string,
  maxResults: number = 10,
  credentials: TwitterCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createTwitterClient(credentials);
    
    // If no userId provided, get the authenticated user's ID first
    let targetUserId = userId;
    if (!targetUserId) {
      const meResponse = await client.get('/users/me');
      targetUserId = meResponse.data.data.id;
    }
    
    const response = await client.get(`/users/${targetUserId}/tweets`, {
      params: {
        max_results: maxResults,
        'tweet.fields': 'created_at,public_metrics',
      },
    });
    
    return {
      success: true,
      output: {
        tweets: response.data.data || [],
        meta: response.data.meta,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.detail || error.message || 'Twitter get timeline failed',
        code: 'TWITTER_GET_TIMELINE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Twitter connector action
 */
export async function executeTwitter(
  actionId: string,
  input: Record<string, unknown>,
  credentials: TwitterCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_tweet':
      const text = input.text as string;
      const replyToTweetId = input.replyToTweetId as string | undefined;
      
      if (!text) {
        return {
          success: false,
          error: {
            message: 'text is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeTwitterCreateTweet(text, replyToTweetId, credentials);

    case 'get_timeline':
      const userId = input.userId as string | undefined;
      const maxResults = (input.maxResults as number) || 10;
      return executeTwitterGetTimeline(userId, maxResults, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Twitter action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

