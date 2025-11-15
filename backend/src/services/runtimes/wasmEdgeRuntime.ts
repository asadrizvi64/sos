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
            message: 'WasmEdge runtime is not available. Install WasmEdge or set WASMEDGE_ENABLED=true and WASMEDGE_PATH.',
            code: 'WASMEDGE_NOT_AVAILABLE',
            details: {
              note: 'To use WasmEdge:',
              steps: [
                '1. Install WasmEdge: curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash',
                '2. Set WASMEDGE_ENABLED=true',
                '3. Optionally set WASMEDGE_PATH to wasmedge binary location',
              ],
            },
          },
        };
      }

      // Compile code to WASM
      let wasmBinary: Buffer;
      try {
        const compilationResult = await wasmCompiler.compile(code, language);
        wasmBinary = compilationResult.wasmBinary;
        
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

      // Execute WASM using wasmedge CLI
      // Note: This is a simplified approach. For production, consider using:
      // 1. wasmedge-extensions npm package (if available)
      // 2. Node.js bindings for WasmEdge SDK
      // 3. HTTP service (if preferred)
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { writeFile, unlink } = await import('fs/promises');
      const { join } = await import('path');
      const { createId } = await import('@paralleldrive/cuid2');
      const execAsync = promisify(exec);

      const tempDir = join(process.cwd(), '.wasm-temp');
      const wasmFile = join(tempDir, `${createId()}.wasm`);
      const inputFile = join(tempDir, `${createId()}.json`);

      try {
        // Ensure temp directory exists
        const { mkdir } = await import('fs/promises');
        await mkdir(tempDir, { recursive: true }).catch(() => {});

        // Write WASM binary to file
        await writeFile(wasmFile, wasmBinary);

        // Write input to JSON file
        await writeFile(inputFile, JSON.stringify(input));

        // Execute WASM using wasmedge CLI
        // Note: This assumes the WASM module has a main function that reads from stdin
        const executeTimeout = Math.min(timeout, this.timeout);
        const command = `${this.wasmEdgePath} ${wasmFile}`;
        
        const result = await Promise.race([
          execAsync(command, {
            timeout: executeTimeout,
            maxBuffer: this.memoryLimit,
          }),
          new Promise<{ stdout: string; stderr: string }>((_, reject) =>
            setTimeout(() => reject(new Error(`WasmEdge execution timed out after ${executeTimeout}ms`)), executeTimeout)
          ),
        ]);

        // Parse output
        let output: any;
        try {
          const stdout = result.stdout.trim();
          if (stdout) {
            output = JSON.parse(stdout);
          } else {
            output = input; // Return input if no output
          }
        } catch {
          // If JSON parsing fails, return raw stdout
          output = result.stdout.trim() || input;
        }

        const totalTime = Date.now() - startTime;

        span.setAttributes({
          'wasmedge.success': true,
          'wasmedge.execution_time_ms': totalTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          success: true,
          output: {
            output: output !== undefined ? output : input,
          },
          metadata: {
            executionTime: totalTime,
          },
        };
      } catch (execError: any) {
        const totalTime = Date.now() - startTime;
        
        span.recordException(execError);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: execError.message || 'WasmEdge execution failed',
        });

        return {
          success: false,
          error: {
            message: execError.message || 'WasmEdge execution failed',
            code: execError.message?.includes('timed out') ? 'WASMEDGE_TIMEOUT' : 'WASMEDGE_EXECUTION_ERROR',
            details: {
              stderr: execError.stderr,
              stdout: execError.stdout,
            },
          },
          metadata: {
            executionTime: totalTime,
          },
        };
      } finally {
        // Cleanup temp files
        try {
          await unlink(wasmFile).catch(() => {});
          await unlink(inputFile).catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
      }
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

// Initialize availability check asynchronously
wasmEdgeRuntime.initialize().catch((error) => {
  console.warn('Failed to check WasmEdge availability:', error);
});

