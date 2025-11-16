/**
 * Wrike Connector Executor
 * 
 * Executes Wrike connector actions using the Wrike API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface WrikeCredentials {
  access_token: string;
}

/**
 * Create Wrike API client
 */
function createWrikeClient(credentials: WrikeCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://www.wrike.com/api/v4',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a task in Wrike
 */
export async function executeWrikeCreateTask(
  folderId: string,
  title: string,
  description?: string,
  status?: 'Active' | 'Completed' | 'Deferred' | 'Cancelled',
  priority?: 'High' | 'Normal' | 'Low',
  assignees?: string[],
  dueDate?: string, // ISO 8601 format
  credentials: WrikeCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createWrikeClient(credentials);
    
    const taskData: Record<string, unknown> = {
      title,
      ...(description && { description }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assignees && assignees.length > 0 && { responsibles: assignees }),
      ...(dueDate && { dates: { due: dueDate } }),
    };

    const response = await client.post(`/folders/${folderId}/tasks`, taskData);

    return {
      success: true,
      output: {
        id: response.data.data[0].id,
        title: response.data.data[0].title,
        status: response.data.data[0].status,
        priority: response.data.data[0].priority,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errorDescription || error.message || 'Wrike task creation failed',
        code: 'WRIKE_CREATE_TASK_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get tasks from Wrike
 */
export async function executeWrikeGetTasks(
  folderId?: string,
  status?: 'Active' | 'Completed' | 'Deferred' | 'Cancelled',
  limit: number = 100,
  credentials: WrikeCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createWrikeClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
      ...(status && { status }),
    };

    const endpoint = folderId ? `/folders/${folderId}/tasks` : '/tasks';
    const response = await client.get(endpoint, { params });

    return {
      success: true,
      output: {
        tasks: response.data.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errorDescription || error.message || 'Wrike get tasks failed',
        code: 'WRIKE_GET_TASKS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Wrike connector action
 */
export async function executeWrike(
  actionId: string,
  input: Record<string, unknown>,
  credentials: WrikeCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_task':
      const folderId = input.folderId as string;
      const title = input.title as string;
      const description = input.description as string | undefined;
      const status = input.status as 'Active' | 'Completed' | 'Deferred' | 'Cancelled' | undefined;
      const priority = input.priority as 'High' | 'Normal' | 'Low' | undefined;
      const assignees = input.assignees as string[] | undefined;
      const dueDate = input.dueDate as string | undefined;
      
      if (!folderId || !title) {
        return {
          success: false,
          error: {
            message: 'folderId and title are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeWrikeCreateTask(folderId, title, description, status, priority, assignees, dueDate, credentials);

    case 'get_tasks':
      const getFolderId = input.folderId as string | undefined;
      const getStatus = input.status as 'Active' | 'Completed' | 'Deferred' | 'Cancelled' | undefined;
      const limit = (input.limit as number) || 100;
      return executeWrikeGetTasks(getFolderId, getStatus, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Wrike action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

