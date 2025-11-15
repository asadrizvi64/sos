import { exec } from 'child_process';
import { promisify } from 'util';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Python Bridge Service
 * 
 * Provides a bridge to execute Python scripts and tools from Node.js.
 * Handles Python environment detection, script execution, and result parsing.
 */

export interface PythonBridgeConfig {
  script: string; // Python script content or path
  args?: string[]; // Command-line arguments
  pythonPath?: string; // Custom Python path (default: 'python3' or 'python')
  workingDirectory?: string;
  timeout?: number; // Timeout in milliseconds
  env?: Record<string, string>; // Environment variables
}

export interface PythonBridgeResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  executionTime: number;
}

export class PythonBridgeService {
  private pythonPath: string | null = null;

  /**
   * Detect Python executable path
   */
  async detectPythonPath(): Promise<string> {
    if (this.pythonPath) {
      return this.pythonPath;
    }

    const tracer = trace.getTracer('sos-python-bridge');
    const span = tracer.startSpan('python_bridge.detect', {});

    try {
      // Try python3 first
      try {
        await execAsync('python3 --version');
        this.pythonPath = 'python3';
        span.setAttributes({ 'python.path': 'python3' });
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return 'python3';
      } catch (error) {
        // Try python
        try {
          await execAsync('python --version');
          this.pythonPath = 'python';
          span.setAttributes({ 'python.path': 'python' });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return 'python';
        } catch (error) {
          throw new Error('Python not found. Please install Python 3.7+');
        }
      }
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
      throw error;
    }
  }

  /**
   * Execute Python script
   */
  async execute(config: PythonBridgeConfig): Promise<PythonBridgeResult> {
    const tracer = trace.getTracer('sos-python-bridge');
    const span = tracer.startSpan('python_bridge.execute', {
      attributes: {
        'python.script_length': config.script.length,
        'python.has_args': (config.args?.length || 0) > 0,
      },
    });

    const startTime = Date.now();

    try {
      const pythonPath = config.pythonPath || await this.detectPythonPath();
      const workingDir = config.workingDirectory || process.cwd();
      const timeout = config.timeout || 60000; // Default 60 seconds

      // Create temporary script file if script is provided as content
      let scriptPath: string;
      let shouldCleanup = false;

      if (fs.existsSync(config.script) && path.isAbsolute(config.script)) {
        // Script is a file path
        scriptPath = config.script;
      } else if (fs.existsSync(path.join(workingDir, config.script))) {
        // Script is a relative path
        scriptPath = path.join(workingDir, config.script);
      } else {
        // Script is content - create temporary file
        const tempDir = path.join(workingDir, '.temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        scriptPath = path.join(tempDir, `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
        fs.writeFileSync(scriptPath, config.script, 'utf-8');
        shouldCleanup = true;
      }

      // Build command
      const args = config.args || [];
      const command = `${pythonPath} "${scriptPath}" ${args.map(arg => `"${arg}"`).join(' ')}`;

      span.setAttributes({
        'python.command': command,
        'python.script_path': scriptPath,
      });

      // Execute with timeout
      const env = {
        ...process.env,
        ...config.env,
      };

      const { stdout, stderr } = await Promise.race([
        execAsync(command, {
          cwd: workingDir,
          env,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        }),
        new Promise<{ stdout: string; stderr: string }>((_, reject) =>
          setTimeout(() => reject(new Error('Python script execution timeout')), timeout)
        ),
      ]) as { stdout: string; stderr: string };

      const executionTime = Date.now() - startTime;

      // Cleanup temporary file
      if (shouldCleanup && fs.existsSync(scriptPath)) {
        try {
          fs.unlinkSync(scriptPath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }

      span.setAttributes({
        'python.success': true,
        'python.execution_time_ms': executionTime,
        'python.stdout_length': stdout.length,
        'python.stderr_length': stderr.length,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      span.recordException(error);
      span.setAttributes({
        'python.success': false,
        'python.error': error.message,
        'python.execution_time_ms': executionTime,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();

      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.code || 1,
        error: error.message || 'Unknown error',
        executionTime,
      };
    }
  }

  /**
   * Check if Python package is installed
   */
  async checkPackageInstalled(packageName: string): Promise<boolean> {
    try {
      const pythonPath = await this.detectPythonPath();
      const { stdout } = await execAsync(`${pythonPath} -m pip show ${packageName}`);
      return stdout.includes('Name:');
    } catch (error) {
      return false;
    }
  }

  /**
   * Install Python package
   */
  async installPackage(packageName: string, version?: string): Promise<PythonBridgeResult> {
    const pythonPath = await this.detectPythonPath();
    const packageSpec = version ? `${packageName}==${version}` : packageName;
    
    return await this.execute({
      script: '-m pip install',
      args: [packageSpec],
      pythonPath,
    });
  }
}

export const pythonBridgeService = new PythonBridgeService();

