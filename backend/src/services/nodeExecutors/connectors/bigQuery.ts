/**
 * BigQuery Connector Executor
 * 
 * Executes BigQuery connector actions using the Google BigQuery API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface BigQueryCredentials {
  access_token: string;
  project_id: string;
}

/**
 * Create BigQuery API client
 */
function createBigQueryClient(credentials: BigQueryCredentials): AxiosInstance {
  return axios.create({
    baseURL: `https://bigquery.googleapis.com/bigquery/v2/projects/${credentials.project_id}`,
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Execute a query in BigQuery
 */
export async function executeBigQueryExecuteQuery(
  query: string,
  useLegacySql: boolean = false,
  maxResults?: number,
  credentials: BigQueryCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBigQueryClient(credentials);
    
    const queryData: Record<string, unknown> = {
      query,
      useLegacySql,
      ...(maxResults && { maxResults }),
    };

    const response = await client.post('/queries', { query: queryData });

    return {
      success: true,
      output: {
        jobReference: response.data.jobReference,
        rows: response.data.rows || [],
        totalRows: response.data.totalRows,
        schema: response.data.schema,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'BigQuery query execution failed',
        code: 'BIGQUERY_EXECUTE_QUERY_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get datasets from BigQuery
 */
export async function executeBigQueryGetDatasets(
  maxResults: number = 50,
  credentials: BigQueryCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createBigQueryClient(credentials);
    
    const params = {
      maxResults,
    };

    const response = await client.get('/datasets', { params });

    return {
      success: true,
      output: {
        datasets: response.data.datasets || [],
        totalItems: response.data.totalItems,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error?.message || error.message || 'BigQuery get datasets failed',
        code: 'BIGQUERY_GET_DATASETS_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute BigQuery connector action
 */
export async function executeBigQuery(
  actionId: string,
  input: Record<string, unknown>,
  credentials: BigQueryCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'execute_query':
      const query = input.query as string;
      const useLegacySql = (input.useLegacySql as boolean) || false;
      const maxResults = input.maxResults as number | undefined;
      
      if (!query) {
        return {
          success: false,
          error: {
            message: 'query is required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeBigQueryExecuteQuery(query, useLegacySql, maxResults, credentials);

    case 'get_datasets':
      const getMaxResults = (input.maxResults as number) || 50;
      return executeBigQueryGetDatasets(getMaxResults, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown BigQuery action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

