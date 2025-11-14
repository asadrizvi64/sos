/**
 * Policy Management Routes
 * 
 * API endpoints for managing routing policies
 */

import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { policyEngineService } from '../services/policyEngineService';
import { db } from '../config/database';
import { organizations, workspaces } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { auditLogMiddleware } from '../middleware/auditLog';
import { setOrganization } from '../middleware/organization';

const router = Router();

// Apply authentication and audit logging
router.use(authenticate);
router.use(auditLogMiddleware);
router.use(setOrganization);

/**
 * GET /api/v1/policies
 * Get all policy sets for the current organization/workspace
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizationId = req.organizationId;
    const workspaceId = req.query.workspaceId as string | undefined;

    const policySets = policyEngineService.getPolicySets(organizationId, workspaceId);

    res.json({ policySets });
  } catch (error: any) {
    console.error('[Policies] Error fetching policy sets:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy sets' });
  }
});

/**
 * GET /api/v1/policies/:policySetId
 * Get a specific policy set
 */
router.get('/:policySetId', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { policySetId } = req.params;
    const organizationId = req.organizationId;
    const workspaceId = req.query.workspaceId as string | undefined;

    const policySets = policyEngineService.getPolicySets(organizationId, workspaceId);
    const policySet = policySets.find((ps) => ps.id === policySetId);

    if (!policySet) {
      res.status(404).json({ error: 'Policy set not found' });
      return;
    }

    res.json({ policySet });
  } catch (error: any) {
    console.error('[Policies] Error fetching policy set:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy set' });
  }
});

/**
 * POST /api/v1/policies
 * Create a new policy set
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizationId = req.organizationId;
    const workspaceId = req.body.workspaceId as string | undefined;

    // Validate organization/workspace access
    if (organizationId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }
    }

    if (workspaceId) {
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.id, workspaceId),
            organizationId ? eq(workspaces.organizationId, organizationId) : undefined
          )
        )
        .limit(1);

      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
    }

    const policySet = {
      id: req.body.id || `policy-${Date.now()}`,
      name: req.body.name,
      description: req.body.description,
      organizationId,
      workspaceId,
      rules: req.body.rules || [],
      enabled: req.body.enabled !== false,
      priority: req.body.priority || 0,
    };

    policyEngineService.registerPolicySet(policySet);

    res.status(201).json({ policySet });
  } catch (error: any) {
    console.error('[Policies] Error creating policy set:', error);
    res.status(500).json({ error: error.message || 'Failed to create policy set' });
  }
});

/**
 * PUT /api/v1/policies/:policySetId
 * Update a policy set
 */
router.put('/:policySetId', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { policySetId } = req.params;
    const organizationId = req.organizationId;
    const workspaceId = req.body.workspaceId as string | undefined;

    const policySets = policyEngineService.getPolicySets(organizationId, workspaceId);
    const existingPolicySet = policySets.find((ps) => ps.id === policySetId);

    if (!existingPolicySet) {
      res.status(404).json({ error: 'Policy set not found' });
      return;
    }

    // Unregister old policy set
    policyEngineService.unregisterPolicySet(policySetId);

    // Register updated policy set
    const updatedPolicySet = {
      ...existingPolicySet,
      ...req.body,
      id: policySetId, // Ensure ID doesn't change
      organizationId: existingPolicySet.organizationId || organizationId,
      workspaceId: existingPolicySet.workspaceId || workspaceId,
    };

    policyEngineService.registerPolicySet(updatedPolicySet);

    res.json({ policySet: updatedPolicySet });
  } catch (error: any) {
    console.error('[Policies] Error updating policy set:', error);
    res.status(500).json({ error: error.message || 'Failed to update policy set' });
  }
});

/**
 * DELETE /api/v1/policies/:policySetId
 * Delete a policy set
 */
router.delete('/:policySetId', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { policySetId } = req.params;
    const organizationId = req.organizationId;
    const workspaceId = req.query.workspaceId as string | undefined;

    const policySets = policyEngineService.getPolicySets(organizationId, workspaceId);
    const existingPolicySet = policySets.find((ps) => ps.id === policySetId);

    if (!existingPolicySet) {
      res.status(404).json({ error: 'Policy set not found' });
      return;
    }

    policyEngineService.unregisterPolicySet(policySetId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Policies] Error deleting policy set:', error);
    res.status(500).json({ error: error.message || 'Failed to delete policy set' });
  }
});

/**
 * POST /api/v1/policies/evaluate
 * Evaluate policies against a context (for testing)
 */
router.post('/evaluate', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizationId = req.organizationId;
    const workspaceId = req.body.workspaceId as string | undefined;
    const context = req.body.context;

    const result = await policyEngineService.evaluatePolicies(context, {
      organizationId,
      workspaceId,
    });

    res.json({ result });
  } catch (error: any) {
    console.error('[Policies] Error evaluating policies:', error);
    res.status(500).json({ error: error.message || 'Failed to evaluate policies' });
  }
});

export default router;

