/**
 * Dropbox Connector Executor
 * 
 * Executes Dropbox connector actions using the Dropbox API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface DropboxCredentials {
  access_token: string;
}

/**
 * Create Dropbox API client
 */
function createDropboxClient(credentials: DropboxCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.dropboxapi.com/2',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Upload a file to Dropbox
 */
export async function executeDropboxUploadFile(
  path: string,
  content: string, // Base64 encoded or plain text
  mode: 'add' | 'overwrite' | 'update' = 'add',
  credentials: DropboxCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDropboxClient(credentials);
    
    // Dropbox requires content to be base64 encoded for upload
    const base64Content = Buffer.from(content).toString('base64');
    
    const uploadData = {
      path,
      mode: mode === 'add' ? 'add' : mode === 'overwrite' ? 'overwrite' : 'update',
      autorename: true,
      mute: false,
    };

    const response = await axios.post(
      'https://content.dropboxapi.com/2/files/upload',
      base64Content,
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Dropbox-API-Arg': JSON.stringify(uploadData),
          'Content-Type': 'application/octet-stream',
        },
      }
    );

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        path_lower: response.data.path_lower,
        size: response.data.size,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error_summary || error.message || 'Dropbox file upload failed',
        code: 'DROPBOX_UPLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * List files in Dropbox
 */
export async function executeDropboxListFiles(
  path: string = '',
  limit: number = 100,
  credentials: DropboxCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createDropboxClient(credentials);
    
    const listData = {
      path: path || '',
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
      include_mounted_folders: true,
      limit,
    };

    const response = await client.post('/files/list_folder', listData);

    return {
      success: true,
      output: {
        entries: response.data.entries || [],
        cursor: response.data.cursor,
        has_more: response.data.has_more,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error_summary || error.message || 'Dropbox list files failed',
        code: 'DROPBOX_LIST_FILES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Download a file from Dropbox
 */
export async function executeDropboxDownloadFile(
  path: string,
  credentials: DropboxCredentials
): Promise<NodeExecutionResult> {
  try {
    const downloadData = {
      path,
    };

    const response = await axios.post(
      'https://content.dropboxapi.com/2/files/download',
      null,
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Dropbox-API-Arg': JSON.stringify(downloadData),
        },
        responseType: 'text',
      }
    );

    return {
      success: true,
      output: {
        content: response.data,
        path: path,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error_summary || error.message || 'Dropbox file download failed',
        code: 'DROPBOX_DOWNLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Dropbox connector action
 */
export async function executeDropbox(
  actionId: string,
  input: Record<string, unknown>,
  credentials: DropboxCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'upload_file':
      const path = input.path as string;
      const content = input.content as string;
      const mode = (input.mode as 'add' | 'overwrite' | 'update') || 'add';
      
      if (!path || !content) {
        return {
          success: false,
          error: {
            message: 'path and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDropboxUploadFile(path, content, mode, credentials);

    case 'list_files':
      const listPath = (input.path as string) || '';
      const limit = (input.limit as number) || 100;
      return executeDropboxListFiles(listPath, limit, credentials);

    case 'download_file':
      const downloadPath = input.path as string;
      
      if (!downloadPath) {
        return {
          success: false,
          error: {
            message: 'path is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeDropboxDownloadFile(downloadPath, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Dropbox action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

