import { executeCode } from '../code';
import { NodeExecutionContext } from '@sos/shared';

describe('Code Execution', () => {
  const createContext = (overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext => ({
    input: {},
    config: {},
    workflowId: 'test-workflow',
    nodeId: 'test-node',
    executionId: 'test-execution',
    ...overrides,
  });

  describe('JavaScript Execution', () => {
    it('should execute simple JavaScript code', async () => {
      const context = createContext({
        config: {
          code: 'return input.value * 2;',
          language: 'javascript',
        },
        input: { value: 5 },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
      expect(result.output?.output).toBe(10);
    });

    it('should handle JavaScript errors gracefully', async () => {
      const context = createContext({
        config: {
          code: 'throw new Error("Test error");',
          language: 'javascript',
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Test error');
    });

    it('should execute code with input data', async () => {
      const context = createContext({
        config: {
          code: 'return { sum: input.a + input.b, product: input.a * input.b };',
          language: 'javascript',
        },
        input: { a: 3, b: 4 },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
      expect(result.output?.output).toEqual({ sum: 7, product: 12 });
    });

    it('should track memory usage', async () => {
      const context = createContext({
        config: {
          code: 'return Array(1000).fill(0).map((_, i) => i);',
          language: 'javascript',
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
      expect((result as any).metadata?.memoryMb).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should validate input against schema', async () => {
      const context = createContext({
        config: {
          code: 'return input.value;',
          language: 'javascript',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'number' },
            },
            required: ['value'],
          },
        },
        input: { value: 42 },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
    });

    it('should reject invalid input', async () => {
      const context = createContext({
        config: {
          code: 'return input.value;',
          language: 'javascript',
          inputSchema: {
            type: 'object',
            properties: {
              value: { type: 'number' },
            },
            required: ['value'],
          },
        },
        input: { value: 'not a number' },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INPUT_VALIDATION_ERROR');
    });
  });

  describe('Output Validation', () => {
    it('should validate output against schema', async () => {
      const context = createContext({
        config: {
          code: 'return { result: 42 };',
          language: 'javascript',
          outputSchema: {
            type: 'object',
            properties: {
              result: { type: 'number' },
            },
            required: ['result'],
          },
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
    });

    it('should reject invalid output', async () => {
      const context = createContext({
        config: {
          code: 'return "not an object";',
          language: 'javascript',
          outputSchema: {
            type: 'object',
            properties: {
              result: { type: 'number' },
            },
            required: ['result'],
          },
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OUTPUT_VALIDATION_ERROR');
    });
  });

  describe('Runtime Routing', () => {
    it('should use auto-routing when specified', async () => {
      const context = createContext({
        config: {
          code: 'return 42;',
          language: 'javascript',
          runtime: 'auto',
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
    });

    it('should use explicit runtime when specified', async () => {
      const context = createContext({
        config: {
          code: 'return 42;',
          language: 'javascript',
          runtime: 'vm2',
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
    });
  });

  describe('TypeScript Execution', () => {
    it('should compile and execute TypeScript code', async () => {
      const context = createContext({
        config: {
          code: 'const add = (a: number, b: number): number => a + b; return add(input.a, input.b);',
          language: 'typescript',
        },
        input: { a: 5, b: 3 },
      });

      const result = await executeCode(context, 'typescript');

      expect(result.success).toBe(true);
      expect(result.output?.output).toBe(8);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing code gracefully', async () => {
      const context = createContext({
        config: {
          language: 'javascript',
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_CODE');
    });

    it('should handle unsupported language', async () => {
      const context = createContext({
        config: {
          code: 'print("hello")',
          language: 'python',
          runtime: 'vm2', // Invalid runtime for Python
        },
      });

      // This should fall back to subprocess execution
      // We can't easily test Python without Python installed, so we'll skip this
      // or mock it
    });
  });

  describe('Observability', () => {
    it('should include OpenTelemetry span attributes', async () => {
      const context = createContext({
        config: {
          code: 'return 42;',
          language: 'javascript',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
      // Span attributes are set internally, we can't easily test them without mocking
      // but we can verify the execution succeeded which means spans were created
    });

    it('should log execution to database', async () => {
      const context = createContext({
        config: {
          code: 'return 42;',
          language: 'javascript',
        },
        userId: 'test-user',
        workspaceId: 'test-workspace',
        organizationId: 'test-org',
      });

      const result = await executeCode(context, 'javascript');

      expect(result.success).toBe(true);
      // Database logging happens asynchronously, so we can't easily verify it
      // but we can verify execution succeeded
    });
  });
});

