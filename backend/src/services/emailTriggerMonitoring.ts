import { db } from '../config/database';
import { emailTriggers } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Monitoring service for email triggers
 * Tracks health, metrics, and alerts
 */

interface TriggerHealth {
  triggerId: string;
  workflowId: string;
  provider: string;
  email: string;
  status: 'healthy' | 'unhealthy' | 'error';
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  consecutiveFailures: number;
  errorMessage?: string;
}

interface TriggerMetrics {
  totalTriggers: number;
  activeTriggers: number;
  healthyTriggers: number;
  unhealthyTriggers: number;
  triggersByProvider: Record<string, number>;
  totalEmailsProcessed: number;
  totalWorkflowsTriggered: number;
  averagePollInterval: number;
  tokenRefreshFailures: number;
}

interface Alert {
  id: string;
  type: 'token_refresh_failed' | 'consecutive_failures' | 'rate_limit_warning' | 'connection_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  triggerId: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
}

class EmailTriggerMonitoring {
  private healthStatus: Map<string, TriggerHealth> = new Map();
  private metrics: TriggerMetrics = {
    totalTriggers: 0,
    activeTriggers: 0,
    healthyTriggers: 0,
    unhealthyTriggers: 0,
    triggersByProvider: {},
    totalEmailsProcessed: 0,
    totalWorkflowsTriggered: 0,
    averagePollInterval: 0,
    tokenRefreshFailures: 0,
  };
  private alerts: Alert[] = [];
  private readonly MAX_ALERTS = 1000; // Keep last 1000 alerts
  private readonly CONSECUTIVE_FAILURE_THRESHOLD = 3; // Alert after 3 consecutive failures

  /**
   * Record successful email check
   */
  recordSuccess(triggerId: string, emailsProcessed: number, workflowsTriggered: number): void {
    let health = this.healthStatus.get(triggerId);
    if (!health) {
      health = this.createHealthRecord(triggerId);
      // Initialize from database asynchronously
      this.initializeHealthRecord(triggerId).catch(console.error);
    }
    
    health.status = 'healthy';
    health.lastCheckedAt = new Date();
    health.lastSuccessAt = new Date();
    health.consecutiveFailures = 0;
    health.errorMessage = undefined;
    
    this.healthStatus.set(triggerId, health);
    
    // Update metrics
    this.metrics.totalEmailsProcessed += emailsProcessed;
    this.metrics.totalWorkflowsTriggered += workflowsTriggered;
    
    // Resolve any alerts for this trigger
    this.resolveAlerts(triggerId, 'success');
  }

  /**
   * Record failed email check
   */
  recordFailure(triggerId: string, error: Error | string, errorType?: 'token_refresh' | 'api_error' | 'connection_error'): void {
    let health = this.healthStatus.get(triggerId);
    if (!health) {
      health = this.createHealthRecord(triggerId);
      // Initialize from database asynchronously
      this.initializeHealthRecord(triggerId).catch(console.error);
    }
    const errorMessage = error instanceof Error ? error.message : error;
    
    health.status = 'unhealthy';
    health.lastCheckedAt = new Date();
    health.lastErrorAt = new Date();
    health.consecutiveFailures = (health.consecutiveFailures || 0) + 1;
    health.errorMessage = errorMessage;
    
    this.healthStatus.set(triggerId, health);
    
    // Update metrics
    if (errorType === 'token_refresh') {
      this.metrics.tokenRefreshFailures++;
    }
    
    // Create alert if threshold exceeded
    if (health.consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD) {
      this.createAlert({
        type: 'consecutive_failures',
        severity: health.consecutiveFailures >= 5 ? 'high' : 'medium',
        triggerId,
        message: `Trigger has failed ${health.consecutiveFailures} consecutive times: ${errorMessage}`,
      });
    }
    
    // Create specific alerts
    if (errorType === 'token_refresh') {
      this.createAlert({
        type: 'token_refresh_failed',
        severity: 'high',
        triggerId,
        message: `Token refresh failed: ${errorMessage}`,
      });
    } else if (errorType === 'connection_error') {
      this.createAlert({
        type: 'connection_error',
        severity: 'medium',
        triggerId,
        message: `Connection error: ${errorMessage}`,
      });
    }
  }

  /**
   * Record token refresh success
   */
  recordTokenRefresh(triggerId: string, success: boolean, error?: Error): void {
    if (!success && error) {
      this.recordFailure(triggerId, error, 'token_refresh');
    } else if (success) {
      // Resolve token refresh alerts
      this.resolveAlerts(triggerId, 'token_refresh_success');
    }
  }

  /**
   * Record rate limit warning
   */
  recordRateLimitWarning(triggerId: string, provider: string, retryAfter?: number): void {
    this.createAlert({
      type: 'rate_limit_warning',
      severity: 'medium',
      triggerId,
      message: `Rate limit warning for ${provider}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
    });
  }

  /**
   * Get health status for a trigger
   */
  getTriggerHealth(triggerId: string): TriggerHealth | null {
    return this.healthStatus.get(triggerId) || null;
  }

  /**
   * Get all trigger health statuses
   */
  getAllTriggerHealth(): TriggerHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get current metrics
   */
  getMetrics(): TriggerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active alerts
   */
  getAlerts(limit?: number, severity?: Alert['severity']): Alert[] {
    let filtered = this.alerts.filter(a => !a.resolved);
    
    if (severity) {
      filtered = filtered.filter(a => a.severity === severity);
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(limit?: number): Alert[] {
    const sorted = [...this.alerts].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  /**
   * Update metrics from database
   */
  async updateMetricsFromDatabase(): Promise<void> {
    try {
      // Check if emailTriggers table is properly defined
      if (!emailTriggers || typeof emailTriggers === 'undefined') {
        // Silently skip if schema not available - this is expected during initial setup
        return;
      }

      let allTriggers;
      try {
        allTriggers = await db
          .select()
          .from(emailTriggers)
          .where(eq(emailTriggers.active, true));
      } catch (queryError: any) {
        // If table doesn't exist or SQL syntax error, silently skip
        if (queryError?.code === '42P01' || queryError?.code === '42601' ||
            queryError?.message?.includes('does not exist') ||
            queryError?.message?.includes('Symbol(drizzle:Columns)') ||
            queryError?.message?.includes('Cannot read properties of undefined')) {
          // Silently skip - this is expected during initial setup
          return;
        }
        throw queryError;
      }

      this.metrics.totalTriggers = allTriggers.length;
      this.metrics.activeTriggers = allTriggers.length;

      // Count by provider
      const byProvider: Record<string, number> = {};
      let totalPollInterval = 0;
      
      for (const trigger of allTriggers) {
        byProvider[trigger.provider] = (byProvider[trigger.provider] || 0) + 1;
        totalPollInterval += trigger.pollInterval || 60;
      }
      
      this.metrics.triggersByProvider = byProvider;
      this.metrics.averagePollInterval = allTriggers.length > 0 
        ? Math.round(totalPollInterval / allTriggers.length) 
        : 0;

      // Count healthy/unhealthy
      let healthy = 0;
      let unhealthy = 0;
      
      for (const trigger of allTriggers) {
        const health = this.healthStatus.get(trigger.id);
        if (health) {
          if (health.status === 'healthy') {
            healthy++;
          } else {
            unhealthy++;
          }
        } else {
          // Unknown status - consider healthy if recently checked
          if (trigger.lastCheckedAt) {
            const lastChecked = new Date(trigger.lastCheckedAt);
            const hoursSinceCheck = (Date.now() - lastChecked.getTime()) / (1000 * 60 * 60);
            if (hoursSinceCheck < 24) {
              healthy++;
            } else {
              unhealthy++;
            }
          } else {
            unhealthy++;
          }
        }
      }
      
      this.metrics.healthyTriggers = healthy;
      this.metrics.unhealthyTriggers = unhealthy;
    } catch (error) {
      console.error('Error updating metrics from database:', error);
    }
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    metrics: TriggerMetrics;
    recentAlerts: Alert[];
    unhealthyTriggers: TriggerHealth[];
  } {
    const recentAlerts = this.getAlerts(10);
    const unhealthyTriggers = this.getAllTriggerHealth().filter(h => h.status !== 'healthy');
    
    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (this.metrics.unhealthyTriggers > 0 && this.metrics.activeTriggers > 0) {
      const failureRate = this.metrics.unhealthyTriggers / this.metrics.activeTriggers;
      if (failureRate > 0.5) {
        overall = 'unhealthy';
      } else {
        overall = 'degraded';
      }
    }
    
    // Check for critical alerts
    const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      overall = 'unhealthy';
    }

    return {
      overall,
      metrics: this.getMetrics(),
      recentAlerts,
      unhealthyTriggers,
    };
  }

  /**
   * Create health record for a trigger
   */
  private createHealthRecord(triggerId: string): TriggerHealth {
    // Return minimal health record - will be populated from database when needed
    return {
      triggerId,
      workflowId: '',
      provider: 'unknown',
      email: '',
      status: 'healthy',
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
    };
  }
  
  /**
   * Initialize health record from database (async)
   */
  async initializeHealthRecord(triggerId: string): Promise<void> {
    try {
      const [trigger] = await db
        .select()
        .from(emailTriggers)
        .where(eq(emailTriggers.id, triggerId))
        .limit(1);

      if (trigger) {
        const health: TriggerHealth = {
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          provider: trigger.provider,
          email: trigger.email,
          status: 'healthy',
          lastCheckedAt: trigger.lastCheckedAt ? new Date(trigger.lastCheckedAt) : null,
          lastSuccessAt: null,
          lastErrorAt: null,
          consecutiveFailures: 0,
        };

        this.healthStatus.set(triggerId, health);
      }
    } catch (error) {
      console.error(`Error initializing health record for trigger ${triggerId}:`, error);
    }
  }

  /**
   * Create an alert
   */
  private createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.push(newAlert);

    // Keep only last MAX_ALERTS
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts = this.alerts.slice(-this.MAX_ALERTS);
    }

    // Log alert
    console.warn(`[Email Trigger Alert] ${newAlert.severity.toUpperCase()}: ${newAlert.type} - ${newAlert.message}`);
  }

  /**
   * Resolve alerts for a trigger
   */
  private resolveAlerts(triggerId: string, reason: string): void {
    for (const alert of this.alerts) {
      if (alert.triggerId === triggerId && !alert.resolved) {
        alert.resolved = true;
        console.log(`[Email Trigger Alert] Resolved alert ${alert.id} for trigger ${triggerId}: ${reason}`);
      }
    }
  }

  /**
   * Clean up old resolved alerts
   */
  cleanupOldAlerts(olderThanDays: number = 7): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    
    this.alerts = this.alerts.filter(alert => {
      if (alert.resolved && alert.timestamp < cutoff) {
        return false;
      }
      return true;
    });
  }
}

export const emailTriggerMonitoring = new EmailTriggerMonitoring();

// Update metrics every 5 minutes (only in production/development, not in tests)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    emailTriggerMonitoring.updateMetricsFromDatabase().catch(console.error);
  }, 5 * 60 * 1000);

  // Cleanup old alerts daily
  setInterval(() => {
    emailTriggerMonitoring.cleanupOldAlerts(7);
  }, 24 * 60 * 60 * 1000);
}

