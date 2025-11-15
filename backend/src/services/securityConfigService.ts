import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Security Configuration Service
 * 
 * Manages security settings for code execution:
 * - Namespace isolation
 * - Read-only filesystem
 * - Outbound network restrictions
 */

export interface SecurityConfig {
  namespace?: string; // Namespace/tenant isolation identifier
  readOnlyFilesystem?: boolean; // Whether filesystem should be read-only
  allowNetwork?: boolean; // Whether outbound network access is allowed
  allowedHosts?: string[]; // Whitelist of allowed hosts (if network is restricted)
  maxMemoryMB?: number; // Maximum memory usage in MB
  maxCpuTime?: number; // Maximum CPU time in milliseconds
}

export class SecurityConfigService {
  /**
   * Get security configuration from node config
   */
  getSecurityConfig(nodeConfig: any, context?: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
  }): SecurityConfig {
    const tracer = trace.getTracer('sos-security-config');
    const span = tracer.startSpan('securityConfig.getSecurityConfig');

    try {
      const config: SecurityConfig = {
        // Namespace isolation: Use organization ID as namespace
        namespace: context?.organizationId || nodeConfig.security?.namespace || 'default',
        
        // Read-only filesystem: Default to false, can be enabled per node
        readOnlyFilesystem: nodeConfig.security?.readOnlyFilesystem || false,
        
        // Network access: Default to false (no network), can be enabled per node
        allowNetwork: nodeConfig.security?.allowNetwork || false,
        
        // Allowed hosts: Whitelist of allowed hosts if network is enabled
        allowedHosts: nodeConfig.security?.allowedHosts || [],
        
        // Resource limits
        maxMemoryMB: nodeConfig.security?.maxMemoryMB || 512,
        maxCpuTime: nodeConfig.security?.maxCpuTime || 30000,
      };

      span.setAttributes({
        'security.namespace': config.namespace || 'default',
        'security.read_only_fs': config.readOnlyFilesystem || false,
        'security.allow_network': config.allowNetwork || false,
        'security.allowed_hosts_count': config.allowedHosts?.length || 0,
        'security.max_memory_mb': config.maxMemoryMB || 512,
        'security.max_cpu_time_ms': config.maxCpuTime || 30000,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return config;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.end();
      throw error;
    }
  }

  /**
   * Validate security configuration
   */
  validateSecurityConfig(config: SecurityConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Validate namespace
    if (config.namespace && !/^[a-z0-9-]+$/.test(config.namespace)) {
      errors.push('Namespace must contain only lowercase letters, numbers, and hyphens');
    }

    // Validate memory limit
    if (config.maxMemoryMB && (config.maxMemoryMB < 1 || config.maxMemoryMB > 4096)) {
      errors.push('Memory limit must be between 1 and 4096 MB');
    }

    // Validate CPU time limit
    if (config.maxCpuTime && (config.maxCpuTime < 100 || config.maxCpuTime > 300000)) {
      errors.push('CPU time limit must be between 100 and 300000 ms');
    }

    // Validate allowed hosts format
    if (config.allowedHosts) {
      for (const host of config.allowedHosts) {
        if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
          errors.push(`Invalid host format: ${host}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Apply namespace isolation to runtime
   * This ensures code execution is isolated per organization/tenant
   */
  applyNamespaceIsolation(config: SecurityConfig, runtime: string): Record<string, any> {
    const isolationConfig: Record<string, any> = {};

    if (config.namespace) {
      // For different runtimes, namespace isolation is implemented differently
      switch (runtime) {
        case 'e2b':
          // E2B sandboxes are already isolated, but we can add namespace tags
          isolationConfig.namespace = config.namespace;
          isolationConfig.tags = { namespace: config.namespace };
          break;
        case 'vm2':
          // VM2 runs in-process, namespace is handled via context isolation
          isolationConfig.namespace = config.namespace;
          break;
        case 'subprocess':
          // Subprocess can use namespace in environment variables
          isolationConfig.namespace = config.namespace;
          isolationConfig.env = {
            ...isolationConfig.env,
            NAMESPACE: config.namespace,
          };
          break;
        default:
          isolationConfig.namespace = config.namespace;
      }
    }

    return isolationConfig;
  }

  /**
   * Apply read-only filesystem restrictions
   */
  applyReadOnlyFilesystem(config: SecurityConfig, runtime: string): Record<string, any> {
    const fsConfig: Record<string, any> = {};

    if (config.readOnlyFilesystem) {
      switch (runtime) {
        case 'e2b':
          // E2B supports read-only filesystem via sandbox options
          fsConfig.readOnly = true;
          break;
        case 'vm2':
          // VM2 doesn't have direct filesystem access, but we can block fs module
          fsConfig.blockFsModule = true;
          break;
        case 'subprocess':
          // Subprocess can use chroot or read-only mounts (requires container)
          fsConfig.readOnly = true;
          break;
        default:
          fsConfig.readOnly = true;
      }
    }

    return fsConfig;
  }

  /**
   * Apply network restrictions
   */
  applyNetworkRestrictions(config: SecurityConfig, runtime: string): Record<string, any> {
    const networkConfig: Record<string, any> = {};

    if (!config.allowNetwork) {
      // Block all network access
      switch (runtime) {
        case 'e2b':
          // E2B can disable network access
          networkConfig.networkDisabled = true;
          break;
        case 'vm2':
          // VM2 can block network modules
          networkConfig.blockNetworkModules = true;
          break;
        case 'subprocess':
          // Subprocess can use network namespaces or firewall rules
          networkConfig.networkDisabled = true;
          break;
        default:
          networkConfig.networkDisabled = true;
      }
    } else if (config.allowedHosts && config.allowedHosts.length > 0) {
      // Allow only specific hosts
      networkConfig.allowedHosts = config.allowedHosts;
      networkConfig.networkRestricted = true;
    }

    return networkConfig;
  }
}

export const securityConfigService = new SecurityConfigService();

