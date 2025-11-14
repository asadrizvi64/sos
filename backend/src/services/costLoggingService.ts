/**
 * Cost Logging Service
 * 
 * Centralized service for logging LLM costs to the database.
 * Used by all services that make LLM calls.
 * Forwards cost logs to RudderStack for data warehouse ingestion.
 */

import { db } from '../config/database';
import { modelCostLogs } from '../../drizzle/schema';
import { createId } from '@paralleldrive/cuid2';
import { costCalculationService, CostCalculationResult } from './costCalculationService';
import { featureFlagService } from './featureFlagService';
import { rudderstackService } from './rudderstackService';

export interface CostLoggingContext {
  userId?: string | null;
  agentId?: string | null;
  workflowExecutionId?: string | null;
  nodeId?: string | null;
  organizationId?: string | null;
  workspaceId?: string | null;
  traceId?: string | null;
  prompt?: string | null;
  response?: string | null;
}

export interface CostLoggingInput {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  inputTokens: number;
  outputTokens: number;
  context: CostLoggingContext;
}

/**
 * Log LLM cost to database
 */
export async function logLLMCost(input: CostLoggingInput): Promise<void> {
  try {
    // Check if cost tracking is enabled
    const trackCosts = await featureFlagService.isEnabled(
      'track_model_costs',
      input.context.userId || undefined,
      input.context.workspaceId || undefined
    );

    if (!trackCosts) {
      return; // Cost tracking disabled
    }

    // Calculate cost
    const costResult = costCalculationService.calculate({
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    });

    // Truncate prompt and response if too long
    const prompt = input.context.prompt 
      ? (input.context.prompt.length > 1000 ? input.context.prompt.substring(0, 1000) + '...' : input.context.prompt)
      : null;
    const response = input.context.response
      ? (input.context.response.length > 1000 ? input.context.response.substring(0, 1000) + '...' : input.context.response)
      : null;

    // Insert cost log
    const costLogId = createId();
    await db.insert(modelCostLogs).values({
      id: costLogId,
      userId: input.context.userId || null,
      agentId: input.context.agentId || null,
      workflowExecutionId: input.context.workflowExecutionId || null,
      nodeId: input.context.nodeId || null,
      modelName: input.model,
      provider: input.provider,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      tokensTotal: costResult.totalTokens,
      ratePer1k: costResult.ratePer1k || null,
      costUsd: costResult.costUsdCents,
      usdCost: costResult.totalCost.toString(),
      prompt,
      response,
      traceId: input.context.traceId || null,
      organizationId: input.context.organizationId || null,
      workspaceId: input.context.workspaceId || null,
      timestamp: new Date(),
      createdAt: new Date(),
    });

    // Forward to RudderStack for data warehouse ingestion
    if (input.context.userId && input.context.workspaceId) {
      try {
        rudderstackService.forwardCostLog({
          costLogId,
          userId: input.context.userId,
          workspaceId: input.context.workspaceId,
          organizationId: input.context.organizationId || undefined,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          totalTokens: costResult.totalTokens,
          costUsd: costResult.totalCost,
          costUsdCents: costResult.costUsdCents,
          inputCost: costResult.inputCost,
          outputCost: costResult.outputCost,
          inputCostPer1k: costResult.inputCostPer1k,
          outputCostPer1k: costResult.outputCostPer1k,
          agentId: input.context.agentId || undefined,
          workflowExecutionId: input.context.workflowExecutionId || undefined,
          nodeId: input.context.nodeId || undefined,
          traceId: input.context.traceId || undefined,
          timestamp: new Date().toISOString(),
        });
      } catch (rudderError: any) {
        // Log but don't throw - RudderStack forwarding should not break cost logging
        console.warn('[Cost Logging] Failed to forward cost log to RudderStack:', rudderError);
      }
    }
  } catch (error: any) {
    // Don't throw - cost logging should not break execution
    console.error('[Cost Logging] Failed to log cost:', error);
  }
}

/**
 * Log cost from token usage object (from LangChain response)
 */
export async function logCostFromTokenUsage(
  provider: 'openai' | 'anthropic' | 'google',
  model: string,
  tokenUsage: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
  context: CostLoggingContext
): Promise<void> {
  // Extract input/output tokens
  const inputTokens = tokenUsage.promptTokens || tokenUsage.inputTokens || 0;
  const outputTokens = tokenUsage.completionTokens || tokenUsage.outputTokens || 0;

  // If we only have totalTokens, estimate split
  let finalInputTokens = inputTokens;
  let finalOutputTokens = outputTokens;

  if (tokenUsage.totalTokens && inputTokens === 0 && outputTokens === 0) {
    // Estimate 60/40 split (input/output)
    finalInputTokens = Math.floor(tokenUsage.totalTokens * 0.6);
    finalOutputTokens = tokenUsage.totalTokens - finalInputTokens;
  }

  await logLLMCost({
    provider,
    model,
    inputTokens: finalInputTokens,
    outputTokens: finalOutputTokens,
    context,
  });
}

/**
 * Cost Logging Service class
 */
export class CostLoggingService {
  /**
   * Log LLM cost
   */
  async log(input: CostLoggingInput): Promise<void> {
    return logLLMCost(input);
  }

  /**
   * Log cost from token usage
   */
  async logFromTokenUsage(
    provider: 'openai' | 'anthropic' | 'google',
    model: string,
    tokenUsage: {
      promptTokens?: number;
      completionTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    },
    context: CostLoggingContext
  ): Promise<void> {
    return logCostFromTokenUsage(provider, model, tokenUsage, context);
  }
}

// Export singleton instance
export const costLoggingService = new CostLoggingService();

