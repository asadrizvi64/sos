/**
 * OneDrive Connector Executor
 * 
 * Executes OneDrive connector actions using the Microsoft Graph API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface OneDriveCredentials {
  access_token: string;
}

/**
 * Create Microsoft Graph API client for OneDrive
 */
function createOneDriveClient(credentials: OneDriveCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Upload a file to OneDrive
 */
export async function executeOneDriveUploadFile(
  path: string,
  content: string, // Base64 encoded or plain text
  credentials: OneDriveCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createOneDriveClient(credentials);
    
    // OneDrive uses PUT for file uploads
    const fileContent = Buffer.from(content, 'base64').toString('binary');
    
    const response = await axios.put(
      `https://graph.microsoft.com/v1.0/me/drive/root:${path}:/content`,
      fileContent,
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/octet-stream',
        },
      }
    );

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        webUrl: response.data.webUrl,
        size: response.data.size,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'OneDrive file upload failed',
        code: 'ONEDRIVE_UPLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * List files in OneDrive
 */
export async function executeOneDriveListFiles(
  path: string = '/',
  limit: number = 100,
  credentials: OneDriveCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createOneDriveClient(credentials);
    
    const drivePath = path === '/' ? '/me/drive/root/children' : `/me/drive/root:${path}:/children`;
    
    const params = {
      $top: limit,
    };

    const response = await client.get(drivePath, { params });

    return {
      success: true,
      output: {
        files: response.data.value || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'OneDrive list files failed',
        code: 'ONEDRIVE_LIST_FILES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Download a file from OneDrive
 */
export async function executeOneDriveDownloadFile(
  path: string,
  credentials: OneDriveCredentials
): Promise<NodeExecutionResult> {
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/me/drive/root:${path}:/content`,
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
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
        message: error.response?.data?.error?.message || error.message || 'OneDrive file download failed',
        code: 'ONEDRIVE_DOWNLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute OneDrive connector action
 */
export async function executeOneDrive(
  actionId: string,
  input: Record<string, unknown>,
  credentials: OneDriveCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'upload_file':
      const path = input.path as string;
      const content = input.content as string;
      
      if (!path || !content) {
        return {
          success: false,
          error: {
            message: 'path and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeOneDriveUploadFile(path, content, credentials);

    case 'list_files':
      const listPath = (input.path as string) || '/';
      const limit = (input.limit as number) || 100;
      return executeOneDriveListFiles(listPath, limit, credentials);

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
      return executeOneDriveDownloadFile(downloadPath, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown OneDrive action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

