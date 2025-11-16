/**
 * GitLab Connector Executor
 * 
 * Executes GitLab connector actions using the GitLab API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface GitLabCredentials {
  access_token: string;
  base_url?: string; // For self-hosted GitLab instances
}

/**
 * Create GitLab API client
 */
function createGitLabClient(credentials: GitLabCredentials): AxiosInstance {
  const baseURL = credentials.base_url 
    ? `${credentials.base_url}/api/v4`
    : 'https://gitlab.com/api/v4';
  
  return axios.create({
    baseURL,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a project in GitLab
 */
export async function executeGitLabCreateProject(
  name: string,
  description?: string,
  visibility: 'private' | 'internal' | 'public' = 'private',
  credentials: GitLabCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGitLabClient(credentials);
    
    const projectData: Record<string, unknown> = {
      name,
      ...(description && { description }),
      visibility,
    };

    const response = await client.post('/projects', projectData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        path: response.data.path,
        web_url: response.data.web_url,
        ssh_url_to_repo: response.data.ssh_url_to_repo,
        http_url_to_repo: response.data.http_url_to_repo,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message?.[0] || error.message || 'GitLab project creation failed',
        code: 'GITLAB_CREATE_PROJECT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Create an issue in GitLab
 */
export async function executeGitLabCreateIssue(
  projectId: string | number,
  title: string,
  description?: string,
  labels?: string[],
  assigneeIds?: number[],
  credentials: GitLabCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGitLabClient(credentials);
    
    const issueData: Record<string, unknown> = {
      title,
      ...(description && { description }),
      ...(labels && labels.length > 0 && { labels: labels.join(',') }),
      ...(assigneeIds && assigneeIds.length > 0 && { assignee_ids: assigneeIds }),
    };

    const response = await client.post(`/projects/${projectId}/issues`, issueData);

    return {
      success: true,
      output: {
        id: response.data.id,
        iid: response.data.iid,
        title: response.data.title,
        web_url: response.data.web_url,
        state: response.data.state,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message?.[0] || error.message || 'GitLab issue creation failed',
        code: 'GITLAB_CREATE_ISSUE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get issues from GitLab
 */
export async function executeGitLabGetIssues(
  projectId: string | number,
  state: 'opened' | 'closed' | 'all' = 'opened',
  perPage: number = 20,
  credentials: GitLabCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createGitLabClient(credentials);
    
    const params = {
      state,
      per_page: perPage,
    };

    const response = await client.get(`/projects/${projectId}/issues`, { params });

    return {
      success: true,
      output: {
        issues: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message?.[0] || error.message || 'GitLab get issues failed',
        code: 'GITLAB_GET_ISSUES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute GitLab connector action
 */
export async function executeGitLab(
  actionId: string,
  input: Record<string, unknown>,
  credentials: GitLabCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_project':
      const name = input.name as string;
      const description = input.description as string | undefined;
      const visibility = (input.visibility as 'private' | 'internal' | 'public') || 'private';
      
      if (!name) {
        return {
          success: false,
          error: {
            message: 'name is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeGitLabCreateProject(name, description, visibility, credentials);

    case 'create_issue':
      const projectId = input.projectId as string | number;
      const title = input.title as string;
      const issueDescription = input.description as string | undefined;
      const labels = input.labels as string[] | undefined;
      const assigneeIds = input.assigneeIds as number[] | undefined;
      
      if (!projectId || !title) {
        return {
          success: false,
          error: {
            message: 'projectId and title are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeGitLabCreateIssue(projectId, title, issueDescription, labels, assigneeIds, credentials);

    case 'get_issues':
      const getProjectId = input.projectId as string | number;
      const state = (input.state as 'opened' | 'closed' | 'all') || 'opened';
      const perPage = (input.perPage as number) || 20;
      
      if (!getProjectId) {
        return {
          success: false,
          error: {
            message: 'projectId is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeGitLabGetIssues(getProjectId, state, perPage, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown GitLab action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

