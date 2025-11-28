import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { setOrganization } from '../middleware/organization';
import { auditLogMiddleware } from '../middleware/auditLog';
import { agentFrameworkRegistry } from '../services/agentFramework';
import { agentRouter, RoutingHeuristics } from '../services/agentRouter';
// WebSocket service removed - using polling endpoint instead for serverless compatibility
// import { websocketService } from '../services/websocketService';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(setOrganization);
router.use(auditLogMiddleware);

/**
 * Get all available agent frameworks
 * GET /api/v1/agents/frameworks
 */
router.get('/frameworks', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const frameworks = agentFrameworkRegistry.getAllMetadata();
    res.json({ frameworks });
  } catch (error) {
    console.error('Error fetching agent frameworks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Execute agent with query
 * POST /api/v1/agents/execute
 */
router.post('/execute', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { query, agentType, useRouting = true, stream = false, routingHeuristics, config } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const executionId = createId();

    // Build routing heuristics
    const heuristics: RoutingHeuristics = routingHeuristics || {
      agent_type: agentType || 'simple',
      tools_required: true,
    };

    // Note: WebSocket emissions removed for serverless compatibility
    // Execution status is available via polling endpoint: /api/poll/execution-status?executionId=...

    // Execute agent (async for streaming)
    if (stream) {
      // For streaming, execute in background and emit updates
      (async () => {
        try {
          const result = await agentRouter.executeWithRouting(
            query,
            heuristics,
            config,
            { userId: req.user!.id, organizationId: req.organizationId }
          );

          // Execution status available via polling endpoint
          // No WebSocket emission needed for serverless compatibility
        } catch (error: any) {
          // Error status available via polling endpoint
          // No WebSocket emission needed for serverless compatibility
        }
      })();

      // Return immediately with execution ID
      res.json({
        executionId,
        status: 'running',
        message: 'Agent execution started',
      });
    } else {
      // Synchronous execution
      try {
        const result = await agentRouter.executeWithRouting(
          query,
          heuristics,
          config,
          { userId: req.user!.id, organizationId: req.organizationId }
        );

        res.json({
          executionId,
          status: 'completed',
          output: result.output,
          metadata: {
            framework: 'auto',
            executionTime: result.executionTime,
            tokensUsed: result.tokensUsed,
            cost: result.cost,
            intermediateSteps: result.intermediateSteps,
          },
        });
      } catch (error: any) {
        // Error status available via polling endpoint
        // No WebSocket emission needed for serverless compatibility
        res.status(500).json({
          executionId,
          status: 'failed',
          error: error.message || 'Execution failed',
        });
      }
    }
  } catch (error: any) {
    console.error('Error executing agent:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Get agent framework details
 * GET /api/v1/agents/frameworks/:name
 */
router.get('/frameworks/:name', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name } = req.params;
    const framework = agentFrameworkRegistry.getFramework(name);

    if (!framework) {
      res.status(404).json({ error: 'Framework not found' });
      return;
    }

    res.json({ framework: framework.getMetadata() });
  } catch (error) {
    console.error('Error fetching framework details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Search agent frameworks
 * GET /api/v1/agents/frameworks/search?q=query
 */
router.get('/frameworks/search', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const results = agentFrameworkRegistry.search(q);
    res.json({ frameworks: results });
  } catch (error) {
    console.error('Error searching frameworks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

