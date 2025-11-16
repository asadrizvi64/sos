/**
 * ClickUp Connector Executor
 * 
 * Executes ClickUp connector actions using the ClickUp API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ClickUpCredentials {
  api_key: string;
}

/**
 * Create ClickUp API client
 */
function createClickUpClient(credentials: ClickUpCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.clickup.com/api/v2',
    headers: {
      'Authorization': credentials.api_key,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a task in ClickUp
 */
export async function executeClickUpCreateTask(
  listId: string,
  name: string,
  description?: string,
  status?: string,
  priority?: 1 | 2 | 3 | 4, // 1=Urgent, 2=High, 3=Normal, 4=Low
  assignees?: string[],
  dueDate?: number, // Unix timestamp in milliseconds
  credentials: ClickUpCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createClickUpClient(credentials);
    
    const taskData: Record<string, unknown> = {
      name,
      ...(description && { description }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assignees && assignees.length > 0 && { assignees }),
      ...(dueDate && { due_date: dueDate }),
    };

    const response = await client.post(`/list/${listId}/task`, taskData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        status: response.data.status,
        url: response.data.url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.err || error.message || 'ClickUp task creation failed',
        code: 'CLICKUP_CREATE_TASK_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get tasks from ClickUp
 */
export async function executeClickUpGetTasks(
  listId: string,
  archived: boolean = false,
  page: number = 0,
  credentials: ClickUpCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createClickUpClient(credentials);
    
    const params = {
      archived: archived.toString(),
      page: page.toString(),
    };

    const response = await client.get(`/list/${listId}/task`, { params });

    return {
      success: true,
      output: {
        tasks: response.data.tasks || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.err || error.message || 'ClickUp get tasks failed',
        code: 'CLICKUP_GET_TASKS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute ClickUp connector action
 */
export async function executeClickUp(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ClickUpCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_task':
      const listId = input.listId as string;
      const name = input.name as string;
      const description = input.description as string | undefined;
      const status = input.status as string | undefined;
      const priority = input.priority as 1 | 2 | 3 | 4 | undefined;
      const assignees = input.assignees as string[] | undefined;
      const dueDate = input.dueDate as number | undefined;
      
      if (!listId || !name) {
        return {
          success: false,
          error: {
            message: 'listId and name are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeClickUpCreateTask(listId, name, description, status, priority, assignees, dueDate, credentials);

    case 'get_tasks':
      const getListId = input.listId as string;
      const archived = (input.archived as boolean) || false;
      const page = (input.page as number) || 0;
      
      if (!getListId) {
        return {
          success: false,
          error: {
            message: 'listId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeClickUpGetTasks(getListId, archived, page, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown ClickUp action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

