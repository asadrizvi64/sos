import { codeAgentRegistry } from '../codeAgentRegistry';
import { db } from '../../config/database';
import { codeAgents } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

// Mock database
jest.mock('../../config/database', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock storage service
jest.mock('../storageService', () => ({
  storageService: {
    shouldStoreInStorage: jest.fn(() => false),
    uploadCodeBlob: jest.fn(),
    downloadCodeBlob: jest.fn(),
  },
}));

describe('Code Agent Registry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAgent', () => {
    it('should create a new code agent', async () => {
      const mockAgent = {
        id: 'test-id',
        name: 'Test Agent',
        description: 'Test Description',
        language: 'javascript' as const,
        code: 'return 42;',
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockAgent]),
        }),
      });

      const input = {
        name: 'Test Agent',
        description: 'Test Description',
        language: 'javascript' as const,
        code: 'return 42;',
        organizationId: 'test-org',
        workspaceId: 'test-workspace',
        userId: 'test-user',
      };

      const result = await codeAgentRegistry.createAgent(input);

      expect(result).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
    });

    it('should handle large code by storing in Supabase Storage', async () => {
      const largeCode = 'x'.repeat(100000); // 100KB code
      const mockAgent = {
        id: 'test-id',
        name: 'Test Agent',
        code: '[Code stored in Supabase Storage: test-path]',
        version: '1.0.0',
      };

      const { storageService } = require('../storageService');
      storageService.shouldStoreInStorage.mockReturnValue(true);
      storageService.uploadCodeBlob.mockResolvedValue('test-path');

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockAgent]),
        }),
      });

      const input = {
        name: 'Test Agent',
        language: 'javascript' as const,
        code: largeCode,
        organizationId: 'test-org',
        workspaceId: 'test-workspace',
        userId: 'test-user',
      };

      await codeAgentRegistry.createAgent(input);

      expect(storageService.uploadCodeBlob).toHaveBeenCalled();
    });
  });

  describe('getAgent', () => {
    it('should retrieve an agent by ID', async () => {
      const mockAgent = {
        id: 'test-id',
        name: 'Test Agent',
        language: 'javascript',
        code: 'return 42;',
        version: '1.0.0',
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockAgent]),
        }),
      });

      const result = await codeAgentRegistry.getAgent('test-id');

      expect(result).toBeDefined();
      expect(db.select).toHaveBeenCalled();
    });

    it('should retrieve a specific version of an agent', async () => {
      const mockVersion = {
        id: 'version-id',
        codeAgentId: 'test-id',
        version: '2.0.0',
        code: 'return 84;',
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockVersion]),
        }),
      });

      const result = await codeAgentRegistry.getAgent('test-id', '2.0.0');

      expect(result).toBeDefined();
    });
  });

  describe('updateAgent', () => {
    it('should create a new version when updating', async () => {
      const existingAgent = {
        id: 'test-id',
        name: 'Test Agent',
        version: '1.0.0',
        code: 'return 42;',
      };

      const updatedAgent = {
        ...existingAgent,
        version: '1.1.0',
        code: 'return 84;',
      };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([existingAgent]),
        }),
      });

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedAgent]),
          }),
        }),
      });

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      });

      const input = {
        code: 'return 84;',
      };

      const result = await codeAgentRegistry.updateAgent('test-id', input);

      expect(result.version).toBe('1.1.0');
      expect(db.insert).toHaveBeenCalled(); // Version record created
    });
  });

  describe('listAgents', () => {
    it('should list agents with filters', async () => {
      const mockAgents = [
        { id: '1', name: 'Agent 1', language: 'javascript' },
        { id: '2', name: 'Agent 2', language: 'python' },
      ];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(mockAgents),
        }),
      });

      const result = await codeAgentRegistry.listAgents({
        language: 'javascript',
        organizationId: 'test-org',
      });

      expect(result).toHaveLength(2);
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('deleteAgent', () => {
    it('should delete an agent', async () => {
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });

      await codeAgentRegistry.deleteAgent('test-id');

      expect(db.delete).toHaveBeenCalled();
    });
  });
});

