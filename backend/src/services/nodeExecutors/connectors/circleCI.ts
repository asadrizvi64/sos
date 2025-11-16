/**
 * CircleCI Connector Executor
 * 
 * Executes CircleCI connector actions using the CircleCI API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface CircleCICredentials {
  api_token: string;
}

/**
 * Create CircleCI API client
 */
function createCircleCIClient(credentials: CircleCICredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://circleci.com/api/v2',
    headers: {
      'Circle-Token': credentials.api_token,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Trigger a pipeline in CircleCI
 */
export async function executeCircleCITriggerPipeline(
  projectSlug: string, // e.g., "gh/username/repo"
  branch: string,
  parameters?: Record<string, unknown>,
  credentials: CircleCICredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCircleCIClient(credentials);
    
    const pipelineData: Record<string, unknown> = {
      branch,
      ...(parameters && Object.keys(parameters).length > 0 && { parameters }),
    };

    const response = await client.post(`/project/${projectSlug}/pipeline`, pipelineData);

    return {
      success: true,
      output: {
        id: response.data.id,
        number: response.data.number,
        state: response.data.state,
        created_at: response.data.created_at,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'CircleCI pipeline trigger failed',
        code: 'CIRCLECI_TRIGGER_PIPELINE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get pipelines from CircleCI
 */
export async function executeCircleCIGetPipelines(
  projectSlug?: string,
  branch?: string,
  pageToken?: string,
  credentials: CircleCICredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createCircleCIClient(credentials);
    
    const params: Record<string, unknown> = {};
    
    if (projectSlug) {
      params['project-slug'] = projectSlug;
    }
    if (branch) {
      params.branch = branch;
    }
    if (pageToken) {
      params['page-token'] = pageToken;
    }

    const response = await client.get('/pipeline', { params });

    return {
      success: true,
      output: {
        items: response.data.items || [],
        next_page_token: response.data.next_page_token,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'CircleCI get pipelines failed',
        code: 'CIRCLECI_GET_PIPELINES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute CircleCI connector action
 */
export async function executeCircleCI(
  actionId: string,
  input: Record<string, unknown>,
  credentials: CircleCICredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'trigger_pipeline':
      const projectSlug = input.projectSlug as string;
      const branch = input.branch as string;
      const parameters = input.parameters as Record<string, unknown> | undefined;
      
      if (!projectSlug || !branch) {
        return {
          success: false,
          error: {
            message: 'projectSlug and branch are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeCircleCITriggerPipeline(projectSlug, branch, parameters, credentials);

    case 'get_pipelines':
      const getProjectSlug = input.projectSlug as string | undefined;
      const getBranch = input.branch as string | undefined;
      const pageToken = input.pageToken as string | undefined;
      return executeCircleCIGetPipelines(getProjectSlug, getBranch, pageToken, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown CircleCI action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

