import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { setOrganization } from '../middleware/organization';
import { requirePermission } from '../middleware/permissions';
import { alertService, AlertConfig } from '../services/alertService';
import { db } from '../config/database';
import { alerts, alertHistory, organizations, organizationMembers } from '../../drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { auditLogMiddleware } from '../middleware/auditLog';

const router = Router();

// All routes require authentication and organization
router.use(authenticate);
router.use(setOrganization);
router.use(auditLogMiddleware);

const CreateAlertSchema = z.object({
  workflowId: z.string().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['failure', 'performance', 'usage', 'custom']),
  conditions: z.array(
    z.object({
      metric: z.string(),
      operator: z.enum(['>', '<', '>=', '<=', '==']),
      threshold: z.number(),
      timeWindow: z.number().optional(),
    })
  ),
  notificationChannels: z.array(
    z.object({
      type: z.enum(['email', 'slack', 'webhook']),
      config: z.object({
        email: z.string().email().optional(),
        slackWebhookUrl: z.string().url().optional(),
        webhookUrl: z.string().url().optional(),
      }),
    })
  ),
  cooldownMinutes: z.number().int().positive().optional(),
});

// Get all alerts for organization
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { workflowId } = req.query;

    const alertsList = await alertService.getAlerts(
      req.organizationId,
      workflowId as string | undefined
    );

    res.json(alertsList);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alert by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const alert = await alertService.getAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Verify user has access to organization
    if (alert.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json(alert);
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create alert
router.post('/', requirePermission({ resourceType: 'alert', action: 'create' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = CreateAlertSchema.parse(req.body);

    const config: AlertConfig = {
      organizationId: req.organizationId,
      workflowId: validated.workflowId,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      conditions: validated.conditions,
      notificationChannels: validated.notificationChannels,
      cooldownMinutes: validated.cooldownMinutes,
    };

    const alertId = await alertService.createAlert(config);
    const alert = await alertService.getAlert(alertId);

    res.status(201).json(alert);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update alert
router.put('/:id', requirePermission({ resourceType: 'alert', action: 'update' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const alert = await alertService.getAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Verify user has access
    if (alert.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const validated = CreateAlertSchema.partial().parse(req.body);
    await alertService.updateAlert(req.params.id, validated as Partial<AlertConfig>);

    const updatedAlert = await alertService.getAlert(req.params.id);
    res.json(updatedAlert);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete alert
router.delete('/:id', requirePermission({ resourceType: 'alert', action: 'delete' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const alert = await alertService.getAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Verify user has access
    if (alert.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await alertService.deleteAlert(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle alert
router.patch('/:id/toggle', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }

    const alert = await alertService.getAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Verify user has access
    if (alert.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await alertService.toggleAlert(req.params.id, enabled);
    const updatedAlert = await alertService.getAlert(req.params.id);
    res.json(updatedAlert);
  } catch (error) {
    console.error('Error toggling alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alert history
router.get('/:id/history', async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const alert = await alertService.getAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    // Verify user has access
    if (alert.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const history = await alertService.getAlertHistory(req.params.id, limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching alert history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

