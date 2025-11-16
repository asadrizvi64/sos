/**
 * Basecamp Connector Executor
 * 
 * Executes Basecamp connector actions using the Basecamp API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BasecampCredentials {
  access_token: string;
  refresh_token: string;
  account_id: string;
}

/**
 * Create Basecamp API client
 */
function createBasecampClient(credentials: BasecampCredentials): AxiosInstance {
  return axios.create({
    baseURL: `https://3.basecampapi.com/${credentials.account_id}`,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SOS Platform (your-email@example.com)',
    },
  });
}

/**
 * Create a todo in Basecamp
 */
export async function executeBasecampCreateTodo(
  projectId: string,
  todoSetId: string,
  content: string,
  notes?: string,
  dueOn?: string, // ISO 8601 date
  assigneeIds?: number[],
  credentials: BasecampCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBasecampClient(credentials);
    
    const todoData: Record<string, unknown> = {
      content,
      ...(notes && { notes }),
      ...(dueOn && { due_on: dueOn }),
      ...(assigneeIds && assigneeIds.length > 0 && { assignee_ids: assigneeIds }),
    };

    const response = await client.post(`/projects/${projectId}/todosets/${todoSetId}/todos.json`, todoData);

    return {
      success: true,
      output: {
        id: response.data.id,
        content: response.data.content,
        status: response.data.status,
        due_on: response.data.due_on,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Basecamp todo creation failed',
        code: 'BASECAMP_CREATE_TODO_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get todos from Basecamp
 */
export async function executeBasecampGetTodos(
  projectId: string,
  todoSetId: string,
  status: 'open' | 'completed' | 'archived' = 'open',
  credentials: BasecampCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBasecampClient(credentials);
    
    const params = {
      status,
    };

    const response = await client.get(`/projects/${projectId}/todosets/${todoSetId}/todos.json`, { params });

    return {
      success: true,
      output: {
        todos: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Basecamp get todos failed',
        code: 'BASECAMP_GET_TODOS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Basecamp connector action
 */
export async function executeBasecamp(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BasecampCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_todo':
      const projectId = input.projectId as string;
      const todoSetId = input.todoSetId as string;
      const content = input.content as string;
      const notes = input.notes as string | undefined;
      const dueOn = input.dueOn as string | undefined;
      const assigneeIds = input.assigneeIds as number[] | undefined;
      
      if (!projectId || !todoSetId || !content) {
        return {
          success: false,
          error: {
            message: 'projectId, todoSetId, and content are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBasecampCreateTodo(projectId, todoSetId, content, notes, dueOn, assigneeIds, credentials);

    case 'get_todos':
      const getProjectId = input.projectId as string;
      const getTodoSetId = input.todoSetId as string;
      const status = (input.status as 'open' | 'completed' | 'archived') || 'open';
      
      if (!getProjectId || !getTodoSetId) {
        return {
          success: false,
          error: {
            message: 'projectId and todoSetId are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBasecampGetTodos(getProjectId, getTodoSetId, status, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Basecamp action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

