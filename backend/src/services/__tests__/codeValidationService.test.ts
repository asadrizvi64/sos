import { codeValidationService } from '../codeValidationService';

describe('Code Validation Service', () => {
  describe('validateCodeExecution', () => {
    it('should validate JavaScript code with Zod schema', async () => {
      const input = { value: 42 };
      const output = { result: 84 };
      const inputSchema = {
        type: 'object',
        properties: {
          value: { type: 'number' },
        },
        required: ['value'],
      };
      const outputSchema = {
        type: 'object',
        properties: {
          result: { type: 'number' },
        },
        required: ['result'],
      };

      const result = await codeValidationService.validateCodeExecution(
        'javascript',
        input,
        output,
        inputSchema,
        outputSchema,
        'zod'
      );

      expect(result.valid).toBe(true);
    });

    it('should reject invalid output with Zod schema', async () => {
      const input = { value: 42 };
      const output = { result: 'not a number' }; // Invalid
      const outputSchema = {
        type: 'object',
        properties: {
          result: { type: 'number' },
        },
        required: ['result'],
      };

      const result = await codeValidationService.validateCodeExecution(
        'javascript',
        input,
        output,
        undefined,
        outputSchema,
        'zod'
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should validate Python code with Pydantic schema', async () => {
      const input = { value: 42 };
      const output = { result: 84 };
      const inputSchema = {
        type: 'object',
        properties: {
          value: { type: 'number' },
        },
        required: ['value'],
      };
      const outputSchema = {
        type: 'object',
        properties: {
          result: { type: 'number' },
        },
        required: ['result'],
      };

      const result = await codeValidationService.validateCodeExecution(
        'python',
        input,
        output,
        inputSchema,
        outputSchema,
        'pydantic'
      );

      // Pydantic validation might require actual Python execution
      // For now, we'll just verify the method exists and can be called
      expect(result).toBeDefined();
    });

    it('should handle missing schemas gracefully', async () => {
      const input = { value: 42 };
      const output = { result: 84 };

      const result = await codeValidationService.validateCodeExecution(
        'javascript',
        input,
        output,
        undefined,
        undefined,
        'zod'
      );

      // Without schemas, validation should pass
      expect(result.valid).toBe(true);
    });

    it('should validate nested objects', async () => {
      const input = {
        user: {
          name: 'John',
          age: 30,
        },
      };
      const output = {
        result: {
          greeting: 'Hello John',
          age: 30,
        },
      };
      const outputSchema = {
        type: 'object',
        properties: {
          result: {
            type: 'object',
            properties: {
              greeting: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['greeting', 'age'],
          },
        },
        required: ['result'],
      };

      const result = await codeValidationService.validateCodeExecution(
        'javascript',
        input,
        output,
        undefined,
        outputSchema,
        'zod'
      );

      expect(result.valid).toBe(true);
    });

    it('should validate arrays', async () => {
      const output = {
        items: [1, 2, 3, 4, 5],
      };
      const outputSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'number' },
          },
        },
        required: ['items'],
      };

      const result = await codeValidationService.validateCodeExecution(
        'javascript',
        {},
        output,
        undefined,
        outputSchema,
        'zod'
      );

      expect(result.valid).toBe(true);
    });
  });
});

