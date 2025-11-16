/**
 * Vercel Connector Executor
 * 
 * Executes Vercel connector actions using the Vercel API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface VercelCredentials {
  access_token: string;
  teamId?: string; // Optional team ID for team-scoped operations
}

/**
 * Create Vercel API client
 */
function createVercelClient(credentials: VercelCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.vercel.com',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
    params: credentials.teamId ? { teamId: credentials.teamId } : {},
  });
}

/**
 * Create a deployment in Vercel
 */
export async function executeVercelCreateDeployment(
  name: string,
  files: Record<string, string>, // File path -> file content
  projectSettings?: {
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    installCommand?: string;
  },
  credentials: VercelCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createVercelClient(credentials);
    
    const deploymentData: Record<string, unknown> = {
      name,
      files,
      ...(projectSettings && { projectSettings }),
    };

    const response = await client.post('/v13/deployments', deploymentData);

    return {
      success: true,
      output: {
        id: response.data.id,
        url: response.data.url,
        name: response.data.name,
        state: response.data.readyState,
        createdAt: response.data.createdAt,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Vercel deployment creation failed',
        code: 'VERCEL_CREATE_DEPLOYMENT_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get deployments from Vercel
 */
export async function executeVercelGetDeployments(
  projectId?: string,
  limit: number = 20,
  credentials: VercelCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createVercelClient(credentials);
    
    const params: Record<string, unknown> = {
      limit,
    };
    
    if (projectId) {
      params.projectId = projectId;
    }

    const response = await client.get('/v6/deployments', { params });

    return {
      success: true,
      output: {
        deployments: response.data.deployments || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Vercel get deployments failed',
        code: 'VERCEL_GET_DEPLOYMENTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * List projects in Vercel
 */
export async function executeVercelListProjects(
  limit: number = 20,
  credentials: VercelCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createVercelClient(credentials);
    
    const params = {
      limit,
    };

    const response = await client.get('/v9/projects', { params });

    return {
      success: true,
      output: {
        projects: response.data.projects || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'Vercel list projects failed',
        code: 'VERCEL_LIST_PROJECTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Vercel connector action
 */
export async function executeVercel(
  actionId: string,
  input: Record<string, unknown>,
  credentials: VercelCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_deployment':
      const name = input.name as string;
      const files = input.files as Record<string, string>;
      const projectSettings = input.projectSettings as Record<string, unknown> | undefined;
      
      if (!name || !files) {
        return {
          success: false,
          error: {
            message: 'name and files are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeVercelCreateDeployment(name, files, projectSettings, credentials);

    case 'get_deployments':
      const projectId = input.projectId as string | undefined;
      const limit = (input.limit as number) || 20;
      return executeVercelGetDeployments(projectId, limit, credentials);

    case 'list_projects':
      const listLimit = (input.limit as number) || 20;
      return executeVercelListProjects(listLimit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Vercel action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

