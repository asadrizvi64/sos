/**
 * Netlify Connector Executor
 * 
 * Executes Netlify connector actions using the Netlify API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface NetlifyCredentials {
  access_token: string;
}

/**
 * Create Netlify API client
 */
function createNetlifyClient(credentials: NetlifyCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.netlify.com/api/v1',
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a site in Netlify
 */
export async function executeNetlifyCreateSite(
  name: string,
  customDomain?: string,
  credentials: NetlifyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNetlifyClient(credentials);
    
    const siteData: Record<string, unknown> = {
      name,
      ...(customDomain && { custom_domain: customDomain }),
    };

    const response = await client.post('/sites', siteData);

    return {
      success: true,
      output: {
        id: response.data.id,
        name: response.data.name,
        url: response.data.url,
        admin_url: response.data.admin_url,
        ssl_url: response.data.ssl_url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.msg || error.message || 'Netlify site creation failed',
        code: 'NETLIFY_CREATE_SITE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Deploy to Netlify
 */
export async function executeNetlifyDeploy(
  siteId: string,
  files: Record<string, string>, // File path -> file content (base64 encoded)
  draft: boolean = false,
  credentials: NetlifyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNetlifyClient(credentials);
    
    // Create a deploy
    const deployData = {
      files,
      draft,
    };

    const response = await client.post(`/sites/${siteId}/deploys`, deployData);

    return {
      success: true,
      output: {
        id: response.data.id,
        deploy_id: response.data.deploy_id,
        state: response.data.state,
        deploy_url: response.data.deploy_url,
        deploy_ssl_url: response.data.deploy_ssl_url,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.msg || error.message || 'Netlify deploy failed',
        code: 'NETLIFY_DEPLOY_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get sites from Netlify
 */
export async function executeNetlifyGetSites(
  page: number = 1,
  perPage: number = 50,
  credentials: NetlifyCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createNetlifyClient(credentials);
    
    const params = {
      page,
      per_page: perPage,
    };

    const response = await client.get('/sites', { params });

    return {
      success: true,
      output: {
        sites: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.msg || error.message || 'Netlify get sites failed',
        code: 'NETLIFY_GET_SITES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Netlify connector action
 */
export async function executeNetlify(
  actionId: string,
  input: Record<string, unknown>,
  credentials: NetlifyCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_site':
      const name = input.name as string;
      const customDomain = input.customDomain as string | undefined;
      
      if (!name) {
        return {
          success: false,
          error: {
            message: 'name is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeNetlifyCreateSite(name, customDomain, credentials);

    case 'deploy':
      const siteId = input.siteId as string;
      const files = input.files as Record<string, string>;
      const draft = (input.draft as boolean) || false;
      
      if (!siteId || !files) {
        return {
          success: false,
          error: {
            message: 'siteId and files are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeNetlifyDeploy(siteId, files, draft, credentials);

    case 'get_sites':
      const page = (input.page as number) || 1;
      const perPage = (input.perPage as number) || 50;
      return executeNetlifyGetSites(page, perPage, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Netlify action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

