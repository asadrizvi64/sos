/**
 * StackStorm Workflow Service
 * 
 * Service for managing and executing StackStorm recovery workflows
 */

import { stackstormService } from './stackstormService';
import { stackstormConfig } from '../config/stackstorm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Recovery workflow parameters
 */
export interface AgentRecoveryParams {
  agent_id: string;
  failure_type: 'timeout' | 'error' | 'invalid_output' | 'tool_failure' | 'llm_error' | 'unknown';
  original_query: string;
  failure_details?: Record<string, any>;
  context?: Record<string, any>;
  max_retries?: number;
  retry_delay?: number;
}

/**
 * LLM retry parameters
 */
export interface LLMRetryParams {
  original_request: {
    prompt: string;
    model: string;
    parameters?: Record<string, any>;
  };
  failure_reason: string;
  max_retries?: number;
  fallback_models?: string[];
}

/**
 * Reroute parameters
 */
export interface RerouteParams {
  original_request: Record<string, any>;
  failure_reason: string;
  fallback_regions?: string[];
  fallback_providers?: string[];
}

/**
 * StackStorm Workflow Service
 */
export class StackStormWorkflowService {
  private packPath: string;

  constructor() {
    // Path to StackStorm pack directory
    // ESM-compatible __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.packPath = path.join(__dirname, '../../stackstorm-packs/synthralos');
  }

  /**
   * Check if StackStorm is available
   */
  async isAvailable(): Promise<boolean> {
    if (!stackstormConfig.enabled) {
      return false;
    }
    return await stackstormService.isAvailable();
  }

  /**
   * Execute agent recovery workflow
   */
  async executeAgentRecovery(params: AgentRecoveryParams): Promise<any> {
    if (!await this.isAvailable()) {
      throw new Error('StackStorm is not available');
    }

    try {
      const execution = await stackstormService.executeAction(
        'synthralos.agent_recovery',
        {
          agent_id: params.agent_id,
          failure_type: params.failure_type,
          original_query: params.original_query,
          failure_details: params.failure_details || {},
          context: params.context || {},
          max_retries: params.max_retries || 3,
          retry_delay: params.retry_delay || 5,
        }
      );

      // Wait for execution to complete (with timeout)
      const result = await stackstormService.waitForExecution(
        execution.id,
        300000 // 5 minutes timeout
      );

      return {
        success: result.status === 'succeeded',
        executionId: result.id,
        result: result.result,
        status: result.status,
      };
    } catch (error: any) {
      console.error('[StackStorm Workflow] Agent recovery failed:', error);
      throw new Error(`Agent recovery workflow failed: ${error.message}`);
    }
  }

  /**
   * Execute LLM retry workflow
   */
  async executeLLMRetry(params: LLMRetryParams): Promise<any> {
    if (!await this.isAvailable()) {
      throw new Error('StackStorm is not available');
    }

    try {
      const execution = await stackstormService.executeAction(
        'synthralos.llm_retry',
        {
          original_request: params.original_request,
          failure_reason: params.failure_reason,
          max_retries: params.max_retries || 3,
          fallback_models: params.fallback_models || [],
        }
      );

      // Wait for execution to complete
      const result = await stackstormService.waitForExecution(
        execution.id,
        180000 // 3 minutes timeout
      );

      return {
        success: result.status === 'succeeded' && result.result?.success,
        executionId: result.id,
        result: result.result,
        status: result.status,
      };
    } catch (error: any) {
      console.error('[StackStorm Workflow] LLM retry failed:', error);
      throw new Error(`LLM retry workflow failed: ${error.message}`);
    }
  }

  /**
   * Execute reroute workflow
   */
  async executeReroute(params: RerouteParams): Promise<any> {
    if (!await this.isAvailable()) {
      throw new Error('StackStorm is not available');
    }

    try {
      const execution = await stackstormService.executeAction(
        'synthralos.reroute_request',
        {
          original_request: params.original_request,
          failure_reason: params.failure_reason,
          fallback_regions: params.fallback_regions || [],
          fallback_providers: params.fallback_providers || [],
        }
      );

      // Wait for execution to complete
      const result = await stackstormService.waitForExecution(
        execution.id,
        120000 // 2 minutes timeout
      );

      return {
        success: result.status === 'succeeded' && result.result?.success,
        executionId: result.id,
        result: result.result,
        status: result.status,
      };
    } catch (error: any) {
      console.error('[StackStorm Workflow] Reroute failed:', error);
      throw new Error(`Reroute workflow failed: ${error.message}`);
    }
  }

  /**
   * Get workflow execution status
   */
  async getExecutionStatus(executionId: string): Promise<any> {
    if (!await this.isAvailable()) {
      throw new Error('StackStorm is not available');
    }

    try {
      const execution = await stackstormService.getExecution(executionId);
      return {
        id: execution.id,
        status: execution.status,
        result: execution.result,
        startTimestamp: execution.startTimestamp,
        endTimestamp: execution.endTimestamp,
      };
    } catch (error: any) {
      console.error(`[StackStorm Workflow] Failed to get execution ${executionId}:`, error);
      throw new Error(`Failed to get execution status: ${error.message}`);
    }
  }

  /**
   * Cancel workflow execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    if (!await this.isAvailable()) {
      throw new Error('StackStorm is not available');
    }

    try {
      await stackstormService.cancelExecution(executionId);
    } catch (error: any) {
      console.error(`[StackStorm Workflow] Failed to cancel execution ${executionId}:`, error);
      throw new Error(`Failed to cancel execution: ${error.message}`);
    }
  }

  /**
   * Get pack path (for deployment scripts)
   */
  getPackPath(): string {
    return this.packPath;
  }
}

// Singleton instance
export const stackstormWorkflowService = new StackStormWorkflowService();

