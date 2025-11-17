// E2B SDK - Updated for v0.12.5 API
import { CodeRuntime } from '@e2b/sdk';
import { NodeExecutionResult } from '@sos/shared';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * E2B Runtime Service
 * 
 * Provides ultra-fast (<50ms P50) code execution using E2B sandboxes.
 * Ideal for inline transforms and transient functions.
 */

export interface E2BConfig {
  apiKey?: string;
  template?: 'python3' | 'node' | 'bash';
  timeout?: number;
}

export class E2BRuntime {
  private apiKey: string;
  private sdkAvailable: boolean = true;

  constructor(config?: E2BConfig) {
    this.apiKey = config?.apiKey || process.env.E2B_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('E2B_API_KEY not set. E2B runtime will not be available.');
      this.sdkAvailable = false;
    } else {
      this.sdkAvailable = true;
    }
  }

  /**
   * Check if E2B is available
   */
  isAvailable(): boolean {
    return this.sdkAvailable && !!this.apiKey;
  }

  /**
   * Execute code in E2B sandbox
   */
  async execute(
    code: string,
    language: 'python' | 'javascript' | 'typescript' | 'bash',
    input: any,
    timeout: number = 5000
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const tracer = trace.getTracer('sos-e2b-runtime');
    const span = tracer.startSpan('e2b.execute', {
      attributes: {
        'e2b.language': language,
        'e2b.timeout': timeout,
        'e2b.code_length': code.length,
        'e2b.runtime': 'e2b',
      },
    });

    try {
      if (!this.isAvailable()) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'E2B not available',
        });
        return {
          success: false,
          error: {
            message: 'E2B runtime is not available. Set E2B_API_KEY environment variable.',
            code: 'E2B_NOT_AVAILABLE',
          },
        };
      }

      // Determine template based on language
      let template: 'python3' | 'node' | 'bash' = 'node';
      if (language === 'python') {
        template = 'python3';
      } else if (language === 'bash') {
        template = 'bash';
      } else {
        template = 'node'; // JavaScript/TypeScript
      }

      // Create CodeRuntime instance (new API in v0.12.5)
      const runtime = await CodeRuntime.create({
        apiKey: this.apiKey,
        template,
      });

      span.setAttributes({
        'e2b.template': template,
        'e2b.runtime_id': runtime.id || 'unknown',
      });

      try {
        // Prepare code with input
        const inputJson = JSON.stringify(input);
        let codeWithInput = code;
        
        // For Python, add input parsing
        if (language === 'python') {
          codeWithInput = `import json, sys\nINPUT = json.loads('${inputJson.replace(/'/g, "\\'")}')\n${code}`;
        } else if (language === 'javascript' || language === 'typescript') {
          // For JavaScript/TypeScript, add input parsing
          codeWithInput = `const INPUT = ${inputJson};\n${code}`;
        } else if (language === 'bash') {
          // For bash, set as environment variable
          codeWithInput = `export INPUT='${inputJson.replace(/'/g, "'\\''")}'\n${code}`;
        }

        // Execute code using the new API
        const execution = await runtime.runCode(codeWithInput, {
          timeout: timeout / 1000, // Convert to seconds
        });

        // Wait for execution result
        const result = await Promise.race([
          execution,
          new Promise<{ exitCode: number; stdout: string; stderr: string }>((_, reject) =>
            setTimeout(() => reject(new Error(`E2B execution timed out after ${timeout}ms`)), timeout)
          ),
        ]);

        // Parse output - E2B v0.12.5 returns result differently
        // The result structure may vary, so we handle both old and new formats
        let output: any;
        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        let success = true;

        // Handle different result formats
        if (typeof result === 'string') {
          stdout = result;
        } else if (result && typeof result === 'object') {
          stdout = result.stdout || result.text || result.output || '';
          stderr = result.stderr || result.error || '';
          exitCode = result.exitCode || result.code || (stderr ? 1 : 0);
          success = exitCode === 0 && !stderr;
        } else {
          stdout = String(result || '');
        }

        try {
          const stdoutTrimmed = stdout.trim();
          if (stdoutTrimmed) {
            output = JSON.parse(stdoutTrimmed);
          } else {
            output = input; // Return input if no output
          }
        } catch {
          // If JSON parsing fails, return raw stdout
          output = stdout.trim() || input;
        }

        const durationMs = Date.now() - startTime;

        span.setAttributes({
          'e2b.success': success,
          'e2b.exit_code': exitCode,
          'e2b.stdout_length': stdout.length,
          'e2b.stderr_length': stderr.length,
          'e2b.duration_ms': durationMs,
        });
        span.setStatus({
          code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });

        return {
          success,
          output: success
            ? { output }
            : undefined,
          error: success
            ? undefined
            : {
                message: stderr || 'E2B execution failed',
                code: 'E2B_EXECUTION_ERROR',
                details: {
                  exitCode,
                  stderr,
                  stdout,
                },
              },
          metadata: {
            exitCode,
          },
        };
      } finally {
        // Cleanup runtime
        try {
          await runtime.close();
        } catch (error) {
          console.warn('Error closing E2B runtime:', error);
        }
      }
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      if (error.message?.includes('timed out')) {
        return {
          success: false,
          error: {
            message: error.message,
            code: 'E2B_TIMEOUT',
          },
        };
      }

      return {
        success: false,
        error: {
          message: error.message || 'E2B execution failed',
          code: 'E2B_EXECUTION_ERROR',
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
    // E2B sandboxes are automatically cleaned up when closed
    // This method is here for consistency with other runtimes
  }
}

export const e2bRuntime = new E2BRuntime();

