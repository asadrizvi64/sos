import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { codeAgentRegistry, CreateCodeAgentInput, UpdateCodeAgentInput } from '../services/codeAgentRegistry';
import { auditLogMiddleware } from '../middleware/auditLog';
import { setOrganization } from '../middleware/organization';
import { requirePermission } from '../middleware/permissions';
import { mcpServerService } from '../services/mcpServerService';

const router = Router();

// Apply audit logging to all routes
router.use(auditLogMiddleware);

// Create code agent
router.post('/', authenticate, setOrganization, requirePermission({ resourceType: 'code_agent', action: 'create' }), async (req: AuthRequest, res) => {
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
router.get('/:id', authenticate, setOrganization, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const version = req.query.version as string | undefined;
    // Verify tenant scoping
    const agent = await codeAgentRegistry.getAgent(req.params.id, version, {
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      userId: req.user.id,
    });

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
router.put('/:id', authenticate, setOrganization, requirePermission({ resourceType: 'code_agent', action: 'update' }), async (req: AuthRequest, res) => {
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
router.delete('/:id', authenticate, setOrganization, requirePermission({ resourceType: 'code_agent', action: 'delete' }), async (req: AuthRequest, res) => {
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
    
    // Calculate latency percentiles
    const durations = logs.map(l => l.durationMs || 0).filter(d => d > 0).sort((a, b) => a - b);
    const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const p95 = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;
    const p99 = durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0;
    
    // Calculate validation failure rate
    const validationAttempts = logs.filter(l => l.validationPassed !== null).length;
    const validationFailures = logs.filter(l => l.validationPassed === false).length;
    const validationFailureRate = validationAttempts > 0 ? validationFailures / validationAttempts : 0;
    
    // Calculate registry reuse rate (if agentId is provided)
    let registryReuseRate = 0;
    if (agentId) {
      // Get total code executions in organization (all time, not just filtered time range)
      const allLogs = await db
        .select()
        .from(codeExecLogs)
        .where(eq(codeExecLogs.organizationId, req.organizationId!));
      
      const totalCodeExecutions = allLogs.length;
      const agentExecutions = allLogs.filter(l => l.codeAgentId === agentId).length;
      registryReuseRate = totalCodeExecutions > 0 ? agentExecutions / totalCodeExecutions : 0;
    }

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
        // Latency metrics
        latencyP50: p50,
        latencyP95: p95,
        latencyP99: p99,
        // Validation metrics
        validationFailureRate,
        validationAttempts,
        validationFailures,
        // Registry reuse metrics
        registryReuseRate: agentId ? registryReuseRate : undefined,
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
    // Verify tenant scoping
    const agent = await codeAgentRegistry.getAgent(req.params.id, version, {
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      userId: req.user.id,
    });

    if (!agent) {
      res.status(404).json({ error: 'Code agent not found' });
      return;
    }

    const input = req.body.input || {};

    // Execute agent code using the code execution service
    const { executeCode } = await import('../services/nodeExecutors/code');
    
    const executionContext = {
      input: input,
      config: {
        code: agent.code,
        packages: agent.packages || [],
        timeout: 30000,
        runtime: agent.runtime || 'vm2',
        codeAgentId: agent.id,
      },
      workflowId: `agent-${agent.id}`,
      nodeId: 'code-agent',
      executionId: `agent-exec-${Date.now()}`,
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      userId: req.user.id,
    };

    const result = await executeCode(executionContext, agent.language as 'javascript' | 'python' | 'typescript' | 'bash');

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error?.message || 'Code execution failed',
        details: result.error,
      });
    }

    res.json({
      success: true,
      output: result.output,
      metadata: {
        agentId: agent.id,
        version: agent.version,
        executionTime: result.executionTime,
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

// Deploy to MCP Server endpoint
router.post('/:id/deploy-mcp', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const agentId = req.params.id;
    const agent = await codeAgentRegistry.getAgent(agentId, {
      organizationId: req.organizationId,
      workspaceId: req.workspaceId,
      userId: req.user.id,
    });

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // Deploy agent to MCP server
    const deploymentConfig = req.body.config || {};
    const deploymentResult = await mcpServerService.deployAgent(
      {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        code: agent.code,
        language: agent.language,
        inputSchema: agent.inputSchema,
        outputSchema: agent.outputSchema,
        packages: agent.packages,
        environment: agent.environment,
      },
      deploymentConfig
    );

    if (!deploymentResult.success) {
      res.status(500).json({
        success: false,
        error: deploymentResult.error || 'Failed to deploy to MCP server',
      });
      return;
    }

    res.json({
      success: true,
      message: deploymentResult.message,
      serverPath: deploymentResult.serverPath,
      toolName: deploymentResult.toolName,
    });
  } catch (error: any) {
    console.error('Error deploying to MCP Server:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Code suggestions endpoint
router.post('/suggestions', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { codeSuggestionService } = await import('../services/codeSuggestionService');
    
    if (!codeSuggestionService.isEnabled()) {
      res.status(503).json({ error: 'Code suggestions are not enabled' });
      return;
    }

    const suggestion = await codeSuggestionService.getSuggestions({
      code: req.body.code,
      language: req.body.language,
      context: req.body.context,
      suggestionType: req.body.suggestionType || 'improve',
      cursorPosition: req.body.cursorPosition,
    });

    if (!suggestion) {
      res.status(500).json({ error: 'Failed to generate suggestion' });
      return;
    }

    res.json(suggestion);
  } catch (error: any) {
    console.error('Error getting code suggestion:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Code review endpoint
router.post('/review', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { codeReviewService } = await import('../services/codeReviewService');
    
    if (!codeReviewService.isEnabled()) {
      res.status(503).json({ error: 'Code review is not enabled' });
      return;
    }

    const review = await codeReviewService.reviewCode({
      code: req.body.code,
      language: req.body.language,
      reviewType: req.body.reviewType || 'comprehensive',
      context: req.body.context,
    });

    if (!review) {
      res.status(500).json({ error: 'Failed to generate review' });
      return;
    }

    res.json(review);
  } catch (error: any) {
    console.error('Error reviewing code:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Sandbox escape detection endpoint
router.post('/check-escape', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { sandboxEscapeDetectionService } = await import('../services/sandboxEscapeDetectionService');
    
    const result = sandboxEscapeDetectionService.analyzeCode(
      req.body.code,
      req.body.language
    );

    const shouldBlock = sandboxEscapeDetectionService.shouldBlock(
      result,
      (req.body.blockThreshold as 'low' | 'medium' | 'high' | 'critical') || 'high'
    );

    res.json({
      ...result,
      shouldBlock,
    });
  } catch (error: any) {
    console.error('Error checking for escape attempts:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

