/**
 * Bitbucket Connector Executor
 * 
 * Executes Bitbucket connector actions using the Bitbucket API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BitbucketCredentials {
  access_token: string;
  username?: string; // Bitbucket username (for some API calls)
}

/**
 * Create Bitbucket API client
 */
function createBitbucketClient(credentials: BitbucketCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.bitbucket.org/2.0',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a repository in Bitbucket
 */
export async function executeBitbucketCreateRepository(
  workspace: string,
  name: string,
  description?: string,
  isPrivate: boolean = true,
  credentials: BitbucketCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBitbucketClient(credentials);
    
    const repoData: Record<string, unknown> = {
      name,
      is_private: isPrivate,
      ...(description && { description }),
    };

    const response = await client.post(`/repositories/${workspace}/${name}`, repoData);

    return {
      success: true,
      output: {
        uuid: response.data.uuid,
        name: response.data.name,
        full_name: response.data.full_name,
        links: response.data.links,
        is_private: response.data.is_private,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Bitbucket repository creation failed',
        code: 'BITBUCKET_CREATE_REPO_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Create an issue in Bitbucket
 */
export async function executeBitbucketCreateIssue(
  workspace: string,
  repoSlug: string,
  title: string,
  content?: string,
  kind: 'bug' | 'enhancement' | 'proposal' | 'task' = 'task',
  priority: 'trivial' | 'minor' | 'major' | 'critical' | 'blocker' = 'major',
  credentials: BitbucketCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBitbucketClient(credentials);
    
    const issueData: Record<string, unknown> = {
      title,
      kind,
      priority,
      ...(content && { content: { raw: content, markup: 'markdown' } }),
    };

    const response = await client.post(`/repositories/${workspace}/${repoSlug}/issues`, issueData);

    return {
      success: true,
      output: {
        id: response.data.id,
        title: response.data.title,
        state: response.data.state,
        kind: response.data.kind,
        priority: response.data.priority,
        links: response.data.links,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Bitbucket issue creation failed',
        code: 'BITBUCKET_CREATE_ISSUE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get issues from Bitbucket
 */
export async function executeBitbucketGetIssues(
  workspace: string,
  repoSlug: string,
  state: 'new' | 'open' | 'resolved' | 'on hold' | 'invalid' | 'duplicate' | 'wontfix' | 'closed' = 'new',
  limit: number = 10,
  credentials: BitbucketCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBitbucketClient(credentials);
    
    const params = {
      q: `state="${state}"`,
      pagelen: limit,
    };

    const response = await client.get(`/repositories/${workspace}/${repoSlug}/issues`, { params });

    return {
      success: true,
      output: {
        issues: response.data.values || [],
        size: response.data.size,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Bitbucket get issues failed',
        code: 'BITBUCKET_GET_ISSUES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Bitbucket connector action
 */
export async function executeBitbucket(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BitbucketCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_repository':
    case 'create_repo':
      const workspace = input.workspace as string;
      const name = input.name as string;
      const description = input.description as string | undefined;
      const isPrivate = (input.isPrivate as boolean) !== false;
      
      if (!workspace || !name) {
        return {
          success: false,
          error: {
            message: 'workspace and name are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBitbucketCreateRepository(workspace, name, description, isPrivate, credentials);

    case 'create_issue':
      const issueWorkspace = input.workspace as string;
      const repoSlug = input.repoSlug as string;
      const title = input.title as string;
      const content = input.content as string | undefined;
      const kind = (input.kind as 'bug' | 'enhancement' | 'proposal' | 'task') || 'task';
      const priority = (input.priority as 'trivial' | 'minor' | 'major' | 'critical' | 'blocker') || 'major';
      
      if (!issueWorkspace || !repoSlug || !title) {
        return {
          success: false,
          error: {
            message: 'workspace, repoSlug, and title are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBitbucketCreateIssue(issueWorkspace, repoSlug, title, content, kind, priority, credentials);

    case 'get_issues':
      const getWorkspace = input.workspace as string;
      const getRepoSlug = input.repoSlug as string;
      const state = (input.state as 'new' | 'open' | 'resolved' | 'on hold' | 'invalid' | 'duplicate' | 'wontfix' | 'closed') || 'new';
      const limit = (input.limit as number) || 10;
      
      if (!getWorkspace || !getRepoSlug) {
        return {
          success: false,
          error: {
            message: 'workspace and repoSlug are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBitbucketGetIssues(getWorkspace, getRepoSlug, state, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Bitbucket action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

