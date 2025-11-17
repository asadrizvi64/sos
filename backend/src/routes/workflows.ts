import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { db } from '../config/database';
import {
  workflows,
  workflowVersions,
  workspaces,
  organizations,
  organizationMembers,
} from '../../drizzle/schema';
import { CreateWorkflowSchema, UpdateWorkflowSchema } from '@sos/shared';
import { eq, desc, and, sql, or, ilike } from 'drizzle-orm';
import { updateWebhookRegistry, updateEmailTriggerRegistry } from '../services/webhookRegistry';
import { getOrCreateDefaultWorkspace } from '../services/workspaceService';
import { auditLogMiddleware } from '../middleware/auditLog';
import { setOrganization } from '../middleware/organization';
import { requirePermission } from '../middleware/permissions';

const router = Router();

// Apply audit logging to all routes
router.use(auditLogMiddleware);

// Get all workflows
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Extract query parameters
    const search = req.query.search as string | undefined;
    const tags = req.query.tags as string | undefined; // Comma-separated tags
    const tagArray = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    // Build where conditions
    const conditions = [eq(organizationMembers.userId, req.user.id)];

    // Search filter (name or description)
    if (search) {
      conditions.push(
        or(
          ilike(workflows.name, `%${search}%`),
          ilike(workflows.description, `%${search}%`)
        )!
      );
    }

    // Tag filter - check if tags array overlaps with any of the requested tags
    if (tagArray.length > 0) {
      conditions.push(
        sql`${workflows.tags} ?| ${sql.raw(`ARRAY[${tagArray.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}]`)}`
      );
    }

    // Get workflows from user's organizations
    const workflowsList = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        workspaceId: workflows.workspaceId,
        definition: workflows.definition,
        active: workflows.active,
        settings: workflows.settings,
        tags: workflows.tags,
        createdAt: workflows.createdAt,
        updatedAt: workflows.updatedAt,
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
        },
      })
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(and(...conditions))
      .orderBy(desc(workflows.updatedAt))
      .limit(limit || 1000); // Default limit to prevent excessive data

    res.json(workflowsList);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get workflow by ID
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get workflow with access check
    const [workflow] = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        workspaceId: workflows.workspaceId,
        definition: workflows.definition,
        active: workflows.active,
        settings: workflows.settings,
        tags: workflows.tags,
        createdAt: workflows.createdAt,
        updatedAt: workflows.updatedAt,
        workspace: {
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
        },
      })
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(workflows.id, req.params.id),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Get workflow versions
    const versions = await db
      .select({
        id: workflowVersions.id,
        version: workflowVersions.version,
        createdAt: workflowVersions.createdAt,
        createdBy: workflowVersions.createdBy,
      })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, req.params.id))
      .orderBy(desc(workflowVersions.version))
      .limit(10);

    res.json({
      ...workflow,
      versions,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create workflow
router.post('/', authenticate, requirePermission({ resourceType: 'workflow', action: 'create' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = CreateWorkflowSchema.parse(req.body);

    // If workspaceId is 'default-workspace' or invalid, get/create default workspace
    let workspaceId = validated.workspaceId;
    if (!workspaceId || workspaceId === 'default-workspace') {
      workspaceId = await getOrCreateDefaultWorkspace(req.user.id);
    }

    // Verify user has access to workspace
    const [workspace] = await db
      .select()
      .from(workspaces)
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(
        organizationMembers,
        eq(organizations.id, organizationMembers.organizationId)
      )
      .where(
        and(
          eq(workspaces.id, workspaceId),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!workspace) {
      res.status(403).json({ error: 'Access denied to workspace' });
      return;
    }

    const [workflow] = await db
      .insert(workflows)
      .values({
        name: validated.name,
        description: validated.description,
        workspaceId: workspaceId,
        definition: validated.definition as any,
        settings: validated.settings as any,
        tags: validated.tags || [],
      })
      .returning();

    // Get organization ID for email triggers
    const [workspaceData] = await db
      .select({ organizationId: organizations.id })
      .from(workspaces)
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    // Update webhook registry if workflow has webhook triggers
    if (validated.definition) {
      await updateWebhookRegistry(workflow.id, validated.definition);
      // Update email trigger registry if workflow has email triggers
      await updateEmailTriggerRegistry(
        workflow.id,
        validated.definition,
        req.user.id,
        workspaceData?.organizationId
      );
    }

    res.status(201).json(workflow);
  } catch (error) {
    console.error('Error creating workflow:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update workflow
router.put('/:id', authenticate, requirePermission({ resourceType: 'workflow', action: 'update' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = UpdateWorkflowSchema.parse(req.body);

    // Check if workflow exists and user has access, and get current definition
    const [existing] = await db
      .select({
        id: workflows.id,
        definition: workflows.definition,
      })
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(workflows.id, req.params.id),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Create version before updating
    const [latestVersion] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, req.params.id))
      .orderBy(desc(workflowVersions.version))
      .limit(1);

    await db.insert(workflowVersions).values({
      workflowId: req.params.id,
      version: (latestVersion?.version || 0) + 1,
      definition: existing.definition as any,
      createdBy: req.user.id,
    });

    // Build update object
    const updateData: any = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.definition) updateData.definition = validated.definition as any;
    if (validated.active !== undefined) updateData.active = validated.active;
    if (validated.settings) updateData.settings = validated.settings as any;
    if (validated.tags !== undefined) updateData.tags = validated.tags;

    const [workflow] = await db
      .update(workflows)
      .set(updateData)
      .where(eq(workflows.id, req.params.id))
      .returning();

    // Get organization ID for email triggers
    const [workspaceData] = await db
      .select({ organizationId: organizations.id })
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .where(eq(workflows.id, req.params.id))
      .limit(1);

    // Update webhook registry if definition changed
    if (validated.definition) {
      await updateWebhookRegistry(req.params.id, validated.definition);
      // Update email trigger registry if workflow has email triggers
      await updateEmailTriggerRegistry(
        req.params.id,
        validated.definition,
        req.user.id,
        workspaceData?.organizationId
      );
    }

    res.json(workflow);
  } catch (error) {
    console.error('Error updating workflow:', error);
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation error', details: error });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete workflow
router.delete('/:id', authenticate, requirePermission({ resourceType: 'workflow', action: 'delete' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if workflow exists and user has access
    const [workflow] = await db
      .select()
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(workflows.id, req.params.id),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    await db.delete(workflows).where(eq(workflows.id, req.params.id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate workflow
router.post('/:id/duplicate', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get original workflow
    const [original] = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        workspaceId: workflows.workspaceId,
        definition: workflows.definition,
        active: workflows.active,
        settings: workflows.settings,
        tags: workflows.tags,
      })
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(workflows.id, req.params.id),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!original) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Create duplicate
    const [duplicate] = await db
      .insert(workflows)
      .values({
        name: `${original.name} (Copy)`,
        description: original.description || undefined,
        workspaceId: original.workspaceId,
        definition: original.definition as any,
        active: false, // Duplicates are inactive by default
        settings: original.settings as any,
        tags: original.tags || [],
      })
      .returning({
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        workspaceId: workflows.workspaceId,
        definition: workflows.definition,
        active: workflows.active,
        settings: workflows.settings,
        createdAt: workflows.createdAt,
        updatedAt: workflows.updatedAt,
      });

    // Update webhook registry if needed
    await updateWebhookRegistry(duplicate.id, duplicate.definition as any);

    res.status(201).json(duplicate);
  } catch (error) {
    console.error('Error duplicating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Restore workflow version
router.post('/:id/versions/:versionId/restore', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Verify user has access to workflow
    const [workflow] = await db
      .select()
      .from(workflows)
      .innerJoin(workspaces, eq(workflows.workspaceId, workspaces.id))
      .innerJoin(organizations, eq(workspaces.organizationId, organizations.id))
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(workflows.id, req.params.id),
          eq(organizationMembers.userId, req.user.id)
        )
      )
      .limit(1);

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Get version to restore
    const [version] = await db
      .select()
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.workflowId, req.params.id),
          eq(workflowVersions.id, req.params.versionId)
        )
      )
      .limit(1);

    if (!version) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // Create new version from current state before restoring
    const [latestVersion] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, req.params.id))
      .orderBy(desc(workflowVersions.version))
      .limit(1);

    const currentWorkflow = workflow as any;
    await db.insert(workflowVersions).values({
      workflowId: req.params.id,
      version: (latestVersion?.version || 0) + 1,
      definition: currentWorkflow.definition as any,
      createdBy: req.user.id,
    });

    // Restore version
    await db
      .update(workflows)
      .set({
        definition: version.definition as any,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, req.params.id));

    // Update webhook registry
    await updateWebhookRegistry(req.params.id, version.definition as any);

    res.json({ success: true, message: 'Version restored' });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
