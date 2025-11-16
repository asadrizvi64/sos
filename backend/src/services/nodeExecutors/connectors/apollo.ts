/**
 * Apollo.io Connector Executor
 * 
 * Executes Apollo.io connector actions using the Apollo API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface ApolloCredentials {
  api_key: string;
}

/**
 * Create Apollo API client
 */
function createApolloClient(credentials: ApolloCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://api.apollo.io/v1',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    },
    params: {
      api_key: credentials.api_key,
    },
  });
}

/**
 * Search for people in Apollo
 */
export async function executeApolloSearchPeople(
  personTitles?: string[],
  personLocations?: string[],
  organizationDomains?: string[],
  page: number = 1,
  perPage: number = 25,
  credentials: ApolloCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createApolloClient(credentials);
    
    const searchData: Record<string, unknown> = {
      page,
      per_page: perPage,
      ...(personTitles && personTitles.length > 0 && { person_titles: personTitles }),
      ...(personLocations && personLocations.length > 0 && { person_locations: personLocations }),
      ...(organizationDomains && organizationDomains.length > 0 && { organization_domains: organizationDomains }),
    };

    const response = await client.post('/mixed_people/search', searchData);

    return {
      success: true,
      output: {
        people: response.data.people || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Apollo search people failed',
        code: 'APOLLO_SEARCH_PEOPLE_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Search for organizations in Apollo
 */
export async function executeApolloSearchOrganizations(
  organizationNames?: string[],
  organizationDomains?: string[],
  industries?: string[],
  page: number = 1,
  perPage: number = 25,
  credentials: ApolloCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createApolloClient(credentials);
    
    const searchData: Record<string, unknown> = {
      page,
      per_page: perPage,
      ...(organizationNames && organizationNames.length > 0 && { organization_names: organizationNames }),
      ...(organizationDomains && organizationDomains.length > 0 && { organization_domains: organizationDomains }),
      ...(industries && industries.length > 0 && { industries }),
    };

    const response = await client.post('/organizations/search', searchData);

    return {
      success: true,
      output: {
        organizations: response.data.organizations || [],
        pagination: response.data.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Apollo search organizations failed',
        code: 'APOLLO_SEARCH_ORGANIZATIONS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Apollo connector action
 */
export async function executeApollo(
  actionId: string,
  input: Record<string, unknown>,
  credentials: ApolloCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'search_people':
      const personTitles = input.personTitles as string[] | undefined;
      const personLocations = input.personLocations as string[] | undefined;
      const organizationDomains = input.organizationDomains as string[] | undefined;
      const page = (input.page as number) || 1;
      const perPage = (input.perPage as number) || 25;
      return executeApolloSearchPeople(personTitles, personLocations, organizationDomains, page, perPage, credentials);

    case 'search_organizations':
      const organizationNames = input.organizationNames as string[] | undefined;
      const searchOrgDomains = input.organizationDomains as string[] | undefined;
      const industries = input.industries as string[] | undefined;
      const orgPage = (input.page as number) || 1;
      const orgPerPage = (input.perPage as number) || 25;
      return executeApolloSearchOrganizations(organizationNames, searchOrgDomains, industries, orgPage, orgPerPage, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Apollo action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

