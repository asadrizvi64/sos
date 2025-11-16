/**
 * ZoomInfo Connector Executor
 * 
 * Executes ZoomInfo connector actions using the ZoomInfo API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ZoomInfoCredentials {
  username: string;
  password: string;
}

/**
 * Get access token from ZoomInfo
 */
async function getZoomInfoAccessToken(credentials: ZoomInfoCredentials): Promise<string> {
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  
  const response = await axios.post(
    'https://api.zoominfo.com/authenticate',
    {},
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.token;
}

/**
 * Create ZoomInfo API client
 */
async function createZoomInfoClient(credentials: ZoomInfoCredentials): Promise<AxiosInstance> {
  const accessToken = await getZoomInfoAccessToken(credentials);
  
  return axios.create({
    baseURL: 'https://api.zoominfo.com',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Search for contacts in ZoomInfo
 */
export async function executeZoomInfoSearchContacts(
  companyName?: string,
  jobTitle?: string,
  location?: string,
  page: number = 1,
  pageSize: number = 10,
  credentials: ZoomInfoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = await createZoomInfoClient(credentials);
    
    const searchData: Record<string, unknown> = {
      outputFields: ['id', 'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'companyName'],
      pageNum: page,
      pageSize,
      ...(companyName && { companyName }),
      ...(jobTitle && { jobTitle }),
      ...(location && { location }),
    };

    const response = await client.post('/search/contact', searchData);

    return {
      success: true,
      output: {
        contacts: response.data.data || [],
        totalResults: response.data.totalResults,
        pageNum: response.data.pageNum,
        pageSize: response.data.pageSize,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'ZoomInfo search contacts failed',
        code: 'ZOOMINFO_SEARCH_CONTACTS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Search for companies in ZoomInfo
 */
export async function executeZoomInfoSearchCompanies(
  companyName?: string,
  industry?: string,
  location?: string,
  page: number = 1,
  pageSize: number = 10,
  credentials: ZoomInfoCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = await createZoomInfoClient(credentials);
    
    const searchData: Record<string, unknown> = {
      outputFields: ['id', 'name', 'website', 'industry', 'revenue', 'employeeCount', 'location'],
      pageNum: page,
      pageSize,
      ...(companyName && { companyName }),
      ...(industry && { industry }),
      ...(location && { location }),
    };

    const response = await client.post('/search/company', searchData);

    return {
      success: true,
      output: {
        companies: response.data.data || [],
        totalResults: response.data.totalResults,
        pageNum: response.data.pageNum,
        pageSize: response.data.pageSize,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message || 'ZoomInfo search companies failed',
        code: 'ZOOMINFO_SEARCH_COMPANIES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute ZoomInfo connector action
 */
export async function executeZoomInfo(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ZoomInfoCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'search_contacts':
      const companyName = input.companyName as string | undefined;
      const jobTitle = input.jobTitle as string | undefined;
      const location = input.location as string | undefined;
      const page = (input.page as number) || 1;
      const pageSize = (input.pageSize as number) || 10;
      return executeZoomInfoSearchContacts(companyName, jobTitle, location, page, pageSize, credentials);

    case 'search_companies':
      const searchCompanyName = input.companyName as string | undefined;
      const industry = input.industry as string | undefined;
      const searchLocation = input.location as string | undefined;
      const companyPage = (input.page as number) || 1;
      const companyPageSize = (input.pageSize as number) || 10;
      return executeZoomInfoSearchCompanies(searchCompanyName, industry, searchLocation, companyPage, companyPageSize, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown ZoomInfo action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

