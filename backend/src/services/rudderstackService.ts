/**
 * RudderStack Service
 * 
 * Event forwarding service for analytics
 * Forwards events from PostHog and Supabase to RudderStack
 * Maps events to unified analytics schema
 * Includes batching and retry logic for reliability
 */

interface RudderStackEvent {
  event: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, unknown>;
  context?: {
    groupId?: string;
    traits?: Record<string, unknown>;
    [key: string]: unknown;
  };
  timestamp?: Date;
}

interface QueuedEvent {
  event: RudderStackEvent;
  retries: number;
  lastAttempt: number;
}

class RudderStackService {
  private client: any = null;
  private enabled: boolean = false;
  private writeKey: string | null = null;
  private dataPlaneUrl: string | null = null;
  private eventQueue: QueuedEvent[] = [];
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second
  private batchSize: number = 20;
  private flushInterval: number = 10000; // 10 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private processingQueue: boolean = false;

  constructor() {
    try {
      const RudderStack = require('@rudderstack/rudder-sdk-node');
      
      this.writeKey = process.env.RUDDERSTACK_WRITE_KEY || null;
      this.dataPlaneUrl = process.env.RUDDERSTACK_DATA_PLANE_URL || 'https://hosted.rudderlabs.com';
      this.maxRetries = parseInt(process.env.RUDDERSTACK_MAX_RETRIES || '3', 10);
      this.retryDelay = parseInt(process.env.RUDDERSTACK_RETRY_DELAY || '1000', 10);
      this.batchSize = parseInt(process.env.RUDDERSTACK_BATCH_SIZE || '20', 10);
      this.flushInterval = parseInt(process.env.RUDDERSTACK_FLUSH_INTERVAL || '10000', 10);

      if (this.writeKey) {
        this.client = new RudderStack(this.writeKey, {
          dataPlaneUrl: this.dataPlaneUrl,
          flushAt: this.batchSize,
          flushInterval: this.flushInterval,
        });
        this.enabled = true;
        this.startFlushTimer();
        console.log('✅ RudderStack client initialized');
      } else {
        console.warn('⚠️ RUDDERSTACK_WRITE_KEY not set, RudderStack forwarding disabled');
      }
    } catch (error) {
      console.log('ℹ️ RudderStack not available (optional dependency)');
      this.enabled = false;
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.processQueue();
    }, this.flushInterval);
  }

  /**
   * Process queued events with retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.eventQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    try {
      const now = Date.now();
      const eventsToProcess: QueuedEvent[] = [];
      const remainingEvents: QueuedEvent[] = [];

      // Separate events that are ready to retry
      for (const queuedEvent of this.eventQueue) {
        const timeSinceLastAttempt = now - queuedEvent.lastAttempt;
        const shouldRetry = queuedEvent.retries < this.maxRetries && 
                           timeSinceLastAttempt >= this.retryDelay * Math.pow(2, queuedEvent.retries);

        if (shouldRetry || queuedEvent.retries === 0) {
          eventsToProcess.push(queuedEvent);
        } else {
          remainingEvents.push(queuedEvent);
        }
      }

      // Process events in batches
      for (let i = 0; i < eventsToProcess.length; i += this.batchSize) {
        const batch = eventsToProcess.slice(i, i + this.batchSize);
        await this.processBatch(batch, remainingEvents);
      }

      this.eventQueue = remainingEvents;
    } catch (error) {
      console.error('[RudderStack] Error processing queue:', error);
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Process a batch of events
   */
  private async processBatch(batch: QueuedEvent[], remainingEvents: QueuedEvent[]): Promise<void> {
    for (const queuedEvent of batch) {
      try {
        queuedEvent.lastAttempt = Date.now();
        queuedEvent.retries++;

        // Track the event
        if (queuedEvent.event.userId) {
          this.client.track(queuedEvent.event);
        } else {
          this.client.identify({
            anonymousId: queuedEvent.event.anonymousId || 'anonymous',
            traits: queuedEvent.event.properties || {},
            context: queuedEvent.event.context,
            timestamp: queuedEvent.event.timestamp || new Date(),
          });
        }

        // Event successfully sent, don't add to remaining
      } catch (error: any) {
        console.warn(`[RudderStack] Failed to send event (attempt ${queuedEvent.retries}/${this.maxRetries}):`, error);
        
        // If max retries not reached, add back to queue
        if (queuedEvent.retries < this.maxRetries) {
          remainingEvents.push(queuedEvent);
        } else {
          console.error('[RudderStack] Event dropped after max retries:', queuedEvent.event);
        }
      }
    }
  }

  /**
   * Identify a user
   */
  identify(
    userId: string,
    traits?: Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.client.identify({
        userId,
        traits: traits || {},
        context: {
          ...context,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.warn('Failed to identify user in RudderStack:', error);
    }
  }

  /**
   * Track an event
   */
  track(
    userId: string,
    event: string,
    properties?: Record<string, unknown>,
    context?: {
      groupId?: string;
      workspaceId?: string;
      organizationId?: string;
      traceId?: string;
      [key: string]: unknown;
    }
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      const eventData: RudderStackEvent = {
        event,
        userId,
        properties: properties || {},
        context: {
          ...context,
          timestamp: new Date(),
        },
        timestamp: new Date(),
      };

      // Add group context if workspace/organization provided
      if (context?.workspaceId) {
        eventData.context = {
          ...eventData.context,
          groupId: context.workspaceId,
          traits: {
            workspaceId: context.workspaceId,
            organizationId: context.organizationId,
          },
        };
      }

      // Queue event for batching and retry
      this.eventQueue.push({
        event: eventData,
        retries: 0,
        lastAttempt: 0,
      });

      // Process queue if batch size reached
      if (this.eventQueue.length >= this.batchSize) {
        this.processQueue();
      }
    } catch (error) {
      console.warn('Failed to queue event for RudderStack:', error);
    }
  }

  /**
   * Track a group (workspace/organization)
   */
  group(
    userId: string,
    groupId: string,
    traits?: Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.client.group({
        userId,
        groupId,
        traits: traits || {},
        context: {
          ...context,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.warn('Failed to track group in RudderStack:', error);
    }
  }

  /**
   * Map PostHog event to RudderStack event
   */
  mapPostHogEvent(
    posthogEvent: {
      event: string;
      userId: string;
      properties: Record<string, unknown>;
    }
  ): RudderStackEvent {
    // Extract common properties
    const { organizationId, workspaceId, traceId, executionId, ...otherProps } = posthogEvent.properties as Record<string, unknown>;

    return {
      event: posthogEvent.event,
      userId: posthogEvent.userId,
      properties: {
        ...otherProps,
        // Ensure trace_id is included
        trace_id: traceId,
        execution_id: executionId,
      },
      context: {
        groupId: workspaceId as string,
        traits: {
          organizationId,
          workspaceId,
        },
        traceId,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Forward PostHog event to RudderStack
   */
  forwardPostHogEvent(
    posthogEvent: {
      event: string;
      userId: string;
      properties: Record<string, unknown>;
    }
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      const rudderEvent = this.mapPostHogEvent(posthogEvent);
      this.client.track(rudderEvent);
    } catch (error) {
      console.warn('Failed to forward PostHog event to RudderStack:', error);
    }
  }

  /**
   * Forward database event to RudderStack
   * Maps Supabase/PostgreSQL events to RudderStack format
   */
  forwardDatabaseEvent(
    event: {
      eventType: string;
      userId?: string;
      workspaceId?: string;
      organizationId?: string;
      properties: Record<string, unknown>;
      traceId?: string;
    }
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.track(
        event.userId || 'anonymous',
        event.eventType,
        event.properties,
        {
          workspaceId: event.workspaceId,
          organizationId: event.organizationId,
          traceId: event.traceId,
        }
      );
    } catch (error) {
      console.warn('Failed to forward database event to RudderStack:', error);
    }
  }

  /**
   * Forward cost log to RudderStack for data warehouse ingestion
   */
  forwardCostLog(
    costLog: {
      costLogId: string;
      userId: string;
      workspaceId: string;
      organizationId?: string;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      costUsd: number;
      costUsdCents: number;
      inputCost: number;
      outputCost: number;
      inputCostPer1k: number;
      outputCostPer1k: number;
      agentId?: string;
      workflowExecutionId?: string;
      nodeId?: string;
      traceId?: string;
      timestamp: string;
    }
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.track(
        costLog.userId,
        'llm_cost_logged',
        {
          cost_log_id: costLog.costLogId,
          provider: costLog.provider,
          model: costLog.model,
          input_tokens: costLog.inputTokens,
          output_tokens: costLog.outputTokens,
          total_tokens: costLog.totalTokens,
          cost_usd: costLog.costUsd,
          cost_usd_cents: costLog.costUsdCents,
          input_cost: costLog.inputCost,
          output_cost: costLog.outputCost,
          input_cost_per_1k: costLog.inputCostPer1k,
          output_cost_per_1k: costLog.outputCostPer1k,
          agent_id: costLog.agentId,
          workflow_execution_id: costLog.workflowExecutionId,
          node_id: costLog.nodeId,
          timestamp: costLog.timestamp,
        },
        {
          workspaceId: costLog.workspaceId,
          organizationId: costLog.organizationId,
          traceId: costLog.traceId,
        }
      );
    } catch (error) {
      console.warn('Failed to forward cost log to RudderStack:', error);
    }
  }

  /**
   * Forward similarity log to RudderStack for data warehouse ingestion
   */
  forwardSimilarityLog(
    similarityLog: {
      similarityLogId: string;
      userId: string;
      workspaceId: string;
      organizationId?: string;
      prompt: string;
      similarityScore: number;
      similarityScorePercent: number;
      flaggedReference?: string;
      flaggedContent?: string;
      actionTaken: string;
      threshold?: number;
      method: string;
      workflowExecutionId?: string;
      nodeId?: string;
      traceId?: string;
      timestamp: string;
    }
  ): void {
    if (!this.enabled || !this.client) return;

    try {
      this.track(
        similarityLog.userId,
        'prompt_similarity_logged',
        {
          similarity_log_id: similarityLog.similarityLogId,
          prompt: similarityLog.prompt,
          similarity_score: similarityLog.similarityScore,
          similarity_score_percent: similarityLog.similarityScorePercent,
          flagged_reference: similarityLog.flaggedReference,
          flagged_content: similarityLog.flaggedContent,
          action_taken: similarityLog.actionTaken,
          threshold: similarityLog.threshold,
          method: similarityLog.method,
          workflow_execution_id: similarityLog.workflowExecutionId,
          node_id: similarityLog.nodeId,
          timestamp: similarityLog.timestamp,
        },
        {
          workspaceId: similarityLog.workspaceId,
          organizationId: similarityLog.organizationId,
          traceId: similarityLog.traceId,
        }
      );
    } catch (error) {
      console.warn('Failed to forward similarity log to RudderStack:', error);
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { queueLength: number; processing: boolean } {
    return {
      queueLength: this.eventQueue.length,
      processing: this.processingQueue,
    };
  }

  /**
   * Flush events (useful before application shutdown)
   */
  async flush(): Promise<void> {
    if (this.client) {
      try {
        // Process any remaining queued events
        await this.processQueue();
        
        // Flush the RudderStack client
        await this.client.flush();
      } catch (error) {
        console.warn('Failed to flush RudderStack events:', error);
      }
    }
  }

  /**
   * Shutdown RudderStack client
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.client) {
      try {
        await this.flush();
        // RudderStack SDK doesn't have explicit shutdown, but flush should be enough
      } catch (error) {
        console.warn('Failed to shutdown RudderStack client:', error);
      }
    }
  }
}

export const rudderstackService = new RudderStackService();

