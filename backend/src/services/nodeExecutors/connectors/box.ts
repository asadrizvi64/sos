/**
 * Box Connector Executor
 * 
 * Executes Box connector actions using the Box API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BoxCredentials {
  access_token: string;
}

/**
 * Create Box API client
 */
function createBoxClient(credentials: BoxCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.box.com/2.0',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Upload a file to Box
 */
export async function executeBoxUploadFile(
  parentFolderId: string,
  fileName: string,
  content: string, // Base64 encoded or plain text
  credentials: BoxCredentials
): Promise<NodeExecutionResult> {
  try {
    // Box requires multipart form data for file uploads
    const fileContent = Buffer.from(content, 'base64');
    
    const formData = new FormData();
    const blob = new Blob([fileContent], { type: 'application/octet-stream' });
    formData.append('file', blob, fileName);
    formData.append('parent_id', parentFolderId);

    const response = await axios.post(
      'https://upload.box.com/api/2.0/files/content',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return {
      success: true,
      output: {
        id: response.data.entries[0].id,
        name: response.data.entries[0].name,
        size: response.data.entries[0].size,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Box file upload failed',
        code: 'BOX_UPLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * List files in Box
 */
export async function executeBoxListFiles(
  folderId: string = '0', // 0 = root folder
  limit: number = 100,
  credentials: BoxCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBoxClient(credentials);
    
    const params = {
      limit,
    };

    const response = await client.get(`/folders/${folderId}/items`, { params });

    return {
      success: true,
      output: {
        entries: response.data.entries || [],
        total_count: response.data.total_count,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Box list files failed',
        code: 'BOX_LIST_FILES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Download a file from Box
 */
export async function executeBoxDownloadFile(
  fileId: string,
  credentials: BoxCredentials
): Promise<NodeExecutionResult> {
  try {
    // First get file info
    const client = createBoxClient(credentials);
    const fileInfo = await client.get(`/files/${fileId}`);
    
    // Download file content
    const response = await axios.get(
      `https://api.box.com/2.0/files/${fileId}/content`,
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
        id: fileInfo.data.id,
        name: fileInfo.data.name,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Box file download failed',
        code: 'BOX_DOWNLOAD_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Box connector action
 */
export async function executeBox(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BoxCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'upload_file':
      const parentFolderId = (input.parentFolderId as string) || '0';
      const fileName = input.fileName as string;
      const content = input.content as string;
      
      if (!fileName || !content) {
        return {
          success: false,
          error: {
            message: 'fileName and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBoxUploadFile(parentFolderId, fileName, content, credentials);

    case 'list_files':
      const folderId = (input.folderId as string) || '0';
      const limit = (input.limit as number) || 100;
      return executeBoxListFiles(folderId, limit, credentials);

    case 'download_file':
      const fileId = input.fileId as string;
      
      if (!fileId) {
        return {
          success: false,
          error: {
            message: 'fileId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBoxDownloadFile(fileId, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Box action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

