/**
 * Linear Connector Executor
 * 
 * Executes Linear connector actions using the Linear API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface LinearCredentials {
  api_key: string;
}

/**
 * Create Linear API client
 */
function createLinearClient(credentials: LinearCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.linear.app/graphql',
    headers: {
      'Authorization': credentials.api_key,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create an issue in Linear
 */
export async function executeLinearCreateIssue(
  teamId: string,
  title: string,
  description?: string,
  priority?: number, // 0-4, where 0 = No priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low
  stateId?: string,
  assigneeId?: string,
  credentials: LinearCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createLinearClient(credentials);
    
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
            priority
            state {
              name
            }
          }
        }
      }
    `;

    const variables: Record<string, unknown> = {
      input: {
        teamId,
        title,
        ...(description && { description }),
        ...(priority !== undefined && { priority }),
        ...(stateId && { stateId }),
        ...(assigneeId && { assigneeId }),
      },
    };

    const response = await client.post('', {
      query: mutation,
      variables,
    });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return {
      success: true,
      output: {
        id: response.data.data.issueCreate.issue.id,
        identifier: response.data.data.issueCreate.issue.identifier,
        title: response.data.data.issueCreate.issue.title,
        url: response.data.data.issueCreate.issue.url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Linear issue creation failed',
        code: 'LINEAR_CREATE_ISSUE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get issues from Linear
 */
export async function executeLinearGetIssues(
  teamId?: string,
  first: number = 10,
  credentials: LinearCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createLinearClient(credentials);
    
    const query = `
      query GetIssues($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              name
            }
            assignee {
              name
            }
            url
          }
        }
      }
    `;

    const variables: Record<string, unknown> = {
      first,
      ...(teamId && {
        filter: {
          team: {
            id: {
              eq: teamId,
            },
          },
        },
      }),
    };

    const response = await client.post('', {
      query,
      variables,
    });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    return {
      success: true,
      output: {
        issues: response.data.data.issues.nodes || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.errors?.[0]?.message || error.message || 'Linear get issues failed',
        code: 'LINEAR_GET_ISSUES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Linear connector action
 */
export async function executeLinear(
  actionId: string,
  input: Record<string, unknown>,
  credentials: LinearCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_issue':
      const teamId = input.teamId as string;
      const title = input.title as string;
      const description = input.description as string | undefined;
      const priority = input.priority as number | undefined;
      const stateId = input.stateId as string | undefined;
      const assigneeId = input.assigneeId as string | undefined;
      
      if (!teamId || !title) {
        return {
          success: false,
          error: {
            message: 'teamId and title are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeLinearCreateIssue(teamId, title, description, priority, stateId, assigneeId, credentials);

    case 'get_issues':
      const getTeamId = input.teamId as string | undefined;
      const first = (input.first as number) || 10;
      return executeLinearGetIssues(getTeamId, first, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Linear action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

