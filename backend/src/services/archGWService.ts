/**
 * ArchGW (Architecture Gateway) Service
 * 
 * High-level routing service that orchestrates prompt routing decisions
 * based on prompt length, region, cost, compliance, and other factors.
 * 
 * This service integrates with:
 * - GuardrailsService for validation and routing rules
 * - Feature flags for enabling/disabling routing features
 * - Organization settings for compliance and preferences
 */

import { guardrailsService, PromptLengthResult, RegionRoutingResult, CostTieringResult } from './guardrailsService';
import { featureFlagService } from './featureFlagService';
import { db } from '../config/database';
import { organizations } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Provider types supported by ArchGW
 */
export type LLMProvider = 'openai' | 'anthropic' | 'google';

/**
 * Routing decision result
 */
export interface RoutingDecision {
  // Model selection
  provider: LLMProvider;
  model: string;
  originalModel?: string; // Original requested model if changed
  
  // Routing information
  region: string;
  endpoint?: string;
  
  // Decision metadata
  reason: string;
  factors: string[]; // Factors that influenced the decision
  
  // Validation results
  promptLength?: PromptLengthResult;
  regionRouting?: RegionRoutingResult;
  costTiering?: CostTieringResult;
  
  // Compliance
  requiresCompliance?: boolean;
  dataResidency?: string;
  complianceRequirements?: string[];
  
  // Cost information
  estimatedCost?: number;
  costTier?: 'free' | 'pro' | 'team' | 'enterprise';
  
  // Warnings and errors
  warnings?: string[];
  errors?: string[];
}

/**
 * Routing options
 */
export interface RoutingOptions {
  // Context
  userId?: string;
  organizationId?: string;
  workspaceId?: string;
  
  // Prompt information
  prompt: string;
  promptLength?: number; // Pre-calculated length (optional)
  
  // Model preferences
  requestedProvider?: LLMProvider;
  requestedModel?: string;
  
  // Regional preferences
  userRegion?: string;
  preferredRegion?: string;
  dataResidency?: string;
  complianceRequirements?: string[];
  
  // Cost preferences
  organizationPlan?: 'free' | 'pro' | 'team' | 'enterprise';
  maxCost?: number; // Maximum cost per request (optional)
  
  // Feature flags
  enableCostTiering?: boolean;
  enableRegionRouting?: boolean;
  enablePromptLengthRouting?: boolean;
  enforceCompliance?: boolean;
  
  // Advanced options
  allowModelDowngrade?: boolean;
  strictCompliance?: boolean; // Fail if compliance cannot be met
}

/**
 * ArchGW Service
 * 
 * Architecture Gateway for intelligent prompt routing
 */
export class ArchGWService {
  /**
   * Determine optimal routing for a prompt
   * 
   * This is the main entry point for routing decisions.
   * It considers:
   * - Prompt length → model selection
   * - User region → endpoint routing
   * - Organization plan → cost tiering
   * - Compliance requirements → region/data residency
   * - Feature flags → enable/disable features
   */
  async routePrompt(options: RoutingOptions): Promise<RoutingDecision> {
    const {
      userId,
      organizationId,
      workspaceId,
      prompt,
      requestedProvider = 'openai',
      requestedModel = 'gpt-4',
      userRegion,
      preferredRegion,
      dataResidency,
      complianceRequirements,
      organizationPlan,
      enableCostTiering,
      enableRegionRouting,
      enablePromptLengthRouting,
      enforceCompliance = true,
      allowModelDowngrade = true,
      strictCompliance = false,
    } = options;

    const factors: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Fetch organization settings if organizationId is provided
    let orgPlan: 'free' | 'pro' | 'team' | 'enterprise' = organizationPlan || 'free';
    let orgComplianceRequirements: string[] = complianceRequirements || [];
    let orgDataResidency: string | undefined = dataResidency;

    if (organizationId) {
      try {
        const [org] = await db
          .select({
            plan: organizations.plan,
            settings: organizations.settings,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1);

        if (org) {
          orgPlan = (org.plan as 'free' | 'pro' | 'team' | 'enterprise') || 'free';
          
          if (org.settings && typeof org.settings === 'object') {
            const settings = org.settings as any;
            orgComplianceRequirements = settings.complianceRequirements || orgComplianceRequirements;
            orgDataResidency = settings.dataResidency || orgDataResidency;
          }
        }
      } catch (error: any) {
        console.warn('[ArchGW] Failed to fetch organization settings:', error);
        warnings.push('Could not fetch organization settings, using defaults');
      }
    }

    // Check feature flags
    const costTieringEnabled = enableCostTiering !== undefined
      ? enableCostTiering
      : await featureFlagService.isEnabled('enable_cost_tiering', userId, workspaceId);
    
    const regionRoutingEnabled = enableRegionRouting !== undefined
      ? enableRegionRouting
      : await featureFlagService.isEnabled('enable_region_routing', userId, workspaceId);
    
    const promptLengthRoutingEnabled = enablePromptLengthRouting !== undefined
      ? enablePromptLengthRouting
      : await featureFlagService.isEnabled('enable_prompt_length_routing', userId, workspaceId);

    // Step 1: Check prompt length and get recommendations
    let promptLengthResult: PromptLengthResult | undefined;
    if (promptLengthRoutingEnabled) {
      try {
        promptLengthResult = guardrailsService.checkPromptLength(prompt, {
          model: requestedModel,
          provider: requestedProvider,
        });
        factors.push('prompt_length');
        
        if (promptLengthResult.recommendedModel && promptLengthResult.recommendedModel !== requestedModel) {
          factors.push('model_selection_by_length');
        }
      } catch (error: any) {
        console.warn('[ArchGW] Prompt length check failed:', error);
        warnings.push('Prompt length check failed');
      }
    }

    // Step 2: Determine region routing
    let regionRoutingResult: RegionRoutingResult | undefined;
    let finalRegion = preferredRegion || userRegion || 'us-east';
    let finalEndpoint: string | undefined;
    
    if (regionRoutingEnabled) {
      try {
        regionRoutingResult = guardrailsService.determineRegionRouting({
          userId,
          organizationId,
          workspaceId,
          userRegion,
          dataResidency: orgDataResidency || dataResidency,
          complianceRequirements: orgComplianceRequirements.length > 0 
            ? orgComplianceRequirements 
            : complianceRequirements,
          preferredRegion,
          provider: requestedProvider,
          enforceCompliance,
        });
        
        finalRegion = regionRoutingResult.region;
        finalEndpoint = regionRoutingResult.endpoint;
        factors.push('region_routing');
        
        if (regionRoutingResult.requiresCompliance) {
          factors.push('compliance_routing');
        }
      } catch (error: any) {
        console.warn('[ArchGW] Region routing check failed:', error);
        warnings.push('Region routing check failed');
        
        if (strictCompliance && enforceCompliance) {
          errors.push('Compliance requirements could not be met');
        }
      }
    }

    // Step 3: Apply cost tiering
    let costTieringResult: CostTieringResult | undefined;
    let finalModel = requestedModel;
    let finalProvider = requestedProvider;
    
    if (costTieringEnabled) {
      try {
        costTieringResult = guardrailsService.applyCostTiering({
          plan: orgPlan,
          requestedModel,
          provider: requestedProvider,
        });
        
        factors.push('cost_tiering');
        
        if (costTieringResult.downgraded && allowModelDowngrade) {
          finalModel = costTieringResult.recommendedModel;
          factors.push('model_downgrade');
        } else if (costTieringResult.downgraded && !allowModelDowngrade) {
          warnings.push(`Model downgrade recommended but not allowed: ${costTieringResult.reason}`);
        }
      } catch (error: any) {
        console.warn('[ArchGW] Cost tiering check failed:', error);
        warnings.push('Cost tiering check failed');
      }
    }

    // Step 4: Apply prompt length recommendations (if enabled and not already applied)
    if (promptLengthRoutingEnabled && promptLengthResult?.recommendedModel) {
      // Only apply if cost tiering didn't already change the model
      if (finalModel === requestedModel) {
        finalModel = promptLengthResult.recommendedModel;
        factors.push('model_selection_by_length');
      }
    }

    // Step 5: Build final routing decision
    const decision: RoutingDecision = {
      provider: finalProvider,
      model: finalModel,
      originalModel: finalModel !== requestedModel ? requestedModel : undefined,
      region: finalRegion,
      endpoint: finalEndpoint,
      reason: this.buildReason(factors, costTieringResult, regionRoutingResult, promptLengthResult),
      factors,
      promptLength: promptLengthResult,
      regionRouting: regionRoutingResult,
      costTiering: costTieringResult,
      requiresCompliance: regionRoutingResult?.requiresCompliance || false,
      dataResidency: regionRoutingResult?.dataResidency || orgDataResidency || dataResidency,
      complianceRequirements: orgComplianceRequirements.length > 0 
        ? orgComplianceRequirements 
        : complianceRequirements,
      costTier: orgPlan,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };

    return decision;
  }

  /**
   * Build human-readable reason for routing decision
   */
  private buildReason(
    factors: string[],
    costTiering?: CostTieringResult,
    regionRouting?: RegionRoutingResult,
    promptLength?: PromptLengthResult
  ): string {
    const reasons: string[] = [];

    if (costTiering?.downgraded) {
      reasons.push(`Cost tiering: ${costTiering.reason}`);
    }

    if (regionRouting) {
      reasons.push(`Region routing: ${regionRouting.reason}`);
    }

    if (promptLength?.recommendedModel) {
      reasons.push(`Prompt length: ${promptLength.length} chars, recommended ${promptLength.recommendedModel}`);
    }

    if (reasons.length === 0) {
      return 'Default routing (no special factors applied)';
    }

    return reasons.join('; ');
  }

  /**
   * Get recommended model based on prompt length
   * 
   * This is a convenience method that wraps prompt length checking
   */
  getRecommendedModelByLength(prompt: string, provider: LLMProvider = 'openai'): string {
    const result = guardrailsService.checkPromptLength(prompt, {
      provider,
    });
    
    if (result.recommendedModel) {
      return result.recommendedModel;
    }

    // Default models by provider
    const defaultModels: Record<LLMProvider, string> = {
      openai: 'gpt-4',
      anthropic: 'claude-3-opus',
      google: 'gemini-pro',
    };

    return defaultModels[provider];
  }

  /**
   * Get routing decision for a simple prompt (without organization context)
   * 
   * This is a simplified version of routePrompt for cases where
   * you don't have full context
   */
  async routePromptSimple(
    prompt: string,
    requestedModel: string = 'gpt-4',
    provider: LLMProvider = 'openai',
    userRegion?: string
  ): Promise<RoutingDecision> {
    return this.routePrompt({
      prompt,
      requestedModel,
      requestedProvider: provider,
      userRegion,
      enableCostTiering: false,
      enableRegionRouting: !!userRegion,
      enablePromptLengthRouting: true,
      enforceCompliance: false,
    });
  }
}

// Singleton instance
export const archGWService = new ArchGWService();

