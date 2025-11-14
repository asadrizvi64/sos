import { z } from 'zod';
import { posthogService } from './posthogService';
import { featureFlagService } from './featureFlagService';
import { langchainService } from './langchainService';
import { similarityService, SimilarityMethod } from './similarityService';
import { guardrailsAIService, GuardrailsAIOptions, GuardrailsAIValidationResult } from './guardrailsAIService';
import { db } from '../config/database';
import { promptSimilarityLogs } from '../../drizzle/schema';
import { createId } from '@paralleldrive/cuid2';

/**
 * Guardrails Service
 * 
 * Provides validation, content safety, and abuse prevention
 * Based on PRD requirements: Pydantic, Zod, GuardrailsAI, Prompt-Similarity filter
 */

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface SafetyResult {
  safe: boolean;
  violations?: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
  }>;
  score?: number; // 0-1, higher is safer
}

export interface SimilarityResult {
  similar: boolean;
  similarityScore: number; // 0-1, higher is more similar
  matchedPrompts?: string[];
}

export interface AbuseCheckResult {
  isAbuse: boolean;
  abuseType?: string;
  confidence: number; // 0-1
  action: 'allow' | 'warn' | 'block';
  mlScore?: number; // ML-based abuse score (0-1)
  patterns?: Array<{
    type: string;
    score: number;
    description: string;
  }>;
  features?: {
    entropy?: number;
    repetitionScore?: number;
    unusualCharRatio?: number;
    semanticSimilarity?: number;
  };
}

export interface PromptLengthResult {
  valid: boolean;
  length: number; // Character count
  tokenEstimate?: number; // Estimated token count (rough approximation: ~4 chars per token)
  warnings?: string[];
  errors?: string[];
  recommendedModel?: string; // Model recommendation based on length
  action?: 'allow' | 'warn' | 'block';
}

export interface RegionRoutingResult {
  region: string; // Target region (e.g., 'us-east', 'eu-west', 'asia-pacific')
  endpoint?: string; // Recommended API endpoint for the region
  reason: string; // Reason for routing decision
  requiresCompliance?: boolean; // Whether compliance requirements triggered routing
  dataResidency?: string; // Data residency requirement (e.g., 'EU', 'US', 'global')
}

export interface CostTieringResult {
  originalModel: string;
  recommendedModel: string;
  reason: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  downgraded: boolean; // Whether model was downgraded due to plan
  allowedModels?: string[]; // Models allowed for this plan
}

/**
 * Guardrails Service
 */
export class GuardrailsService {
  private blockedPatterns: RegExp[] = [];
  private suspiciousPatterns: RegExp[] = [];
  private knownAbusePatterns: RegExp[] = [];
  private knownAbuseEmbeddings: Array<{ text: string; embedding: number[] }> = [];
  private abusePatternCache: Map<string, number[]> = new Map();

  constructor() {
    this.initializePatterns();
    // Initialize abuse patterns asynchronously (non-blocking)
    this.initializeAbusePatterns().catch(err => {
      console.warn('[Guardrails] Failed to initialize abuse patterns:', err);
    });
  }

  /**
   * Initialize blocked and suspicious patterns
   */
  private initializePatterns(): void {
    // Blocked patterns (high severity)
    this.blockedPatterns = [
      /(?:^|\s)(?:hack|exploit|bypass|unauthorized|illegal|malware|virus|trojan)(?:\s|$)/i,
      /(?:^|\s)(?:ddos|dos|attack|breach|inject|sql injection|xss)(?:\s|$)/i,
    ];

    // Suspicious patterns (medium severity)
    this.suspiciousPatterns = [
      /(?:^|\s)(?:password|credential|api.?key|secret|token)(?:\s|$)/i,
      /(?:^|\s)(?:delete|drop|truncate|alter|modify)(?:\s|$)/i,
    ];

    // Known abuse patterns
    this.knownAbusePatterns = [
      /(?:spam|scam|phishing|fraud)/i,
      /(?:harass|threat|violence|hate)/i,
    ];
  }

  /**
   * Initialize known abuse patterns with embeddings (async, can be called separately)
   */
  private async initializeAbusePatterns(): Promise<void> {
    // Known abuse text patterns for ML-based detection
    const abuseTexts = [
      'spam message',
      'phishing attempt',
      'scam alert',
      'fraudulent activity',
      'harassment content',
      'threatening language',
      'hate speech',
      'violence promotion',
      'malicious code injection',
      'unauthorized access attempt',
      'data exfiltration',
      'credential theft',
    ];

    // Generate embeddings for known abuse patterns (lazy loading)
    // This will be done on first use to avoid blocking initialization
    try {
      for (const text of abuseTexts) {
        const embedding = await this.generatePromptEmbedding(text);
        this.knownAbuseEmbeddings.push({ text, embedding });
      }
    } catch (error: any) {
      console.warn('[Guardrails] Failed to initialize abuse pattern embeddings:', error);
    }
  }

  /**
   * Validate input using Zod schema
   */
  validateInput<T>(
    input: unknown,
    schema: z.ZodSchema<T>
  ): ValidationResult {
    try {
      schema.parse(input);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return {
        valid: false,
        errors: ['Validation failed'],
      };
    }
  }

  /**
   * Validate output using Zod schema
   */
  validateOutput<T>(
    output: unknown,
    schema: z.ZodSchema<T>
  ): ValidationResult {
    return this.validateInput(output, schema);
  }

  /**
   * Validate output using JSON Schema (GuardrailsAI)
   * 
   * This method uses GuardrailsAI service to validate LLM outputs
   * against JSON Schema, providing structured output validation.
   */
  async validateOutputWithJSONSchema(
    output: unknown,
    jsonSchema: Record<string, any> | string,
    options: {
      coerceTypes?: boolean;
      removeAdditional?: boolean;
      useDefaults?: boolean;
      policies?: GuardrailsAIOptions['policies'];
      useAPI?: boolean;
      apiUrl?: string;
      apiKey?: string;
    } = {}
  ): Promise<ValidationResult & { data?: any }> {
    try {
      const validationResult = await guardrailsAIService.validate(output, {
        schema: typeof jsonSchema === 'string' ? undefined : jsonSchema,
        schemaString: typeof jsonSchema === 'string' ? jsonSchema : undefined,
        coerceTypes: options.coerceTypes,
        removeAdditional: options.removeAdditional,
        useDefaults: options.useDefaults,
        policies: options.policies,
        useAPI: options.useAPI,
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
      });

      if (validationResult.valid) {
        return {
          valid: true,
          data: validationResult.data,
          warnings: validationResult.warnings,
        };
      } else {
        return {
          valid: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        };
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [`JSON Schema validation failed: ${error.message}`],
      };
    }
  }

  /**
   * Validate output using both Zod and JSON Schema
   * 
   * This method provides dual validation for maximum compatibility.
   */
  async validateOutputDual(
    output: unknown,
    zodSchema?: z.ZodSchema<any>,
    jsonSchema?: Record<string, any> | string,
    options: {
      coerceTypes?: boolean;
      removeAdditional?: boolean;
      useDefaults?: boolean;
      policies?: GuardrailsAIOptions['policies'];
    } = {}
  ): Promise<ValidationResult & { data?: any }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let validatedData: any = output;

    // Validate with Zod if provided
    if (zodSchema) {
      const zodResult = this.validateOutput(output, zodSchema);
      if (!zodResult.valid) {
        errors.push(...(zodResult.errors || []));
      }
    }

    // Validate with JSON Schema if provided
    if (jsonSchema) {
      const jsonResult = await this.validateOutputWithJSONSchema(output, jsonSchema, options);
      if (!jsonResult.valid) {
        errors.push(...(jsonResult.errors || []));
      } else if (jsonResult.data !== undefined) {
        // Use validated/coerced data from JSON Schema
        validatedData = jsonResult.data;
      }
      if (jsonResult.warnings) {
        warnings.push(...jsonResult.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      data: validatedData,
    };
  }

  /**
   * Validate output using policies only (GuardrailsAI)
   * 
   * This method validates LLM outputs against custom policies
   * without requiring a JSON Schema.
   */
  async validateOutputWithPolicies(
    output: unknown,
    policies: Array<{
      name: string;
      rule: (data: any) => boolean | { valid: boolean; message?: string; details?: any };
      severity?: 'low' | 'medium' | 'high' | 'critical';
    }>,
    options: {
      useAPI?: boolean;
      apiUrl?: string;
      apiKey?: string;
    } = {}
  ): Promise<ValidationResult & { violations?: Array<{
    policy: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    details?: Record<string, any>;
  }> }> {
    try {
      const validationResult = await guardrailsAIService.validate(output, {
        policies,
        useAPI: options.useAPI,
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
      });

      if (validationResult.valid) {
        return {
          valid: true,
          warnings: validationResult.warnings,
        };
      } else {
        // Extract violations from policy validation
        const violations = validationResult.policyValidation?.violations || [];
        const errors: string[] = [];
        const warnings: string[] = [];

        for (const violation of violations) {
          if (violation.severity === 'critical' || violation.severity === 'high') {
            errors.push(`Policy ${violation.policy}: ${violation.message}`);
          } else {
            warnings.push(`Policy ${violation.policy}: ${violation.message}`);
          }
        }

        return {
          valid: false,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
          violations,
        };
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [`Policy validation failed: ${error.message}`],
      };
    }
  }

  /**
   * Get predefined policies for common use cases
   */
  getPredefinedPolicies(): Record<string, Array<{
    name: string;
    rule: (data: any) => boolean | { valid: boolean; message?: string; details?: any };
    severity?: 'low' | 'medium' | 'high' | 'critical';
  }>> {
    return {
      // Content safety policies
      contentSafety: [
        {
          name: 'no_pii',
          severity: 'high',
          rule: (data: any) => {
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            // Check for common PII patterns
            const piiPatterns = [
              /\b\d{3}-\d{2}-\d{4}\b/, // SSN
              /\b\d{16}\b/, // Credit card
              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
              /\b\d{3}-\d{3}-\d{4}\b/, // Phone
            ];
            
            for (const pattern of piiPatterns) {
              if (pattern.test(dataStr)) {
                return {
                  valid: false,
                  message: 'Potential PII detected in output',
                  details: { pattern: pattern.toString() },
                };
              }
            }
            return true;
          },
        },
        {
          name: 'no_secrets',
          severity: 'critical',
          rule: (data: any) => {
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            // Check for common secret patterns
            const secretPatterns = [
              /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/i,
              /(?:secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}['"]?/i,
              /(?:bearer|authorization)\s+[A-Za-z0-9_-]{20,}/i,
            ];
            
            for (const pattern of secretPatterns) {
              if (pattern.test(dataStr)) {
                return {
                  valid: false,
                  message: 'Potential secret/credential detected in output',
                  details: { pattern: pattern.toString() },
                };
              }
            }
            return true;
          },
        },
      ],

      // Data quality policies
      dataQuality: [
        {
          name: 'non_empty',
          severity: 'medium',
          rule: (data: any) => {
            if (data === null || data === undefined) {
              return { valid: false, message: 'Output is null or undefined' };
            }
            if (typeof data === 'string' && data.trim().length === 0) {
              return { valid: false, message: 'Output is empty string' };
            }
            if (Array.isArray(data) && data.length === 0) {
              return { valid: false, message: 'Output is empty array' };
            }
            if (typeof data === 'object' && Object.keys(data).length === 0) {
              return { valid: false, message: 'Output is empty object' };
            }
            return true;
          },
        },
        {
          name: 'max_length',
          severity: 'low',
          rule: (data: any) => {
            const maxLength = 100000; // 100KB
            const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
            if (dataStr.length > maxLength) {
              return {
                valid: false,
                message: `Output exceeds maximum length: ${dataStr.length} > ${maxLength}`,
                details: { length: dataStr.length, maxLength },
              };
            }
            return true;
          },
        },
      ],

      // Format policies
      format: [
        {
          name: 'valid_json',
          severity: 'high',
          rule: (data: any) => {
            if (typeof data === 'string') {
              try {
                JSON.parse(data);
                return true;
              } catch {
                return { valid: false, message: 'Output is not valid JSON' };
              }
            }
            return true;
          },
        },
        {
          name: 'required_fields',
          severity: 'high',
          rule: (data: any) => {
            // This is a template - actual required fields should be passed as context
            if (typeof data === 'object' && data !== null) {
              // Example: check for common required fields
              // In practice, this should be configurable
              return true;
            }
            return true;
          },
        },
      ],
    };
  }

  /**
   * Check content safety
   */
  checkContentSafety(content: string): SafetyResult {
    const violations: SafetyResult['violations'] = [];
    let score = 1.0;

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'blocked_pattern',
          severity: 'critical',
          message: 'Content contains blocked patterns',
        });
        score -= 0.5;
      }
    }

    // Check suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(content)) {
        violations.push({
          type: 'suspicious_pattern',
          severity: 'medium',
          message: 'Content contains suspicious patterns',
        });
        score -= 0.2;
      }
    }

    // Check length (very long content might be abuse)
    if (content.length > 100000) {
      violations.push({
        type: 'excessive_length',
        severity: 'low',
        message: 'Content is excessively long',
      });
      score -= 0.1;
    }

    // Check for potential code injection
    if (this.detectCodeInjection(content)) {
      violations.push({
        type: 'code_injection',
        severity: 'high',
        message: 'Potential code injection detected',
      });
      score -= 0.3;
    }

    score = Math.max(0, score);

    return {
      safe: violations.length === 0 || score > 0.5,
      violations: violations.length > 0 ? violations : undefined,
      score,
    };
  }

  /**
   * Generate embedding for a prompt
   */
  async generatePromptEmbedding(prompt: string): Promise<number[]> {
    try {
      return await langchainService.generateEmbedding(prompt);
    } catch (error: any) {
      console.error('[Guardrails] Failed to generate embedding:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Check prompt similarity using embeddings and vector similarity
   */
  async checkPromptSimilarity(
    prompt: string,
    knownPrompts: string[] = [],
    userId?: string,
    organizationId?: string,
    workspaceId?: string,
    threshold: number = 0.85,
    method: SimilarityMethod = 'cosine',
    workflowExecutionId?: string,
    nodeId?: string,
    traceId?: string
  ): Promise<SimilarityResult> {
    if (knownPrompts.length === 0) {
      return {
        similar: false,
        similarityScore: 0,
      };
    }

    try {
      // Generate embedding for the prompt
      const promptEmbedding = await this.generatePromptEmbedding(prompt);

      let maxSimilarity = 0;
      let matchedPrompt: string | undefined;
      let matchedEmbedding: number[] | undefined;

      // Compare with each known prompt
      for (const knownPrompt of knownPrompts) {
        try {
          // Generate embedding for known prompt
          const knownEmbedding = await this.generatePromptEmbedding(knownPrompt);

          // Calculate similarity
          const similarityResult = similarityService.calculate(
            promptEmbedding,
            knownEmbedding,
            method
          );

          const similarity = similarityResult.normalizedScore ?? similarityResult.score;

          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            matchedPrompt = knownPrompt;
            matchedEmbedding = knownEmbedding;
          }
        } catch (error: any) {
          console.warn(`[Guardrails] Failed to compare with known prompt: ${error.message}`);
          // Continue with next prompt
        }
      }

      const isSimilar = maxSimilarity >= threshold;
      const matchedPrompts = matchedPrompt ? [matchedPrompt] : undefined;

      // Log similarity check to database
      try {
        const enableLogging = await featureFlagService.isEnabled(
          'enable_similarity_logging',
          userId,
          workspaceId
        );

        if (enableLogging) {
          await db.insert(promptSimilarityLogs).values({
            id: createId(),
            userId: userId || null,
            workflowExecutionId: workflowExecutionId || null,
            nodeId: nodeId || null,
            prompt,
            promptEmbedding: promptEmbedding as any, // JSONB accepts arrays
            similarityScore: maxSimilarity,
            similarityScorePercent: Math.round(maxSimilarity * 100),
            flaggedReference: matchedPrompt ? createId() : null, // Reference ID
            flaggedContent: matchedPrompt || null,
            flaggedContentEmbedding: matchedEmbedding as any || null,
            actionTaken: isSimilar ? 'blocked' : 'allowed',
            threshold,
            method,
            organizationId: organizationId || null,
            workspaceId: workspaceId || null,
            traceId: traceId || null,
            timestamp: new Date(),
            createdAt: new Date(),
          });
        }
      } catch (error: any) {
        console.error('[Guardrails] Failed to log similarity check:', error);
        // Don't throw - logging failure shouldn't break execution
      }

      // Track prompt blocking in PostHog if blocked (if feature flag enabled)
      if (isSimilar && userId && organizationId) {
        const enableTracing = await featureFlagService.isEnabled(
          'enable_guardrails_tracing',
          userId,
          workspaceId
        );
        
        if (enableTracing) {
          posthogService.trackPromptBlocked({
            userId,
            organizationId,
            workspaceId: workspaceId || undefined,
            matchScore: maxSimilarity,
            source: 'prompt_similarity',
            promptPreview: prompt.substring(0, 100),
            reason: `Similar to known prompt (${(maxSimilarity * 100).toFixed(1)}% similarity)`,
          });
        }
      }

      return {
        similar: isSimilar,
        similarityScore: maxSimilarity,
        matchedPrompts,
      };
    } catch (error: any) {
      console.error('[Guardrails] Prompt similarity check failed:', error);
      // Fallback to word-based similarity if embedding generation fails
      return this.fallbackWordBasedSimilarity(prompt, knownPrompts);
    }
  }

  /**
   * Fallback word-based similarity (used when embedding generation fails)
   */
  private fallbackWordBasedSimilarity(
    prompt: string,
    knownPrompts: string[]
  ): SimilarityResult {
    const promptWords = new Set(prompt.toLowerCase().split(/\s+/));
    let maxSimilarity = 0;
    const matchedPrompts: string[] = [];

    for (const knownPrompt of knownPrompts) {
      const knownWords = new Set(knownPrompt.toLowerCase().split(/\s+/));
      const intersection = new Set([...promptWords].filter(x => knownWords.has(x)));
      const union = new Set([...promptWords, ...knownWords]);
      const similarity = intersection.size / union.size;

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      if (similarity > 0.7) {
        matchedPrompts.push(knownPrompt);
      }
    }

    return {
      similar: maxSimilarity > 0.7,
      similarityScore: maxSimilarity,
      matchedPrompts: matchedPrompts.length > 0 ? matchedPrompts : undefined,
    };
  }

  /**
   * Check prompt length and validate against limits
   * 
   * @param prompt - The prompt to check
   * @param options - Configuration options
   * @returns Prompt length validation result
   */
  checkPromptLength(
    prompt: string,
    options: {
      minLength?: number; // Minimum character length (default: 1)
      maxLength?: number; // Maximum character length (default: 100000)
      minTokens?: number; // Minimum token estimate (default: 1)
      maxTokens?: number; // Maximum token estimate (default: 128000 for GPT-4)
      warnThreshold?: number; // Warning threshold as percentage of max (default: 0.8 = 80%)
      model?: string; // Current model being used
      provider?: 'openai' | 'anthropic' | 'google';
    } = {}
  ): PromptLengthResult {
    const {
      minLength = 1,
      maxLength = 100000, // ~25k tokens at 4 chars/token
      minTokens = 1,
      maxTokens = 128000, // GPT-4 context window
      warnThreshold = 0.8,
      model,
      provider = 'openai',
    } = options;

    const length = prompt.length;
    // Rough token estimation: ~4 characters per token (varies by language)
    const tokenEstimate = Math.ceil(length / 4);

    const warnings: string[] = [];
    const errors: string[] = [];
    let recommendedModel: string | undefined;
    let action: 'allow' | 'warn' | 'block' = 'allow';

    // Check minimum length
    if (length < minLength) {
      errors.push(`Prompt is too short: ${length} characters (minimum: ${minLength})`);
      action = 'block';
    }

    // Check maximum length
    if (length > maxLength) {
      errors.push(`Prompt is too long: ${length} characters (maximum: ${maxLength})`);
      action = 'block';
    }

    // Check token limits
    if (tokenEstimate < minTokens) {
      errors.push(`Prompt token estimate too low: ~${tokenEstimate} tokens (minimum: ${minTokens})`);
      action = 'block';
    }

    if (tokenEstimate > maxTokens) {
      errors.push(`Prompt token estimate too high: ~${tokenEstimate} tokens (maximum: ${maxTokens})`);
      action = 'block';
    }

    // Warning thresholds
    const lengthPercentage = length / maxLength;
    const tokenPercentage = tokenEstimate / maxTokens;

    if (lengthPercentage >= warnThreshold && lengthPercentage < 1.0) {
      warnings.push(`Prompt is ${(lengthPercentage * 100).toFixed(1)}% of maximum length`);
      if (action === 'allow') {
        action = 'warn';
      }
    }

    if (tokenPercentage >= warnThreshold && tokenPercentage < 1.0) {
      warnings.push(`Prompt token estimate is ${(tokenPercentage * 100).toFixed(1)}% of maximum tokens`);
      if (action === 'allow') {
        action = 'warn';
      }
    }

    // Model recommendations based on length
    if (tokenEstimate > 0) {
      if (tokenEstimate <= 4000) {
        // Short prompts: use cheaper models
        if (provider === 'openai') {
          recommendedModel = model && model.includes('gpt-4') ? 'gpt-3.5-turbo' : model || 'gpt-3.5-turbo';
        } else if (provider === 'anthropic') {
          recommendedModel = model && model.includes('opus') ? 'claude-3-haiku' : model || 'claude-3-haiku';
        }
      } else if (tokenEstimate <= 16000) {
        // Medium prompts: use mid-tier models
        if (provider === 'openai') {
          recommendedModel = model || 'gpt-3.5-turbo-16k';
        } else if (provider === 'anthropic') {
          recommendedModel = model || 'claude-3-sonnet';
        }
      } else if (tokenEstimate <= 128000) {
        // Long prompts: use high-capacity models
        if (provider === 'openai') {
          recommendedModel = model || 'gpt-4-turbo';
        } else if (provider === 'anthropic') {
          recommendedModel = model || 'claude-3-opus';
        }
      } else {
        // Very long prompts: may need chunking or special handling
        warnings.push(`Prompt is very long (${tokenEstimate} tokens). Consider chunking or using a model with larger context window.`);
        if (provider === 'openai') {
          recommendedModel = 'gpt-4-turbo'; // Largest context window
        } else if (provider === 'anthropic') {
          recommendedModel = 'claude-3-opus';
        }
      }
    }

    return {
      valid: errors.length === 0,
      length,
      tokenEstimate,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      recommendedModel,
      action,
    };
  }

  /**
   * Determine region-based routing for LLM requests
   * 
   * Routes requests based on:
   * - User/organization region preference
   * - Data residency requirements (GDPR, HIPAA, etc.)
   * - Compliance requirements (ENFORCED - cannot be overridden)
   * - Latency optimization
   * 
   * Compliance routing is ENFORCED - EU data must go to EU clusters, etc.
   * 
   * @param options - Routing configuration options
   * @returns Region routing recommendation (enforced for compliance)
   */
  determineRegionRouting(options: {
    userId?: string;
    organizationId?: string;
    workspaceId?: string;
    userRegion?: string; // User's geographic region
    dataResidency?: string; // Required data residency (e.g., 'EU', 'US', 'global')
    complianceRequirements?: string[]; // Compliance requirements (e.g., 'GDPR', 'HIPAA', 'SOC2')
    preferredRegion?: string; // User's preferred region
    provider?: 'openai' | 'anthropic' | 'google';
    enforceCompliance?: boolean; // Whether to enforce compliance routing (default: true)
  } = {}): RegionRoutingResult {
    const {
      userRegion,
      dataResidency,
      complianceRequirements = [],
      preferredRegion,
      provider = 'openai',
      enforceCompliance = true, // Default to enforcing compliance
    } = options;

    // Default region mapping for providers
    const providerRegions: Record<string, Record<string, string>> = {
      openai: {
        'us': 'us-east',
        'eu': 'eu-west',
        'asia': 'asia-pacific',
        'global': 'us-east', // Default
      },
      anthropic: {
        'us': 'us-east',
        'eu': 'eu-west',
        'asia': 'asia-pacific',
        'global': 'us-east',
      },
      google: {
        'us': 'us-central',
        'eu': 'europe-west',
        'asia': 'asia-east',
        'global': 'us-central',
      },
    };

    // Determine target region based on priority:
    // 1. Data residency requirements (highest priority)
    // 2. Compliance requirements
    // 3. User preference
    // 4. User's geographic region
    // 5. Default (global/US)

    let targetRegion = 'us-east'; // Default
    let reason = 'Default routing';
    let requiresCompliance = false;

    // Check data residency requirements
    if (dataResidency) {
      requiresCompliance = true;
      if (dataResidency.toUpperCase() === 'EU' || dataResidency.toUpperCase() === 'EUROPE') {
        targetRegion = providerRegions[provider]?.['eu'] || 'eu-west';
        reason = `Data residency requirement: EU data must be processed in EU region`;
      } else if (dataResidency.toUpperCase() === 'US' || dataResidency.toUpperCase() === 'USA') {
        targetRegion = providerRegions[provider]?.['us'] || 'us-east';
        reason = `Data residency requirement: US data must be processed in US region`;
      } else if (dataResidency.toUpperCase() === 'ASIA' || dataResidency.toUpperCase() === 'ASIA-PACIFIC') {
        targetRegion = providerRegions[provider]?.['asia'] || 'asia-pacific';
        reason = `Data residency requirement: Asia data must be processed in Asia region`;
      }
    }

    // Check compliance requirements (ENFORCED - highest priority)
    if (complianceRequirements.length > 0 && enforceCompliance) {
      requiresCompliance = true;
      const hasGDPR = complianceRequirements.some(r => r.toUpperCase().includes('GDPR'));
      const hasHIPAA = complianceRequirements.some(r => r.toUpperCase().includes('HIPAA'));
      const hasSOC2 = complianceRequirements.some(r => r.toUpperCase().includes('SOC2'));
      const hasCCPA = complianceRequirements.some(r => r.toUpperCase().includes('CCPA'));
      const hasPIPEDA = complianceRequirements.some(r => r.toUpperCase().includes('PIPEDA'));

      if (hasGDPR && !dataResidency) {
        // GDPR requires EU data processing - ENFORCED
        targetRegion = providerRegions[provider]?.['eu'] || 'eu-west';
        reason = `GDPR compliance ENFORCED: EU data must be processed in EU region`;
      } else if (hasHIPAA && !dataResidency) {
        // HIPAA typically requires US-based processing - ENFORCED
        targetRegion = providerRegions[provider]?.['us'] || 'us-east';
        reason = `HIPAA compliance ENFORCED: healthcare data must be processed in US region`;
      } else if (hasCCPA && !dataResidency) {
        // CCPA (California) - prefer US region
        targetRegion = providerRegions[provider]?.['us'] || 'us-east';
        reason = `CCPA compliance: routing to US region for California data protection`;
      } else if (hasPIPEDA && !dataResidency) {
        // PIPEDA (Canada) - can use US or EU, prefer US for latency
        targetRegion = providerRegions[provider]?.['us'] || 'us-east';
        reason = `PIPEDA compliance: routing to US region for Canadian data`;
      } else if (hasSOC2 && !dataResidency) {
        // SOC2 can work with any region, but prefer US for consistency
        if (targetRegion === 'us-east') {
          reason = `SOC2 compliance: routing to US region`;
        }
      }
    }

    // Use preferred region if no compliance requirements (compliance takes priority)
    if (!requiresCompliance && preferredRegion) {
      targetRegion = preferredRegion;
      reason = `User preferred region: ${preferredRegion}`;
    }

    // Use user's geographic region if no other preference (compliance takes priority)
    if (!requiresCompliance && !preferredRegion && userRegion) {
      // Map user region to provider region
      const regionMap: Record<string, string> = {
        'us': providerRegions[provider]?.['us'] || 'us-east',
        'eu': providerRegions[provider]?.['eu'] || 'eu-west',
        'europe': providerRegions[provider]?.['eu'] || 'eu-west',
        'uk': providerRegions[provider]?.['eu'] || 'eu-west',
        'asia': providerRegions[provider]?.['asia'] || 'asia-pacific',
        'apac': providerRegions[provider]?.['asia'] || 'asia-pacific',
        'asia-pacific': providerRegions[provider]?.['asia'] || 'asia-pacific',
      };

      const mappedRegion = regionMap[userRegion.toLowerCase()];
      if (mappedRegion) {
        targetRegion = mappedRegion;
        reason = `User geographic region: ${userRegion} → ${targetRegion}`;
      }
    }

    // Build endpoint URL based on region and provider
    let endpoint: string | undefined;
    if (provider === 'openai') {
      // OpenAI doesn't expose regional endpoints directly, but we can note the region
      endpoint = `https://api.openai.com/v1`; // OpenAI uses global endpoint with regional routing
    } else if (provider === 'anthropic') {
      endpoint = `https://api.anthropic.com/v1`; // Anthropic uses global endpoint
    } else if (provider === 'google') {
      // Google Cloud has regional endpoints
      const googleRegions: Record<string, string> = {
        'us-central': 'us-central1',
        'europe-west': 'europe-west1',
        'asia-east': 'asia-east1',
      };
      const googleRegion = googleRegions[targetRegion] || 'us-central1';
      endpoint = `https://${googleRegion}-aiplatform.googleapis.com/v1`;
    }

    return {
      region: targetRegion,
      endpoint,
      reason,
      requiresCompliance,
      dataResidency: dataResidency || (requiresCompliance ? 'region-specific' : undefined),
    };
  }

  /**
   * Apply cost tiering based on user/organization plan
   * 
   * Free plan users are automatically routed to cheaper models (GPT-3.5, Claude Haiku)
   * to control costs. Higher tier plans can use premium models.
   * 
   * @param options - Cost tiering configuration
   * @returns Cost tiering result with recommended model
   */
  applyCostTiering(options: {
    plan: 'free' | 'pro' | 'team' | 'enterprise';
    requestedModel: string;
    provider: 'openai' | 'anthropic' | 'google';
    forceDowngrade?: boolean; // Force downgrade even for paid plans (for testing)
  }): CostTieringResult {
    const { plan, requestedModel, provider, forceDowngrade = false } = options;

    // Define allowed models per plan tier
    const planModelLimits: Record<string, Record<string, string[]>> = {
      free: {
        openai: ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k'],
        anthropic: ['claude-3-haiku', 'claude-instant-1.2'],
        google: ['gemini-pro', 'gemini-1.5-flash'],
      },
      pro: {
        openai: ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-turbo'],
        anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus'],
        google: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      },
      team: {
        openai: ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'],
        anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus', 'claude-3-5-sonnet'],
        google: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      },
      enterprise: {
        openai: ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
        anthropic: ['claude-3-haiku', 'claude-3-sonnet', 'claude-3-opus', 'claude-3-5-sonnet'],
        google: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
      },
    };

    const allowedModels = planModelLimits[plan]?.[provider] || [];
    const isModelAllowed = allowedModels.some(model => 
      requestedModel.toLowerCase().includes(model.toLowerCase()) || 
      model.toLowerCase().includes(requestedModel.toLowerCase())
    );

    let recommendedModel = requestedModel;
    let downgraded = false;
    let reason = `Plan: ${plan} - Model allowed`;

    // If model is not allowed for this plan, downgrade to cheapest allowed model
    if (!isModelAllowed || forceDowngrade || plan === 'free') {
      if (plan === 'free' || forceDowngrade) {
        // Free plan: always use cheapest model
        if (provider === 'openai') {
          recommendedModel = 'gpt-3.5-turbo';
          reason = `Free plan: automatically routed to GPT-3.5-turbo (requested: ${requestedModel})`;
        } else if (provider === 'anthropic') {
          recommendedModel = 'claude-3-haiku';
          reason = `Free plan: automatically routed to Claude 3 Haiku (requested: ${requestedModel})`;
        } else if (provider === 'google') {
          recommendedModel = 'gemini-1.5-flash';
          reason = `Free plan: automatically routed to Gemini 1.5 Flash (requested: ${requestedModel})`;
        }
        downgraded = true;
      } else {
        // Paid plan but model not allowed: use highest tier allowed model
        const highestAllowed = allowedModels[allowedModels.length - 1];
        if (highestAllowed) {
          recommendedModel = highestAllowed;
          reason = `${plan} plan: ${requestedModel} not available, using ${highestAllowed}`;
          downgraded = true;
        }
      }
    }

    // Check if requested model is premium and plan doesn't support it
    const premiumModels = {
      openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o'],
      anthropic: ['claude-3-opus', 'claude-3-5-sonnet'],
      google: ['gemini-1.5-pro'],
    };

    const isPremium = premiumModels[provider]?.some(model => 
      requestedModel.toLowerCase().includes(model.toLowerCase())
    );

    if (isPremium && plan === 'free') {
      downgraded = true;
      if (provider === 'openai') {
        recommendedModel = 'gpt-3.5-turbo';
      } else if (provider === 'anthropic') {
        recommendedModel = 'claude-3-haiku';
      } else if (provider === 'google') {
        recommendedModel = 'gemini-1.5-flash';
      }
      reason = `Free plan: premium model ${requestedModel} not available, using ${recommendedModel}`;
    }

    return {
      originalModel: requestedModel,
      recommendedModel,
      reason,
      plan,
      downgraded,
      allowedModels,
    };
  }

  /**
   * Check for abuse with ML-based pattern detection
   */
  async checkAbuse(
    input: string,
    options: {
      useMLDetection?: boolean;
      mlThreshold?: number;
      userId?: string;
      checkSemanticSimilarity?: boolean;
    } = {}
  ): Promise<AbuseCheckResult> {
    const {
      useMLDetection = true,
      mlThreshold = 0.7,
      userId,
      checkSemanticSimilarity = true,
    } = options;

    const patterns: Array<{ type: string; score: number; description: string }> = [];
    let mlScore = 0;
    const features: AbuseCheckResult['features'] = {};

    // Step 1: Check known abuse patterns (regex-based)
    for (const pattern of this.knownAbusePatterns) {
      if (pattern.test(input)) {
        patterns.push({
          type: 'regex_pattern',
          score: 0.9,
          description: 'Matched known abuse pattern',
        });
        return {
          isAbuse: true,
          abuseType: 'pattern_match',
          confidence: 0.9,
          action: 'block',
          mlScore: 0.9,
          patterns,
        };
      }
    }

    // Step 2: ML-based feature extraction
    if (useMLDetection) {
      // Calculate text entropy (measure of randomness/unusualness)
      const entropy = this.calculateEntropy(input);
      features.entropy = entropy;
      
      // High entropy might indicate obfuscated or encoded abuse
      if (entropy > 4.5) {
        const entropyScore = Math.min((entropy - 4.5) / 1.5, 1.0);
        patterns.push({
          type: 'high_entropy',
          score: entropyScore * 0.6,
          description: `High entropy detected: ${entropy.toFixed(2)}`,
        });
        mlScore += entropyScore * 0.15;
      }

      // Calculate repetition score (spam often has high repetition)
      const repetitionScore = this.calculateRepetitionScore(input);
      features.repetitionScore = repetitionScore;
      
      if (repetitionScore > 0.7) {
        patterns.push({
          type: 'high_repetition',
          score: repetitionScore * 0.8,
          description: `High repetition detected: ${(repetitionScore * 100).toFixed(1)}%`,
        });
        mlScore += repetitionScore * 0.2;
      }

      // Calculate unusual character ratio
      const unusualCharRatio = this.calculateUnusualCharRatio(input);
      features.unusualCharRatio = unusualCharRatio;
      
      if (unusualCharRatio > 0.3) {
        patterns.push({
          type: 'unusual_characters',
          score: unusualCharRatio * 0.7,
          description: `Unusual characters: ${(unusualCharRatio * 100).toFixed(1)}%`,
        });
        mlScore += unusualCharRatio * 0.15;
      }

      // Step 3: Semantic similarity to known abuse patterns (ML-based)
      if (checkSemanticSimilarity && this.knownAbuseEmbeddings.length > 0) {
        try {
          const inputEmbedding = await this.generatePromptEmbedding(input);
          let maxSimilarity = 0;
          let mostSimilarAbuse: string | undefined;

          for (const abusePattern of this.knownAbuseEmbeddings) {
            const similarity = similarityService.calculate(
              inputEmbedding,
              abusePattern.embedding,
              'cosine'
            );
            const normalizedScore = similarity.normalizedScore ?? similarity.score;
            
            if (normalizedScore > maxSimilarity) {
              maxSimilarity = normalizedScore;
              mostSimilarAbuse = abusePattern.text;
            }
          }

          features.semanticSimilarity = maxSimilarity;

          if (maxSimilarity > 0.75) {
            patterns.push({
              type: 'semantic_similarity',
              score: maxSimilarity,
              description: `Semantically similar to known abuse: ${mostSimilarAbuse}`,
            });
            mlScore += maxSimilarity * 0.3;
          }
        } catch (error: any) {
          console.warn('[Guardrails] ML-based semantic similarity check failed:', error);
        }
      }

      // Step 4: Behavioral patterns (if user context available)
      if (userId) {
        // Check for rapid repeated similar requests
        // This would require rate limiting/request history context
        // Placeholder for future implementation
      }

      // Normalize ML score to 0-1 range
      mlScore = Math.min(mlScore, 1.0);
    }

    // Step 5: Check content safety (existing method)
    const safetyCheck = this.checkContentSafety(input);
    if (!safetyCheck.safe || (safetyCheck.score && safetyCheck.score < 0.5)) {
      const hasCritical = safetyCheck.violations?.some(
        v => v.severity === 'critical' || v.severity === 'high'
      );
      const safetyScore = 1 - (safetyCheck.score || 0);
      
      patterns.push({
        type: 'content_safety',
        score: safetyScore,
        description: `Content safety violation: ${safetyCheck.violations?.map(v => v.type).join(', ')}`,
      });

      // Combine ML score with safety score
      const combinedScore = Math.max(mlScore, safetyScore);
      
      return {
        isAbuse: hasCritical || combinedScore > mlThreshold,
        abuseType: 'content_safety',
        confidence: combinedScore,
        action: hasCritical || combinedScore > 0.8 ? 'block' : 'warn',
        mlScore: combinedScore,
        patterns,
        features,
      };
    }

    // Step 6: Final decision based on ML score
    const isAbuse = mlScore > mlThreshold;
    const confidence = mlScore;

    return {
      isAbuse,
      abuseType: isAbuse ? 'ml_detection' : undefined,
      confidence,
      action: isAbuse 
        ? (mlScore > 0.8 ? 'block' : 'warn')
        : 'allow',
      mlScore,
      patterns: patterns.length > 0 ? patterns : undefined,
      features: Object.keys(features).length > 0 ? features : undefined,
    };
  }

  /**
   * Calculate text entropy (Shannon entropy)
   * Higher entropy indicates more randomness/unusualness
   */
  private calculateEntropy(text: string): number {
    if (text.length === 0) return 0;

    const charCounts: Record<string, number> = {};
    for (const char of text) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }

    let entropy = 0;
    const length = text.length;

    for (const count of Object.values(charCounts)) {
      const probability = count / length;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Calculate repetition score (0-1)
   * Higher score indicates more repetition (common in spam)
   */
  private calculateRepetitionScore(text: string): number {
    if (text.length < 10) return 0;

    // Check for repeated words
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts: Record<string, number> = {};
    
    for (const word of words) {
      if (word.length > 2) { // Ignore very short words
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    const totalWords = words.length;
    let repeatedWords = 0;
    
    for (const count of Object.values(wordCounts)) {
      if (count > 1) {
        repeatedWords += count - 1; // Count repetitions beyond first occurrence
      }
    }

    // Check for repeated character sequences
    let charRepetition = 0;
    for (let i = 0; i < text.length - 3; i++) {
      const seq = text.substring(i, i + 3);
      const matches = (text.match(new RegExp(seq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (matches > 2) {
        charRepetition += matches - 2;
      }
    }

    const wordRepetitionScore = Math.min(repeatedWords / totalWords, 1.0);
    const charRepetitionScore = Math.min(charRepetition / text.length, 1.0);

    return Math.max(wordRepetitionScore, charRepetitionScore * 0.5);
  }

  /**
   * Calculate ratio of unusual characters (non-alphanumeric, non-whitespace)
   */
  private calculateUnusualCharRatio(text: string): number {
    if (text.length === 0) return 0;

    let unusualChars = 0;
    for (const char of text) {
      // Check if character is not alphanumeric, whitespace, or common punctuation
      if (!/[a-zA-Z0-9\s.,!?;:'"()-]/.test(char)) {
        unusualChars++;
      }
    }

    return unusualChars / text.length;
  }

  /**
   * Detect potential code injection
   */
  private detectCodeInjection(content: string): boolean {
    const codePatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      /system\s*\(/i,
      /shell_exec\s*\(/i,
      /\$\{.*\}/, // Template injection
      /`.*\$\{.*\}`/, // Template literals
    ];

    return codePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Create input schema for agent queries
   */
  createInputSchema() {
    return z.object({
      query: z.string().min(1).max(10000),
      context: z.record(z.unknown()).optional(),
      config: z.record(z.unknown()).optional(),
    });
  }

  /**
   * Create output schema for agent responses
   */
  createOutputSchema() {
    return z.object({
      output: z.string(),
      intermediateSteps: z.array(z.any()).optional(),
      memory: z.any().optional(),
      executionTime: z.number().optional(),
      tokensUsed: z.number().optional(),
      cost: z.number().optional(),
    });
  }
}

export const guardrailsService = new GuardrailsService();

