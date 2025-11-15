import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { codeAgentRegistry, CreateCodeAgentInput, UpdateCodeAgentInput } from '../services/codeAgentRegistry';
import { auditLogMiddleware } from '../middleware/auditLog';
import { setOrganization } from '../middleware/organization';

const router = Router();

// Apply audit logging to all routes
router.use(auditLogMiddleware);

// Create code agent
router.post('/', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const input: CreateCodeAgentInput = {
      name: req.body.name,
      description: req.body.description,
      language: req.body.language,
      code: req.body.code,
      inputSchema: req.body.inputSchema,
      outputSchema: req.body.outputSchema,
      runtime: req.body.runtime || 'vm2',
      packages: req.body.packages || [],
      environment: req.body.environment || {},
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      userId: req.user.id,
      isPublic: req.body.isPublic || false,
      metadata: req.body.metadata || {},
    };

    const agent = await codeAgentRegistry.createAgent(input);
    res.status(201).json(agent);
  } catch (error: any) {
    console.error('Error creating code agent:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// List code agents
router.get('/', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const filters: any = {
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
    };

    // Optional filters
    if (req.query.language) {
      filters.language = req.query.language as string;
    }
    if (req.query.isPublic !== undefined) {
      filters.isPublic = req.query.isPublic === 'true';
    }
    if (req.query.deprecated !== undefined) {
      filters.deprecated = req.query.deprecated === 'true';
    }

    const agents = await codeAgentRegistry.listAgents(filters);
    res.json(agents);
  } catch (error: any) {
    console.error('Error listing code agents:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get code agent by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const version = req.query.version as string | undefined;
    const agent = await codeAgentRegistry.getAgent(req.params.id, version);

    if (!agent) {
      res.status(404).json({ error: 'Code agent not found' });
      return;
    }

    res.json(agent);
  } catch (error: any) {
    console.error('Error getting code agent:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update code agent (creates new version)
router.put('/:id', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const input: UpdateCodeAgentInput = {
      name: req.body.name,
      description: req.body.description,
      code: req.body.code,
      inputSchema: req.body.inputSchema,
      outputSchema: req.body.outputSchema,
      runtime: req.body.runtime,
      packages: req.body.packages,
      environment: req.body.environment,
      changelog: req.body.changelog,
      deprecated: req.body.deprecated,
      metadata: req.body.metadata,
    };

    const agent = await codeAgentRegistry.updateAgent(req.params.id, input);
    res.json(agent);
  } catch (error: any) {
    console.error('Error updating code agent:', error);
    if (error.message === 'Agent not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// Delete code agent
router.delete('/:id', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await codeAgentRegistry.deleteAgent(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting code agent:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get agent versions
router.get('/:id/versions', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const versions = await codeAgentRegistry.getVersions(req.params.id);
    res.json(versions);
  } catch (error: any) {
    console.error('Error getting agent versions:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Export agent as LangChain tool
router.post('/:id/export-tool', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const version = req.query.version as string | undefined;
    const toolManifest = await codeAgentRegistry.exportAsTool(req.params.id, version);
    res.json(toolManifest);
  } catch (error: any) {
    console.error('Error exporting tool:', error);
    if (error.message === 'Agent not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// Get analytics for code agents
router.get('/analytics', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const agentId = req.query.agentId as string | undefined;
    const timeRange = (req.query.timeRange as '7d' | '30d' | '90d' | 'all') || '30d';
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    const { codeExecutionLogger } = await import('../services/codeExecutionLogger');
    const { db } = await import('../config/database');
    const { codeExecLogs } = await import('../../drizzle/schema');
    const { and, gte, eq } = await import('drizzle-orm');

    // Build query filters
    const filters: any[] = [
      gte(codeExecLogs.createdAt, startDate),
    ];

    if (agentId) {
      filters.push(eq(codeExecLogs.codeAgentId, agentId));
    }

    if (req.organizationId) {
      filters.push(eq(codeExecLogs.organizationId, req.organizationId));
    }

    // Fetch logs
    const logs = await db
      .select()
      .from(codeExecLogs)
      .where(and(...filters));

    // Calculate statistics
    const totalExecutions = logs.length;
    const successful = logs.filter(l => l.success).length;
    const totalErrors = logs.filter(l => !l.success).length;
    const successRate = totalExecutions > 0 ? successful / totalExecutions : 0;
    const totalDuration = logs.reduce((sum, l) => sum + (l.durationMs || 0), 0);
    const avgDurationMs = totalExecutions > 0 ? totalDuration / totalExecutions : 0;
    const totalTokensUsed = logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);
    const totalMemory = logs.reduce((sum, l) => sum + (l.memoryMb || 0), 0);
    const avgMemoryMb = totalExecutions > 0 ? totalMemory / totalExecutions : 0;

    // Group by language
    const executionsByLanguage: Record<string, number> = {};
    logs.forEach(log => {
      executionsByLanguage[log.language] = (executionsByLanguage[log.language] || 0) + 1;
    });

    // Group by runtime
    const executionsByRuntime: Record<string, number> = {};
    logs.forEach(log => {
      executionsByRuntime[log.runtime] = (executionsByRuntime[log.runtime] || 0) + 1;
    });

    // Group by date
    const executionsByDate: Record<string, { count: number; successCount: number; errorCount: number }> = {};
    logs.forEach(log => {
      const date = new Date(log.createdAt).toISOString().split('T')[0];
      if (!executionsByDate[date]) {
        executionsByDate[date] = { count: 0, successCount: 0, errorCount: 0 };
      }
      executionsByDate[date].count++;
      if (log.success) {
        executionsByDate[date].successCount++;
      } else {
        executionsByDate[date].errorCount++;
      }
    });

    const executionsOverTime = Object.entries(executionsByDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      stats: {
        totalExecutions,
        successRate,
        avgDurationMs,
        totalErrors,
        totalTokensUsed,
        avgMemoryMb,
        executionsByLanguage,
        executionsByRuntime,
        executionsOverTime,
      },
    });
  } catch (error: any) {
    console.error('Error getting code agent analytics:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Register agent as LangChain tool
router.post('/:id/register-tool', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const version = req.query.version as string | undefined;
    await codeAgentRegistry.registerAsTool(req.params.id, version);
    res.json({ message: 'Agent registered as tool successfully' });
  } catch (error: any) {
    console.error('Error registering tool:', error);
    if (error.message === 'Agent not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// Execute code agent
router.post('/:id/execute', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const version = req.query.version as string | undefined;
    const agent = await codeAgentRegistry.getAgent(req.params.id, version);

    if (!agent) {
      res.status(404).json({ error: 'Code agent not found' });
      return;
    }

    const input = req.body.input || {};

    // Execute agent code
    // This would call the code execution service
    // For now, return placeholder
    res.json({
      success: true,
      output: {
        message: `Code agent ${agent.name} executed`,
        agentId: agent.id,
        version: agent.version,
      },
    });
  } catch (error: any) {
    console.error('Error executing code agent:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get public registry (public code agents)
router.get('/registry/public', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const agents = await codeAgentRegistry.listAgents({
      isPublic: true,
      deprecated: false,
    });

    res.json(agents);
  } catch (error: any) {
    console.error('Error getting public registry:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

