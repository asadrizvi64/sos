import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { setOrganization } from '../middleware/organization';
import { db } from '../config/database';
import { osintMonitors, osintResults } from '../../drizzle/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { osintService } from '../services/osintService';
import { auditLogMiddleware } from '../middleware/auditLog';

const router = Router();

// All routes require authentication and organization context
router.use(authenticate);
router.use(setOrganization);
router.use(auditLogMiddleware);

/**
 * GET /api/v1/osint/monitors
 * List all OSINT monitors for the organization
 */
router.get('/monitors', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const monitors = await db
      .select()
      .from(osintMonitors)
      .where(eq(osintMonitors.organizationId, orgId))
      .orderBy(desc(osintMonitors.createdAt));

    res.json(monitors);
  } catch (error: any) {
    console.error('Error fetching OSINT monitors:', error);
    res.status(500).json({ error: 'Failed to fetch monitors', details: error.message });
  }
});

/**
 * GET /api/v1/osint/monitors/:id
 * Get a specific OSINT monitor
 */
router.get('/monitors/:id', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { id } = req.params;

    const monitor = await db
      .select()
      .from(osintMonitors)
      .where(
        and(
          eq(osintMonitors.id, id),
          eq(osintMonitors.organizationId, orgId)
        )
      )
      .limit(1);

    if (monitor.length === 0) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    res.json(monitor[0]);
  } catch (error: any) {
    console.error('Error fetching OSINT monitor:', error);
    res.status(500).json({ error: 'Failed to fetch monitor', details: error.message });
  }
});

/**
 * POST /api/v1/osint/monitors
 * Create a new OSINT monitor
 */
router.post('/monitors', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { name, description, source, config, schedule, filters, workspaceId, workflowId, alertId } = req.body;

    if (!name || !source || !config) {
      return res.status(400).json({ error: 'Missing required fields: name, source, config' });
    }

    const [monitor] = await db
      .insert(osintMonitors)
      .values({
        organizationId: orgId,
        workspaceId: workspaceId || null,
        name,
        description: description || null,
        source,
        config,
        schedule: schedule || null,
        filters: filters || null,
        workflowId: workflowId || null,
        alertId: alertId || null,
        status: 'active',
      })
      .returning();

    res.status(201).json(monitor);
  } catch (error: any) {
    console.error('Error creating OSINT monitor:', error);
    res.status(500).json({ error: 'Failed to create monitor', details: error.message });
  }
});

/**
 * PUT /api/v1/osint/monitors/:id
 * Update an OSINT monitor
 */
router.put('/monitors/:id', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { id } = req.params;
    const { name, description, config, schedule, filters, workflowId, alertId, status } = req.body;

    const [monitor] = await db
      .update(osintMonitors)
      .set({
        name,
        description,
        config,
        schedule,
        filters,
        workflowId,
        alertId,
        status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(osintMonitors.id, id),
          eq(osintMonitors.organizationId, orgId)
        )
      )
      .returning();

    if (!monitor) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    res.json(monitor);
  } catch (error: any) {
    console.error('Error updating OSINT monitor:', error);
    res.status(500).json({ error: 'Failed to update monitor', details: error.message });
  }
});

/**
 * DELETE /api/v1/osint/monitors/:id
 * Delete an OSINT monitor
 */
router.delete('/monitors/:id', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { id } = req.params;

    await db
      .delete(osintMonitors)
      .where(
        and(
          eq(osintMonitors.id, id),
          eq(osintMonitors.organizationId, orgId)
        )
      );

    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting OSINT monitor:', error);
    res.status(500).json({ error: 'Failed to delete monitor', details: error.message });
  }
});

/**
 * POST /api/v1/osint/monitors/:id/trigger
 * Manually trigger data collection for a monitor
 */
router.post('/monitors/:id/trigger', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { id } = req.params;

    // Verify monitor belongs to organization
    const monitor = await db
      .select()
      .from(osintMonitors)
      .where(
        and(
          eq(osintMonitors.id, id),
          eq(osintMonitors.organizationId, orgId)
        )
      )
      .limit(1);

    if (monitor.length === 0) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    await osintService.triggerCollection(id);

    res.json({ message: 'Collection triggered successfully' });
  } catch (error: any) {
    console.error('Error triggering OSINT collection:', error);
    res.status(500).json({ error: 'Failed to trigger collection', details: error.message });
  }
});

/**
 * GET /api/v1/osint/monitors/:id/results
 * Get results for a specific monitor
 */
router.get('/monitors/:id/results', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify monitor belongs to organization
    const monitor = await db
      .select()
      .from(osintMonitors)
      .where(
        and(
          eq(osintMonitors.id, id),
          eq(osintMonitors.organizationId, orgId)
        )
      )
      .limit(1);

    if (monitor.length === 0) {
      return res.status(404).json({ error: 'Monitor not found' });
    }

    const results = await db
      .select()
      .from(osintResults)
      .where(eq(osintResults.monitorId, id))
      .orderBy(desc(osintResults.publishedAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(osintResults)
      .where(eq(osintResults.monitorId, id));

    res.json({
      results,
      pagination: {
        total: Number(total[0]?.count || 0),
        limit,
        offset,
        hasMore: offset + limit < Number(total[0]?.count || 0),
      },
    });
  } catch (error: any) {
    console.error('Error fetching OSINT results:', error);
    res.status(500).json({ error: 'Failed to fetch results', details: error.message });
  }
});

/**
 * GET /api/v1/osint/results
 * Get all results for the organization
 */
router.get('/results', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const source = req.query.source as string | undefined;
    const monitorId = req.query.monitorId as string | undefined;

    let whereConditions = [eq(osintResults.organizationId, orgId)];
    if (source) {
      whereConditions.push(eq(osintResults.source, source as any));
    }
    if (monitorId) {
      whereConditions.push(eq(osintResults.monitorId, monitorId));
    }

    const results = await db
      .select()
      .from(osintResults)
      .where(and(...whereConditions))
      .orderBy(desc(osintResults.collectedAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(osintResults)
      .where(and(...whereConditions));

    res.json({
      results,
      pagination: {
        total: Number(total[0]?.count || 0),
        limit,
        offset,
        hasMore: offset + limit < Number(total[0]?.count || 0),
      },
    });
  } catch (error: any) {
    console.error('Error fetching OSINT results:', error);
    res.status(500).json({ error: 'Failed to fetch results', details: error.message });
  }
});

/**
 * GET /api/v1/osint/stats
 * Get OSINT statistics for the organization
 */
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = (req as any).organizationId;

    const [monitorStats] = await db
      .select({
        totalMonitors: sql<number>`count(*)`,
        activeMonitors: sql<number>`count(*) filter (where status = 'active')`,
        totalResults: sql<number>`sum(result_count)`,
      })
      .from(osintMonitors)
      .where(eq(osintMonitors.organizationId, orgId));

    const [resultStats] = await db
      .select({
        totalResults: sql<number>`count(*)`,
        resultsBySource: sql<Record<string, number>>`jsonb_object_agg(source, count)`,
      })
      .from(osintResults)
      .where(eq(osintResults.organizationId, orgId));

    res.json({
      monitors: {
        total: Number(monitorStats?.totalMonitors || 0),
        active: Number(monitorStats?.activeMonitors || 0),
      },
      results: {
        total: Number(resultStats?.totalResults || 0),
        bySource: resultStats?.resultsBySource || {},
      },
    });
  } catch (error: any) {
    console.error('Error fetching OSINT stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

export default router;

