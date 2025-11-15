import { pythonBridgeService, PythonBridgeConfig } from './pythonBridgeService';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Cloudscraper Bridge Service
 * 
 * Provides a bridge to use cloudscraper (Python) from Node.js.
 * Cloudscraper is a Python library that bypasses Cloudflare anti-bot protection.
 * 
 * This bridge executes Python scripts that use cloudscraper to:
 * - Bypass Cloudflare protection
 * - Fetch protected pages
 * - Extract content from protected sites
 */

export interface CloudscraperConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  data?: Record<string, any>; // POST data
  cookies?: Record<string, string>;
  timeout?: number;
  proxy?: string; // Proxy URL
  userAgent?: string;
  extractSelectors?: Record<string, string>; // CSS selectors to extract (requires BeautifulSoup)
}

export interface CloudscraperResult {
  success: boolean;
  statusCode?: number;
  html?: string;
  text?: string;
  data?: any; // Extracted data from selectors
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  error?: string;
  metadata: {
    executionTime: number;
    pythonExecutionTime: number;
  };
}

export class CloudscraperBridge {
  /**
   * Generate Python script for cloudscraper
   */
  private generatePythonScript(config: CloudscraperConfig): string {
    const method = config.method || 'GET';
    const timeout = config.timeout || 30000;
    const hasSelectors = config.extractSelectors && Object.keys(config.extractSelectors).length > 0;

    let script = `
import cloudscraper
import json
import sys
${hasSelectors ? 'from bs4 import BeautifulSoup' : ''}

try:
    # Create scraper
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    # Prepare headers
    headers = {
        ${config.userAgent ? `'User-Agent': '${config.userAgent}',` : ''}
        ${config.headers ? Object.entries(config.headers).map(([key, value]) => `'${key}': '${value}',`).join('\n        ') : ''}
    }
    
    # Prepare cookies
    cookies = ${config.cookies ? JSON.stringify(config.cookies) : '{}'}
    
    # Prepare request
    request_kwargs = {
        'url': "${config.url}",
        'headers': headers,
        'cookies': cookies,
        'timeout': ${timeout / 1000},
    }
    
    ${config.proxy ? `request_kwargs['proxies'] = {'http': '${config.proxy}', 'https': '${config.proxy}'}` : ''}
    
    # Execute request
    if "${method}" == "GET":
        response = scraper.get(**request_kwargs)
    else:
        request_kwargs['data'] = ${config.data ? JSON.stringify(config.data) : '{}'}
        response = scraper.post(**request_kwargs)
    
    result = {
        "success": True,
        "statusCode": response.status_code,
        "html": response.text,
        "text": response.text,
        "cookies": dict(response.cookies),
        "headers": dict(response.headers),
    }
    
    # Extract data using selectors if provided
    ${hasSelectors ? `
    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        extracted = {}
        ${config.extractSelectors ? Object.entries(config.extractSelectors).map(([key, selector]) => `
        try:
            element = soup.select_one("${selector}")
            extracted["${key}"] = element.get_text(strip=True) if element else None
        except:
            extracted["${key}"] = None
        `).join('') : ''}
        result["data"] = extracted
    ` : ''}
    
    print(json.dumps(result))
    
except Exception as e:
    error_result = {
        "success": False,
        "error": str(e),
        "error_type": type(e).__name__
    }
    print(json.dumps(error_result))
    sys.exit(1)
`;

    return script;
  }

  /**
   * Execute cloudscraper task
   */
  async execute(config: CloudscraperConfig): Promise<CloudscraperResult> {
    const tracer = trace.getTracer('sos-cloudscraper');
    const span = tracer.startSpan('cloudscraper.execute', {
      attributes: {
        'cloudscraper.url': config.url,
        'cloudscraper.method': config.method || 'GET',
      },
    });

    const startTime = Date.now();

    try {
      // Check if cloudscraper is installed
      const isInstalled = await pythonBridgeService.checkPackageInstalled('cloudscraper');
      
      if (!isInstalled) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'cloudscraper not installed',
        });
        span.end();
        
        return {
          success: false,
          error: 'cloudscraper is not installed. Please install it: pip install cloudscraper',
          metadata: {
            executionTime: Date.now() - startTime,
            pythonExecutionTime: 0,
          },
        };
      }

      // Check if BeautifulSoup is needed and installed
      if (config.extractSelectors && Object.keys(config.extractSelectors).length > 0) {
        const bsInstalled = await pythonBridgeService.checkPackageInstalled('beautifulsoup4');
        if (!bsInstalled) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'beautifulsoup4 not installed',
          });
          span.end();
          
          return {
            success: false,
            error: 'beautifulsoup4 is not installed. Please install it: pip install beautifulsoup4',
            metadata: {
              executionTime: Date.now() - startTime,
              pythonExecutionTime: 0,
            },
          };
        }
      }

      // Generate Python script
      const pythonScript = this.generatePythonScript(config);

      span.setAttributes({
        'cloudscraper.script_length': pythonScript.length,
      });

      // Execute Python script
      const pythonResult = await pythonBridgeService.execute({
        script: pythonScript,
        timeout: (config.timeout || 30000) + 30000, // Add buffer for Python execution
      });

      const executionTime = Date.now() - startTime;

      if (!pythonResult.success) {
        span.setAttributes({
          'cloudscraper.success': false,
          'cloudscraper.error': pythonResult.stderr,
        });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: pythonResult.stderr,
        });
        span.end();

        return {
          success: false,
          error: pythonResult.stderr || 'Python execution failed',
          metadata: {
            executionTime,
            pythonExecutionTime: pythonResult.executionTime,
          },
        };
      }

      // Parse JSON result from Python
      try {
        const result = JSON.parse(pythonResult.stdout);

        span.setAttributes({
          'cloudscraper.success': result.success || false,
          'cloudscraper.status_code': result.statusCode || 0,
        });

        if (result.success) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          return {
            success: true,
            statusCode: result.statusCode,
            html: result.html,
            text: result.text,
            data: result.data,
            cookies: result.cookies,
            headers: result.headers,
            metadata: {
              executionTime,
              pythonExecutionTime: pythonResult.executionTime,
            },
          };
        } else {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: result.error || 'Unknown error',
          });
          span.end();

          return {
            success: false,
            error: result.error || 'Unknown error',
            metadata: {
              executionTime,
              pythonExecutionTime: pythonResult.executionTime,
            },
          };
        }
      } catch (parseError: any) {
        span.recordException(parseError);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'Failed to parse Python result',
        });
        span.end();

        return {
          success: false,
          error: `Failed to parse result: ${parseError.message}. Python output: ${pythonResult.stdout}`,
          metadata: {
            executionTime,
            pythonExecutionTime: pythonResult.executionTime,
          },
        };
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      span.recordException(error);
      span.setAttributes({
        'cloudscraper.success': false,
        'cloudscraper.error': error.message,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();

      return {
        success: false,
        error: error.message || 'Unknown error',
        metadata: {
          executionTime,
          pythonExecutionTime: 0,
        },
      };
    }
  }
}

export const cloudscraperBridge = new CloudscraperBridge();

