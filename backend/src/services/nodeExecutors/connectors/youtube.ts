/**
 * YouTube Connector Executor
 * 
 * Executes YouTube connector actions using the YouTube Data API v3
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface YouTubeCredentials {
  api_key?: string;
  access_token?: string; // OAuth2 access token
}

/**
 * Create YouTube API client
 */
function createYouTubeClient(credentials: YouTubeCredentials): AxiosInstance {
  const authHeader = credentials.access_token
    ? `Bearer ${credentials.access_token}`
    : undefined;
  
  return axios.create({
    baseURL: 'https://www.googleapis.com/youtube/v3',
    headers: {
      ...(authHeader && { 'Authorization': authHeader }),
      'Content-Type': 'application/json',
    },
    params: {
      ...(credentials.api_key && { key: credentials.api_key }),
    },
  });
}

/**
 * Upload a video to YouTube
 */
export async function executeYouTubeUploadVideo(
  title: string,
  description: string,
  videoFileUrl: string, // URL to video file
  privacyStatus: 'private' | 'unlisted' | 'public' = 'private',
  tags?: string[],
  credentials: YouTubeCredentials
): Promise<NodeExecutionResult> {
  try {
    // Note: YouTube video upload requires multipart/form-data and file handling
    // This is a simplified version that would need file upload implementation
    return {
      success: false,
      error: {
        message: 'YouTube video upload requires file upload implementation. Please use YouTube API directly for video uploads.',
        code: 'YOUTUBE_UPLOAD_NOT_IMPLEMENTED',
        details: {
          title,
          description,
          privacyStatus,
          note: 'Video upload requires multipart/form-data and file handling which is not implemented in this connector.',
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message || 'YouTube video upload failed',
        code: 'YOUTUBE_UPLOAD_ERROR',
        details: error,
      },
    };
  }
}

/**
 * Get videos from YouTube channel
 */
export async function executeYouTubeGetVideos(
  channelId?: string,
  maxResults: number = 25,
  credentials: YouTubeCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createYouTubeClient(credentials);
    
    // If no channelId, get the authenticated user's channel
    let targetChannelId = channelId;
    if (!targetChannelId && credentials.access_token) {
      const channelResponse = await client.get('/channels', {
        params: {
          part: 'id',
          mine: true,
        },
      });
      if (channelResponse.data.items && channelResponse.data.items.length > 0) {
        targetChannelId = channelResponse.data.items[0].id;
      }
    }
    
    if (!targetChannelId) {
      return {
        success: false,
        error: {
          message: 'channelId is required or access_token must be provided',
          code: 'MISSING_CHANNEL_ID',
        },
      };
    }
    
    const response = await client.get('/search', {
      params: {
        part: 'snippet',
        channelId: targetChannelId,
        type: 'video',
        maxResults,
        order: 'date',
      },
    });
    
    return {
      success: true,
      output: {
        videos: response.data.items || [],
        pageInfo: response.data.pageInfo,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'YouTube get videos failed',
        code: 'YOUTUBE_GET_VIDEOS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute YouTube connector action
 */
export async function executeYouTube(
  actionId: string,
  input: Record<string, unknown>,
  credentials: YouTubeCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'upload_video':
      const title = input.title as string;
      const description = input.description as string;
      const videoFileUrl = input.videoFileUrl as string;
      const privacyStatus = (input.privacyStatus as 'private' | 'unlisted' | 'public') || 'private';
      const tags = input.tags as string[] | undefined;
      
      if (!title || !description || !videoFileUrl) {
        return {
          success: false,
          error: {
            message: 'title, description, and videoFileUrl are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeYouTubeUploadVideo(title, description, videoFileUrl, privacyStatus, tags, credentials);

    case 'get_videos':
      const channelId = input.channelId as string | undefined;
      const maxResults = (input.maxResults as number) || 25;
      return executeYouTubeGetVideos(channelId, maxResults, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown YouTube action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

