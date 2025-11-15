import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * WasmEdge HTTP Service Client
 * 
 * Communicates with WasmEdge HTTP service for WASM execution.
 * This service can be deployed separately or as a Docker container.
 */

export interface WasmEdgeHttpConfig {
  serviceUrl: string;
  timeout?: number;
  apiKey?: string;
}

export interface WasmEdgeExecuteRequest {
  wasm: string; // Base64 encoded WASM binary
  input: any;
  functionName?: string; // Optional: specific function to call
  memoryLimit?: number;
  timeout?: number;
}

export interface WasmEdgeExecuteResponse {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
}

export class WasmEdgeHttpService {
  private serviceUrl: string;
  private timeout: number;
  private apiKey?: string;

  constructor(config: WasmEdgeHttpConfig) {
    this.serviceUrl = config.serviceUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;
    this.apiKey = config.apiKey;
  }

  /**
   * Execute WASM binary via HTTP service
   */
  async execute(request: WasmEdgeExecuteRequest): Promise<WasmEdgeExecuteResponse> {
    const startTime = Date.now();
    const tracer = trace.getTracer('sos-wasmedge-http');
    const span = tracer.startSpan('wasmedge_http.execute', {
      attributes: {
        'wasmedge_http.service_url': this.serviceUrl,
        'wasmedge_http.has_function': !!request.functionName,
        'wasmedge_http.memory_limit': request.memoryLimit || 0,
        'wasmedge_http.timeout': request.timeout || this.timeout,
      },
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), request.timeout || this.timeout);

      try {
        const response = await fetch(`${this.serviceUrl}/execute`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            wasm: request.wasm,
            input: request.input,
            function_name: request.functionName || 'main',
            memory_limit: request.memoryLimit,
            timeout: request.timeout || this.timeout,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`WasmEdge HTTP service error: ${response.status} ${errorText}`);
        }

        const result: WasmEdgeExecuteResponse = await response.json();
        const executionTime = Date.now() - startTime;

        span.setAttributes({
          'wasmedge_http.success': result.success,
          'wasmedge_http.execution_time_ms': result.executionTime || executionTime,
          'wasmedge_http.memory_used': result.memoryUsed || 0,
        });
        span.setStatus({
          code: result.success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
          message: result.error || 'Execution successful',
        });

        return {
          ...result,
          executionTime: result.executionTime || executionTime,
        };
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`WasmEdge execution timed out after ${request.timeout || this.timeout}ms`);
        }
        throw error;
      }
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      return {
        success: false,
        error: error.message || 'WasmEdge HTTP service request failed',
        executionTime: Date.now() - startTime,
      };
    } finally {
      span.end();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

