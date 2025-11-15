import { pythonBridgeService, PythonBridgeConfig } from './pythonBridgeService';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as path from 'path';

/**
 * Undetected-Chromedriver Bridge Service
 * 
 * Provides a bridge to use undetected-chromedriver (Python) from Node.js.
 * Undetected-chromedriver is a Python library that patches ChromeDriver to avoid detection.
 * 
 * This bridge executes Python scripts that use undetected-chromedriver to:
 * - Launch Chrome with anti-detection patches
 * - Execute browser automation tasks
 * - Return results to Node.js
 */

export interface UndetectedChromeDriverConfig {
  url: string;
  action?: 'navigate' | 'screenshot' | 'extract' | 'execute';
  selector?: string;
  script?: string; // JavaScript to execute
  extractSelectors?: Record<string, string>;
  waitForSelector?: string;
  waitTimeout?: number;
  headless?: boolean;
  userAgent?: string;
  proxy?: string; // Proxy URL (e.g., "http://proxy:port")
  options?: Record<string, any>; // Additional Chrome options
}

export interface UndetectedChromeDriverResult {
  success: boolean;
  data?: any;
  screenshot?: string; // Base64
  html?: string;
  error?: string;
  metadata: {
    executionTime: number;
    pythonExecutionTime: number;
  };
}

export class UndetectedChromeDriverBridge {
  /**
   * Generate Python script for undetected-chromedriver
   */
  private generatePythonScript(config: UndetectedChromeDriverConfig): string {
    const action = config.action || 'navigate';
    const headless = config.headless !== false; // Default true
    const waitTimeout = config.waitTimeout || 30000;

    let script = `
import undetected_chromedriver as uc
import json
import base64
import sys
import time
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

try:
    # Chrome options
    options = uc.ChromeOptions()
    ${headless ? 'options.add_argument("--headless")' : ''}
    ${config.userAgent ? `options.add_argument("--user-agent=${config.userAgent}")` : ''}
    ${config.proxy ? `options.add_argument("--proxy-server=${config.proxy}")` : ''}
    
    # Additional options
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    # Launch browser
    driver = uc.Chrome(options=options)
    
    try:
        # Navigate
        driver.get("${config.url}")
        
        # Wait for page load
        time.sleep(2)
        
        result = {
            "success": True,
            "action": "${action}",
            "url": "${config.url}",
        }
        
        # Execute action
        if "${action}" == "navigate":
            result["html"] = driver.page_source
            result["url"] = driver.current_url
            
        elif "${action}" == "screenshot":
            screenshot = driver.get_screenshot_as_base64()
            result["screenshot"] = screenshot
            result["html"] = driver.page_source
            
        elif "${action}" == "extract":
            extracted = {}
            ${config.extractSelectors ? Object.entries(config.extractSelectors).map(([key, selector]) => `
            try:
                element = driver.find_element(By.CSS_SELECTOR, "${selector}")
                extracted["${key}"] = element.text
            except:
                extracted["${key}"] = None
            `).join('') : ''}
            result["data"] = extracted
            result["html"] = driver.page_source
            
        elif "${action}" == "execute":
            ${config.script ? `
            script_result = driver.execute_script("${config.script.replace(/"/g, '\\"')}")
            result["data"] = script_result
            ` : ''}
            result["html"] = driver.page_source
        
        # Wait for selector if specified
        ${config.waitForSelector ? `
        try:
            wait = WebDriverWait(driver, ${waitTimeout / 1000})
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "${config.waitForSelector}")))
        except:
            pass
        ` : ''}
        
        print(json.dumps(result))
        
    finally:
        driver.quit()
        
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
   * Execute undetected-chromedriver task
   */
  async execute(config: UndetectedChromeDriverConfig): Promise<UndetectedChromeDriverResult> {
    const tracer = trace.getTracer('sos-undetected-chromedriver');
    const span = tracer.startSpan('undetected_chromedriver.execute', {
      attributes: {
        'undetected_chromedriver.url': config.url,
        'undetected_chromedriver.action': config.action || 'navigate',
        'undetected_chromedriver.headless': config.headless !== false,
      },
    });

    const startTime = Date.now();

    try {
      // Check if undetected-chromedriver is installed
      const isInstalled = await pythonBridgeService.checkPackageInstalled('undetected-chromedriver');
      
      if (!isInstalled) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'undetected-chromedriver not installed',
        });
        span.end();
        
        return {
          success: false,
          error: 'undetected-chromedriver is not installed. Please install it: pip install undetected-chromedriver',
          metadata: {
            executionTime: Date.now() - startTime,
            pythonExecutionTime: 0,
          },
        };
      }

      // Generate Python script
      const pythonScript = this.generatePythonScript(config);

      span.setAttributes({
        'undetected_chromedriver.script_length': pythonScript.length,
      });

      // Execute Python script
      const pythonResult = await pythonBridgeService.execute({
        script: pythonScript,
        timeout: (config.waitTimeout || 30000) + 60000, // Add buffer for Python execution
      });

      const executionTime = Date.now() - startTime;

      if (!pythonResult.success) {
        span.setAttributes({
          'undetected_chromedriver.success': false,
          'undetected_chromedriver.error': pythonResult.stderr,
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
          'undetected_chromedriver.success': result.success || false,
        });

        if (result.success) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();

          return {
            success: true,
            data: result.data,
            screenshot: result.screenshot,
            html: result.html,
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
        'undetected_chromedriver.success': false,
        'undetected_chromedriver.error': error.message,
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

export const undetectedChromeDriverBridge = new UndetectedChromeDriverBridge();

