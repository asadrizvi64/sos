import { db } from '../config/database';
import { codeAgents, codeAgentVersions } from '../../drizzle/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { langtoolsService } from './langtoolsService';
import { storageService } from './storageService';
import { z } from 'zod';

/**
 * Code Agent Registry Service
 * 
 * Manages code agents (reusable code blocks) with versioning,
 * storage, and LangChain tool export capabilities.
 */

export interface CreateCodeAgentInput {
  name: string;
  description?: string;
  language: 'javascript' | 'python' | 'typescript' | 'bash';
  code: string;
  inputSchema?: any; // Zod/Pydantic schema
  outputSchema?: any; // Zod/Pydantic schema
  runtime?: 'vm2' | 'e2b' | 'wasmedge' | 'bacalhau' | 'subprocess';
  packages?: string[];
  environment?: Record<string, string>;
  organizationId?: string;
  workspaceId?: string;
  userId?: string;
  isPublic?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateCodeAgentInput {
  name?: string;
  description?: string;
  code?: string;
  inputSchema?: any;
  outputSchema?: any;
  runtime?: string;
  packages?: string[];
  environment?: Record<string, string>;
  changelog?: Array<{ version: string; changes: string; date: string }>;
  deprecated?: boolean;
  metadata?: Record<string, any>;
}

export interface LangChainToolManifest {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  handler: {
    type: 'code_agent';
    agentId: string;
    version: string;
  };
}

export class CodeAgentRegistry {
  /**
   * Create a new code agent
   */
  async createAgent(input: CreateCodeAgentInput): Promise<typeof codeAgents.$inferSelect> {
    const tracer = trace.getTracer('sos-code-agent-registry');
    const span = tracer.startSpan('codeAgentRegistry.createAgent', {
      attributes: {
        'agent.name': input.name,
        'agent.language': input.language,
        'agent.runtime': input.runtime || 'vm2',
        'organization.id': input.organizationId || '',
        'workspace.id': input.workspaceId || '',
        'user.id': input.userId || '',
      },
    });

    try {
      const agentId = createId();
      const version = '1.0.0';

      // Store code in Supabase Storage if it's large (>100KB), otherwise store in DB
      let codeStoragePath: string | null = null;
      let codeToStore = input.code;

      if (storageService.shouldStoreInStorage(input.code)) {
        try {
          codeStoragePath = await storageService.uploadCodeBlob(input.code, agentId, version);
          // Store placeholder in DB, actual code in storage
          codeToStore = `[Code stored in Supabase Storage: ${codeStoragePath}]`;
        } catch (error: any) {
          // If storage fails, fall back to DB storage
          console.warn('Failed to store code in Supabase Storage, using database:', error.message);
        }
      }

      // Create agent
      const [agent] = await db.insert(codeAgents).values({
          id: agentId,
          name: input.name,
          description: input.description,
          version,
          language: input.language,
          code: codeToStore,
          codeStoragePath: codeStoragePath,
          inputSchema: input.inputSchema || null,
          outputSchema: input.outputSchema || null,
          runtime: input.runtime || 'vm2',
          packages: input.packages || [],
          environment: input.environment || {},
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          isPublic: input.isPublic || false,
          usageCount: 0,
          deprecated: false,
          changelog: [],
          metadata: input.metadata || {},
        })
        .returning();

      // Create initial version
      await db.insert(codeAgentVersions).values({
        id: createId(),
        codeAgentId: agentId,
        version,
        code: input.code,
        inputSchema: input.inputSchema || null,
        outputSchema: input.outputSchema || null,
        changelog: [],
      });

      span.setAttributes({
        'agent.id': agentId,
        'agent.version': version,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      return agent;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get agent by ID (optionally specific version)
   */
  async getAgent(
    agentId: string,
    version?: string
  ): Promise<typeof codeAgents.$inferSelect | null> {
    const tracer = trace.getTracer('sos-code-agent-registry');
    const span = tracer.startSpan('codeAgentRegistry.getAgent', {
      attributes: {
        'agent.id': agentId,
        'agent.version': version || 'latest',
      },
    });

    try {
      let agent: typeof codeAgents.$inferSelect | null = null;

      if (version) {
        // Get specific version
        const versionRecord = await db.query.codeAgentVersions.findFirst({
          where: and(
            eq(codeAgentVersions.codeAgentId, agentId),
            eq(codeAgentVersions.version, version)
          ),
        });

        if (!versionRecord) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Version not found' });
          return null;
        }

        // Get base agent
        agent = await db.query.codeAgents.findFirst({
          where: eq(codeAgents.id, agentId),
        });

        if (!agent) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Agent not found' });
          return null;
        }

        // Use version-specific code
        let versionCode = versionRecord.code;
        
        // Check if version code is stored in storage (check version record for storage path)
        // For now, versions store code directly, but we could add versionStoragePath in future
        if (versionCode?.includes('[Code stored in Supabase Storage')) {
          // Extract storage path from placeholder or use agent's storage path with version
          const storagePath = agent.codeStoragePath 
            ? `${agent.codeStoragePath.replace(/\/[^/]+\.txt$/, '')}/${version}.txt`
            : null;
          if (storagePath) {
            const codeFromStorage = await storageService.downloadCodeBlob(storagePath);
            if (codeFromStorage) {
              versionCode = codeFromStorage;
            }
          }
        }
        
        agent = {
          ...agent,
          code: versionCode,
          inputSchema: versionRecord.inputSchema,
          outputSchema: versionRecord.outputSchema,
        };
      } else {
        // Get latest version
        agent = await db.query.codeAgents.findFirst({
          where: eq(codeAgents.id, agentId),
        });

        if (!agent) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Agent not found' });
          return null;
        }
      }

      // If code is stored in Supabase Storage, download it (for latest version)
      if (agent.codeStoragePath && agent.code?.includes('[Code stored in Supabase Storage')) {
        const codeFromStorage = await storageService.downloadCodeBlob(agent.codeStoragePath);
        if (codeFromStorage) {
          agent = {
            ...agent,
            code: codeFromStorage,
          };
        }
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return agent;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * List agents (with filters)
   */
  async listAgents(filters?: {
    organizationId?: string;
    workspaceId?: string;
    userId?: string;
    language?: string;
    isPublic?: boolean;
    deprecated?: boolean;
  }): Promise<typeof codeAgents.$inferSelect[]> {
    const tracer = trace.getTracer('sos-code-agent-registry');
    const span = tracer.startSpan('codeAgentRegistry.listAgents');

    try {
      const conditions = [];

      if (filters?.organizationId) {
        conditions.push(eq(codeAgents.organizationId, filters.organizationId));
      }
      if (filters?.workspaceId) {
        conditions.push(eq(codeAgents.workspaceId, filters.workspaceId));
      }
      if (filters?.userId) {
        conditions.push(eq(codeAgents.userId, filters.userId));
      }
      if (filters?.language) {
        conditions.push(eq(codeAgents.language, filters.language));
      }
      if (filters?.isPublic !== undefined) {
        conditions.push(eq(codeAgents.isPublic, filters.isPublic));
      }
      if (filters?.deprecated !== undefined) {
        conditions.push(eq(codeAgents.deprecated, filters.deprecated));
      }

      const agents = await db.query.codeAgents.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: desc(codeAgents.createdAt),
      });

      span.setAttributes({ 'agent.count': agents.length });
      span.setStatus({ code: SpanStatusCode.OK });

      return agents;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Update agent (creates new version)
   */
  async updateAgent(
    agentId: string,
    input: UpdateCodeAgentInput
  ): Promise<typeof codeAgents.$inferSelect> {
    const tracer = trace.getTracer('sos-code-agent-registry');
    const span = tracer.startSpan('codeAgentRegistry.updateAgent', {
      attributes: {
        'agent.id': agentId,
      },
    });

    try {
      const existingAgent = await this.getAgent(agentId);
      if (!existingAgent) {
        throw new Error('Agent not found');
      }

      // Calculate new version (simple increment for now)
      const currentVersion = existingAgent.version;
      const [major, minor, patch] = currentVersion.split('.').map(Number);
      const newVersion = `${major}.${minor + 1}.${patch}`;

      // Handle code storage for new version
      const codeToUpdate = input.code ?? existingAgent.code;
      let codeStoragePath = existingAgent.codeStoragePath;
      let codeToStore = codeToUpdate;

      // If code changed and is large, store in Supabase Storage
      if (input.code && storageService.shouldStoreInStorage(input.code)) {
        try {
          codeStoragePath = await storageService.uploadCodeBlob(input.code, agentId, newVersion);
          codeToStore = `[Code stored in Supabase Storage: ${codeStoragePath}]`;
        } catch (error: any) {
          console.warn('Failed to store code in Supabase Storage, using database:', error.message);
        }
      }

      // Update agent
      const [updatedAgent] = await db
        .update(codeAgents)
        .set({
          name: input.name ?? existingAgent.name,
          description: input.description ?? existingAgent.description,
          version: newVersion,
          code: codeToStore,
          codeStoragePath: codeStoragePath,
          inputSchema: input.inputSchema ?? existingAgent.inputSchema,
          outputSchema: input.outputSchema ?? existingAgent.outputSchema,
          runtime: input.runtime ?? existingAgent.runtime,
          packages: input.packages ?? existingAgent.packages,
          environment: input.environment ?? existingAgent.environment,
          deprecated: input.deprecated ?? existingAgent.deprecated,
          changelog: input.changelog ?? existingAgent.changelog,
          metadata: input.metadata ?? existingAgent.metadata,
          updatedAt: new Date(),
        })
        .where(eq(codeAgents.id, agentId))
        .returning();

      // Create new version record (store same code as agent)
      await db.insert(codeAgentVersions).values({
        id: createId(),
        codeAgentId: agentId,
        version: newVersion,
        code: codeToStore,
        inputSchema: input.inputSchema ?? existingAgent.inputSchema,
        outputSchema: input.outputSchema ?? existingAgent.outputSchema,
        changelog: (input.changelog ?? existingAgent.changelog) ?? [],
      });

      span.setAttributes({
        'agent.version': newVersion,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      return updatedAgent;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    const tracer = trace.getTracer('sos-code-agent-registry');
    const span = tracer.startSpan('codeAgentRegistry.deleteAgent', {
      attributes: {
        'agent.id': agentId,
      },
    });

    try {
      // Get agent to check for storage files
      const agent = await db.query.codeAgents.findFirst({
        where: eq(codeAgents.id, agentId),
      });

      // Get all versions to delete their storage files
      const versions = await db.query.codeAgentVersions.findMany({
        where: eq(codeAgentVersions.codeAgentId, agentId),
      });

      // Delete storage files for all versions
      if (agent?.codeStoragePath || versions.length > 0) {
        try {
          // Delete main agent storage file if exists
          if (agent?.codeStoragePath) {
            await storageService.deleteCodeBlob(agent.codeStoragePath);
          }

          // Delete all version storage files
          for (const version of versions) {
            if (version.code?.includes('[Code stored in Supabase Storage')) {
              // Extract storage path from placeholder or construct it
              const storagePath = agent?.codeStoragePath
                ? agent.codeStoragePath.replace(/\/[^/]+\.txt$/, `/${version.version}.txt`)
                : `code-blobs/${agentId}/${version.version}.txt`;
              await storageService.deleteCodeBlob(storagePath);
            }
          }
        } catch (storageError: any) {
          // Log but don't fail deletion if storage cleanup fails
          console.warn('Failed to delete storage files for agent:', storageError.message);
        }
      }

      // Delete agent from database (versions are deleted via cascade)
      await db.delete(codeAgents).where(eq(codeAgents.id, agentId));

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Increment usage count
   */
  async incrementUsage(agentId: string): Promise<void> {
    await db
      .update(codeAgents)
      .set({
        usageCount: sql`${codeAgents.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(codeAgents.id, agentId));
  }

  /**
   * Export agent as LangChain tool manifest
   */
  async exportAsTool(agentId: string, version?: string): Promise<LangChainToolManifest> {
    const agent = await this.getAgent(agentId, version);
    if (!agent) {
      throw new Error('Agent not found');
    }

    return {
      name: agent.name,
      description: agent.description || `${agent.name} code agent`,
      inputSchema: agent.inputSchema || {},
      outputSchema: agent.outputSchema,
      handler: {
        type: 'code_agent',
        agentId: agent.id,
        version: agent.version,
      },
    };
  }

  /**
   * Register agent as LangChain tool
   */
  async registerAsTool(agentId: string, version?: string): Promise<void> {
    const agent = await this.getAgent(agentId, version);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Register with langtoolsService
    langtoolsService.registerTool({
      name: agent.name,
      description: agent.description || `${agent.name} code agent`,
      type: 'custom',
      schema: agent.inputSchema ? z.object(agent.inputSchema) : z.any(),
      handler: async (input: any) => {
        // Execute agent code
        // This would call the code execution service
        // For now, return placeholder
        return `Code agent ${agent.name} executed with input: ${JSON.stringify(input)}`;
      },
    });
  }

  /**
   * Get agent versions
   */
  async getVersions(agentId: string): Promise<typeof codeAgentVersions.$inferSelect[]> {
    return await db.query.codeAgentVersions.findMany({
      where: eq(codeAgentVersions.codeAgentId, agentId),
      orderBy: desc(codeAgentVersions.createdAt),
    });
  }
}

export const codeAgentRegistry = new CodeAgentRegistry();

