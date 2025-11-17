import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../config/database';
import { workflowTemplates, organizations, organizationMembers } from '../../drizzle/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { setOrganization } from '../middleware/organization';
import { requirePermission } from '../middleware/permissions';
import { auditLogMiddleware } from '../middleware/auditLog';
import { cacheMiddleware, invalidateEndpointCache } from '../middleware/cache';

const router = Router();

// Apply middleware
router.use(authenticate);
router.use(auditLogMiddleware);

// Pre-built workflow templates (for initial migration)
// NOTE: These are only used by the migration script. Templates are stored in the database.
// To migrate these to the database, run: tsx scripts/migrate-templates-to-db.ts
const defaultTemplates = [
  {
    id: 'simple-webhook',
    name: 'Simple Webhook',
    description: 'A basic webhook trigger that processes incoming data',
    category: 'webhook',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'trigger.webhook',
            label: 'Webhook',
            config: {
              path: '/webhook',
              method: 'POST',
            },
          },
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            type: 'action.http',
            label: 'HTTP Request',
            config: {
              method: 'POST',
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1',
        },
      ],
    },
  },
  {
    id: 'conditional-processing',
    name: 'Conditional Processing',
    description: 'Process data conditionally with IF/ELSE logic',
    category: 'logic',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'trigger.manual',
            label: 'Manual Trigger',
            config: {},
          },
        },
        {
          id: 'if-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            type: 'logic.if',
            label: 'IF/ELSE',
            config: {
              condition: 'input.value > 10',
            },
          },
        },
        {
          id: 'action-true',
          type: 'custom',
          position: { x: 500, y: 50 },
          data: {
            type: 'action.http',
            label: 'If True',
            config: {},
          },
        },
        {
          id: 'action-false',
          type: 'custom',
          position: { x: 500, y: 150 },
          data: {
            type: 'action.http',
            label: 'If False',
            config: {},
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'if-1',
        },
        {
          id: 'edge-2',
          source: 'if-1',
          target: 'action-true',
          sourceHandle: 'true',
        },
        {
          id: 'edge-3',
          source: 'if-1',
          target: 'action-false',
          sourceHandle: 'false',
        },
      ],
    },
  },
  {
    id: 'ai-text-generation',
    name: 'AI Text Generation',
    description: 'Generate text using AI LLM',
    category: 'ai',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'trigger.manual',
            label: 'Manual Trigger',
            config: {},
          },
        },
        {
          id: 'llm-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            type: 'ai.llm',
            label: 'LLM',
            config: {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              temperature: 0.7,
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'llm-1',
        },
      ],
    },
  },
  {
    id: 'scheduled-task',
    name: 'Scheduled Task',
    description: 'Run a task on a schedule',
    category: 'schedule',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'trigger.schedule',
            label: 'Schedule',
            config: {
              cron: '0 * * * *', // Every hour
              timezone: 'UTC',
            },
          },
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            type: 'action.http',
            label: 'HTTP Request',
            config: {},
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'action-1',
        },
      ],
    },
  },
  {
    id: 'data-loop',
    name: 'Process Array Data',
    description: 'Loop through an array and process each item',
    category: 'logic',
    definition: {
      nodes: [
        {
          id: 'trigger-1',
          type: 'custom',
          position: { x: 100, y: 100 },
          data: {
            type: 'trigger.manual',
            label: 'Manual Trigger',
            config: {},
          },
        },
        {
          id: 'loop-1',
          type: 'custom',
          position: { x: 300, y: 100 },
          data: {
            type: 'logic.loop.foreach',
            label: 'FOREACH Loop',
            config: {
              arrayPath: 'input',
            },
          },
        },
        {
          id: 'action-1',
          type: 'custom',
          position: { x: 500, y: 100 },
          data: {
            type: 'action.http',
            label: 'Process Item',
            config: {},
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'trigger-1',
          target: 'loop-1',
        },
        {
          id: 'edge-2',
          source: 'loop-1',
          target: 'action-1',
        },
      ],
    },
  },
];

// Get all templates (public + organization templates) - cached for 60 seconds
router.get('/', setOrganization, cacheMiddleware({ ttl: 60, prefix: 'templates' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user's organization IDs
    const userOrgs = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, req.user.id));

    const orgIds = userOrgs.map((org) => org.organizationId);

    // Get public templates and organization-specific templates
    let templatesList;
    if (orgIds.length > 0) {
      templatesList = await db
        .select({
          id: workflowTemplates.id,
          name: workflowTemplates.name,
          description: workflowTemplates.description,
          category: workflowTemplates.category,
          definition: workflowTemplates.definition,
          isPublic: workflowTemplates.isPublic,
          usageCount: workflowTemplates.usageCount,
          tags: workflowTemplates.tags,
          createdAt: workflowTemplates.createdAt,
          updatedAt: workflowTemplates.updatedAt,
        })
        .from(workflowTemplates)
        .where(
          or(
            eq(workflowTemplates.isPublic, true), // Public templates
            sql`${workflowTemplates.organizationId} = ANY(${sql.raw(`ARRAY[${orgIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')}]`)})` // Organization templates
          )!
        )
        .orderBy(sql`${workflowTemplates.usageCount} DESC`, workflowTemplates.createdAt);
    } else {
      // Only public templates if user has no organizations
      templatesList = await db
        .select({
          id: workflowTemplates.id,
          name: workflowTemplates.name,
          description: workflowTemplates.description,
          category: workflowTemplates.category,
          definition: workflowTemplates.definition,
          isPublic: workflowTemplates.isPublic,
          usageCount: workflowTemplates.usageCount,
          tags: workflowTemplates.tags,
          createdAt: workflowTemplates.createdAt,
          updatedAt: workflowTemplates.updatedAt,
        })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.isPublic, true))
        .orderBy(sql`${workflowTemplates.usageCount} DESC`, workflowTemplates.createdAt);
    }

    res.json(templatesList);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get template by ID - cached for 60 seconds
router.get('/:id', setOrganization, cacheMiddleware({ ttl: 60, prefix: 'templates' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user's organization IDs
    const userOrgs = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, req.user.id));

    const orgIds = userOrgs.map((org) => org.organizationId);

    // Get template (must be public or belong to user's organization)
    let template;
    if (orgIds.length > 0) {
      [template] = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.id, req.params.id),
            or(
              eq(workflowTemplates.isPublic, true),
              sql`${workflowTemplates.organizationId} = ANY(${sql.raw(`ARRAY[${orgIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')}]`)})`
            )!
          )
        )
        .limit(1);
    } else {
      [template] = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.id, req.params.id),
            eq(workflowTemplates.isPublic, true)
          )
        )
        .limit(1);
    }

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new template
router.post('/', setOrganization, requirePermission({ resourceType: 'template', action: 'create' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, description, category, definition, isPublic, tags } = req.body;

    if (!name || !definition) {
      res.status(400).json({ error: 'Name and definition are required' });
      return;
    }

    const [newTemplate] = await db
      .insert(workflowTemplates)
      .values({
        name,
        description,
        category: category || null,
        definition: definition as any,
        organizationId: isPublic ? null : req.organizationId,
        createdBy: req.user.id,
        isPublic: isPublic || false,
        tags: tags || [],
        usageCount: 0,
      })
      .returning();

    // Invalidate templates cache
    await invalidateEndpointCache('GET', '/templates', 'templates');

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update template
router.put('/:id', setOrganization, requirePermission({ resourceType: 'template', action: 'update' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { name, description, category, definition, isPublic, tags } = req.body;

    // Check if template exists and user has permission
    const [existing] = await db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator or organization admin can update
    if (existing.createdBy !== req.user.id && existing.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (definition !== undefined) updateData.definition = definition;
    if (isPublic !== undefined) updateData.isPublic = isPublic;
    if (tags !== undefined) updateData.tags = tags;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(workflowTemplates)
      .set(updateData)
      .where(eq(workflowTemplates.id, req.params.id))
      .returning();

    // Invalidate templates cache
    await invalidateEndpointCache('GET', '/templates', 'templates');
    await invalidateEndpointCache('GET', `/templates/${req.params.id}`, 'templates');

    res.json(updated);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete template
router.delete('/:id', setOrganization, requirePermission({ resourceType: 'template', action: 'delete' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user || !req.organizationId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if template exists and user has permission
    const [existing] = await db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    // Only creator or organization admin can delete
    if (existing.createdBy !== req.user.id && existing.organizationId !== req.organizationId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await db
      .delete(workflowTemplates)
      .where(eq(workflowTemplates.id, req.params.id));

    // Invalidate templates cache
    await invalidateEndpointCache('GET', '/templates', 'templates');
    await invalidateEndpointCache('GET', `/templates/${req.params.id}`, 'templates');

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Increment template usage count
router.post('/:id/use', async (req: AuthRequest, res) => {
  try {
    await db
      .update(workflowTemplates)
      .set({
        usageCount: sql`${workflowTemplates.usageCount} + 1`,
      })
      .where(eq(workflowTemplates.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error incrementing template usage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
export { defaultTemplates }; // Export for migration script

