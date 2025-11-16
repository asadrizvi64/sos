/**
 * Streak Connector Executor
 * 
 * Executes Streak connector actions using the Streak API
 */

import axios, { AxiosInstance } from 'axios';
import { NodeExecutionResult } from '@sos/shared';

interface StreakCredentials {
  api_key: string;
}

/**
 * Create Streak API client
 */
function createStreakClient(credentials: StreakCredentials): AxiosInstance {
  return axios.create({
    baseURL: 'https://www.streak.com/api/v1',
    headers: {
      'Authorization': `Basic ${Buffer.from(credentials.api_key + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a box (deal/pipeline item) in Streak
 */
export async function executeStreakCreateBox(
  pipelineKey: string,
  name: string,
  stageKey?: string,
  fields?: Record<string, unknown>,
  credentials: StreakCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createStreakClient(credentials);
    
    const boxData: Record<string, unknown> = {
      name,
      ...(stageKey && { stageKey }),
      ...(fields && Object.keys(fields).length > 0 && { fields }),
    };

    const response = await client.put(`/pipelines/${pipelineKey}/boxes`, boxData);

    return {
      success: true,
      output: {
        key: response.data.key,
        name: response.data.name,
        stageKey: response.data.stageKey,
        pipelineKey: response.data.pipelineKey,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Streak box creation failed',
        code: 'STREAK_CREATE_BOX_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get boxes from Streak
 */
export async function executeStreakGetBoxes(
  pipelineKey?: string,
  limit: number = 25,
  credentials: StreakCredentials
): Promise<NodeExecutionResult> {
  try {
    const client = createStreakClient(credentials);
    
    const endpoint = pipelineKey ? `/pipelines/${pipelineKey}/boxes` : '/boxes';
    const params = {
      limit,
    };

    const response = await client.get(endpoint, { params });

    return {
      success: true,
      output: {
        results: response.data || [],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.response?.data?.error || error.message || 'Streak get boxes failed',
        code: 'STREAK_GET_BOXES_ERROR',
        details: error.response?.data,
      },
    };
  }
}

/**
 * Execute Streak connector action
 */
export async function executeStreak(
  actionId: string,
  input: Record<string, unknown>,
  credentials: StreakCredentials
): Promise<NodeExecutionResult> {
  switch (actionId) {
    case 'create_box':
      const pipelineKey = input.pipelineKey as string;
      const name = input.name as string;
      const stageKey = input.stageKey as string | undefined;
      const fields = input.fields as Record<string, unknown> | undefined;
      
      if (!pipelineKey || !name) {
        return {
          success: false,
          error: {
            message: 'pipelineKey and name are required',
            code: 'MISSING_PARAMETERS',
          },
        };
      }
      return executeStreakCreateBox(pipelineKey, name, stageKey, fields, credentials);

    case 'get_boxes':
      const getPipelineKey = input.pipelineKey as string | undefined;
      const limit = (input.limit as number) || 25;
      return executeStreakGetBoxes(getPipelineKey, limit, credentials);

    default:
      return {
        success: false,
        error: {
          message: `Unknown Streak action: ${actionId}`,
          code: 'UNKNOWN_ACTION',
        },
      };
  }
}

