import { NodeExecutionResult } from '@sos/shared';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { wasmCompiler } from '../wasmCompiler';
import { WasmEdgeHttpService } from '../wasmEdgeHttpService';

/**
 * WasmEdge Runtime Service
 * 
 * Provides secure WASM execution using WasmEdge runtime.
 * Ideal for untrusted code execution with strong isolation.
 * 
 * Implementation uses HTTP service approach for flexibility and ease of deployment.
 */

export interface WasmEdgeConfig {
  serviceUrl?: string;
  timeout?: number;
  memoryLimit?: number;
  apiKey?: string;
}

export class WasmEdgeRuntime {
  private serviceUrl: string;
  private timeout: number;
  private memoryLimit: number;
  private httpService: WasmEdgeHttpService | null = null;
  private isAvailable: boolean = false;

  constructor(config?: WasmEdgeConfig) {
    this.serviceUrl = config?.serviceUrl || process.env.WASMEDGE_SERVICE_URL || '';
    this.timeout = config?.timeout || 30000;
    this.memoryLimit = config?.memoryLimit || 128 * 1024 * 1024; // 128MB default
    
    // Initialize HTTP service if URL is provided
    if (this.serviceUrl) {
      this.httpService = new WasmEdgeHttpService({
        serviceUrl: this.serviceUrl,
        timeout: this.timeout,
        apiKey: config?.apiKey || process.env.WASMEDGE_API_KEY,
      });
      this.isAvailable = true;
    } else if (process.env.WASMEDGE_ENABLED === 'true') {
      // If enabled but no URL, assume embedded SDK will be used later
      this.isAvailable = true;
    }
    
    if (!this.isAvailable) {
      console.warn('WasmEdge runtime is not available. Set WASMEDGE_SERVICE_URL or WASMEDGE_ENABLED=true.');
    }
  }

  /**
   * Check if WasmEdge is available
   */
  checkAvailability(): boolean {
    return this.isAvailable;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.httpService) {
      return false;
    }
    return await this.httpService.healthCheck();
  }

  /**
   * Execute WASM code
   */
  async execute(
    code: string,
    language: 'javascript' | 'typescript' | 'python' | 'rust' | 'go',
    input: any,
    timeout: number = 5000
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const tracer = trace.getTracer('sos-wasmedge-runtime');
    const span = tracer.startSpan('wasmedge.execute', {
      attributes: {
        'wasmedge.language': language,
        'wasmedge.timeout': timeout,
        'wasmedge.code_length': code.length,
        'wasmedge.runtime': 'wasmedge',
      },
    });

    try {
      if (!this.checkAvailability()) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'WasmEdge not available',
        });
        return {
          success: false,
          error: {
            message: 'WasmEdge runtime is not available. Set WASMEDGE_SERVICE_URL or WASMEDGE_ENABLED=true.',
            code: 'WASMEDGE_NOT_AVAILABLE',
          },
        };
      }

      if (!this.httpService) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'WasmEdge HTTP service not configured',
        });
        return {
          success: false,
          error: {
            message: 'WasmEdge HTTP service URL is required. Set WASMEDGE_SERVICE_URL environment variable.',
            code: 'WASMEDGE_SERVICE_NOT_CONFIGURED',
          },
        };
      }

      // Compile code to WASM
      let wasmBase64: string;
      try {
        const compilationResult = await wasmCompiler.compile(code, language);
        wasmBase64 = compilationResult.wasmBase64;
        
        span.setAttributes({
          'wasmedge.compilation_time_ms': compilationResult.compilationTime,
          'wasmedge.wasm_size': compilationResult.size,
        });
      } catch (compilationError: any) {
        span.recordException(compilationError);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `WASM compilation failed: ${compilationError.message}`,
        });

        return {
          success: false,
          error: {
            message: `Failed to compile ${language} to WASM: ${compilationError.message}`,
            code: 'WASM_COMPILATION_ERROR',
            details: {
              language,
              compilationError: compilationError.message,
            },
          },
        };
      }

      // Execute WASM via HTTP service
      const executeTimeout = Math.min(timeout, this.timeout);
      const httpResult = await this.httpService.execute({
        wasm: wasmBase64,
        input,
        functionName: 'main', // Default function name
        memoryLimit: this.memoryLimit,
        timeout: executeTimeout,
      });

      const totalTime = Date.now() - startTime;

      if (!httpResult.success) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: httpResult.error || 'WasmEdge execution failed',
        });

        return {
          success: false,
          error: {
            message: httpResult.error || 'WasmEdge execution failed',
            code: 'WASMEDGE_EXECUTION_ERROR',
            details: {
              executionTime: httpResult.executionTime,
              memoryUsed: httpResult.memoryUsed,
            },
          },
          metadata: {
            executionTime: totalTime,
            memoryUsed: httpResult.memoryUsed,
          },
        };
      }

      span.setAttributes({
        'wasmedge.success': true,
        'wasmedge.execution_time_ms': httpResult.executionTime || totalTime,
        'wasmedge.memory_used': httpResult.memoryUsed || 0,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      return {
        success: true,
        output: {
          output: httpResult.output !== undefined ? httpResult.output : input,
        },
        metadata: {
          executionTime: httpResult.executionTime || totalTime,
          memoryUsed: httpResult.memoryUsed,
        },
      };
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      return {
        success: false,
        error: {
          message: error.message || 'WasmEdge execution failed',
          code: 'WASMEDGE_EXECUTION_ERROR',
          details: error,
        },
      };
    } finally {
      span.end();
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // WasmEdge resources are automatically cleaned up
    // This method is here for consistency with other runtimes
  }
}

export const wasmEdgeRuntime = new WasmEdgeRuntime();

