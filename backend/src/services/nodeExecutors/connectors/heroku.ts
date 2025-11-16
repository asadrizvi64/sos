/**
 * Heroku Connector Executor
 * 
 * Executes Heroku connector actions using the Heroku API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface HerokuCredentials {
  api_key: string;
}

/**
 * Create Heroku API client
 */
function createHerokuClient(credentials: HerokuCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.heroku.com',
    headers: {
      'Authorization': `Bearer ${credentials.api_key}`,
      'Accept': 'application/vnd.heroku+json; version=3',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create an app in Heroku
 */
export async function executeHerokuCreateApp(
  name?: string,
  region: string = 'us',
  stack?: string,
  credentials: HerokuCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createHerokuClient(credentials);
    
    const appData: Record<string, unknown> = {
      region,
      ...(name && { name }),
      ...(stack && { stack }),
    };

    const response = await client.post('/apps', appData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        web_url: response.data.web_url,
        git_url: response.data.git_url,
        region: response.data.region,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Heroku app creation failed',
        code: 'HEROKU_CREATE_APP_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get apps from Heroku
 */
export async function executeHerokuGetApps(
  credentials: HerokuCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createHerokuClient(credentials);
    
    const response = await client.get('/apps');

    return {
      success: true,
      output: {
        apps: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Heroku get apps failed',
        code: 'HEROKU_GET_APPS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Create a release in Heroku
 */
export async function executeHerokuCreateRelease(
  appId: string,
  slugId: string,
  description?: string,
  credentials: HerokuCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createHerokuClient(credentials);
    
    const releaseData: Record<string, unknown> = {
      slug: slugId,
      ...(description && { description }),
    };

    const response = await client.post(`/apps/${appId}/releases`, releaseData);

    return {
      success: true,
      output: {
        id: response.data.id,
        version: response.data.version,
        status: response.data.status,
        created_at: response.data.created_at,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'Heroku release creation failed',
        code: 'HEROKU_CREATE_RELEASE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Heroku connector action
 */
export async function executeHeroku(
  actionId: string,
  input: Record<string, unknown>,
  credentials: HerokuCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_app':
      const name = input.name as string | undefined;
      const region = (input.region as string) || 'us';
      const stack = input.stack as string | undefined;
      return executeHerokuCreateApp(name, region, stack, credentials);

    case 'get_apps':
      return executeHerokuGetApps(credentials);

    case 'create_release':
      const appId = input.appId as string;
      const slugId = input.slugId as string;
      const description = input.description as string | undefined;
      
      if (!appId || !slugId) {
        return {
          success: false,
          error: {
            message: 'appId and slugId are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeHerokuCreateRelease(appId, slugId, description, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Heroku action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

