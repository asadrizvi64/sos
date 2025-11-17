import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { setOrganization } from '../middleware/organization';
import { requirePermission } from '../middleware/permissions';
import { db } from '../config/database';
import { apiKeys, organizations, organizationMembers, auditLogs } from '../../drizzle/schema';
import { eq, and, desc, count, gte } from 'drizzle-orm';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import crypto from 'crypto';
import { auditLogMiddleware } from '../middleware/auditLog';

const router = Router();

// Apply middleware
router.use(authenticate);
router.use(setOrganization);
router.use(auditLogMiddleware);

// Create API key schema
const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
  organizationId: z.string().optional(),
});

// Update API key schema
const UpdateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Generate API key
function generateApiKey(): string {
  // Generate a secure random key
  const prefix = 'sos_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}${randomBytes}`;
}

// Get all API keys for current user
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user's organization IDs
    const userOrgs = await db
      .select({
        organizationId: organizationMembers.organizationId,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, req.user.id));

    const orgIds = userOrgs.map((org) => org.organizationId);

    // Get API keys for user or user's organizations
    // First get user's personal keys
    const userKeys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key: apiKeys.key, // Note: In production, you might want to mask this
        userId: apiKeys.userId,
        organizationId: apiKeys.organizationId,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, req.user.id))
      .orderBy(desc(apiKeys.createdAt));

    // Get organization keys if user has organizations
    let orgKeys: typeof userKeys = [];
    if (orgIds.length > 0) {
      // Get keys for each organization (drizzle doesn't support IN easily, so we'll query separately)
      const orgKeysPromises = orgIds.map((orgId) =>
        db
          .select({
            id: apiKeys.id,
            name: apiKeys.name,
            key: apiKeys.key,
            userId: apiKeys.userId,
            organizationId: apiKeys.organizationId,
            permissions: apiKeys.permissions,
            lastUsedAt: apiKeys.lastUsedAt,
            expiresAt: apiKeys.expiresAt,
            createdAt: apiKeys.createdAt,
            updatedAt: apiKeys.updatedAt,
          })
          .from(apiKeys)
          .where(eq(apiKeys.organizationId, orgId))
      );
      const orgKeysResults = await Promise.all(orgKeysPromises);
      orgKeys = orgKeysResults.flat();
    }

    // Combine and deduplicate
    const allKeys = [...userKeys, ...orgKeys];
    const uniqueKeys = Array.from(
      new Map(allKeys.map((key) => [key.id, key])).values()
    );

    res.json(uniqueKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get API key by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1);

    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    // Check access
    if (key.userId !== req.user.id) {
      // Check if user has access via organization
      const [member] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, req.user.id),
            eq(organizationMembers.organizationId, key.organizationId || '')
          )
        )
        .limit(1);

      if (!member) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json(key);
  } catch (error) {
    console.error('Error fetching API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create API key
router.post('/', requirePermission({ resourceType: 'api_key', action: 'create' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = CreateApiKeySchema.parse(req.body);

    // Verify organization access if provided
    if (validated.organizationId) {
      const [member] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, req.user.id),
            eq(organizationMembers.organizationId, validated.organizationId)
          )
        )
        .limit(1);

      if (!member) {
        res.status(403).json({ error: 'Access denied to organization' });
        return;
      }
    }

    const apiKey = generateApiKey();
    const expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null;

    const [newKey] = await db
      .insert(apiKeys)
      .values({
        name: validated.name,
        key: apiKey,
        userId: req.user.id,
        organizationId: validated.organizationId || null,
        permissions: validated.permissions || null,
        expiresAt: expiresAt,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        key: apiKeys.key, // Return full key only on creation
        userId: apiKeys.userId,
        organizationId: apiKeys.organizationId,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });

    res.status(201).json(newKey);
  } catch (error) {
    console.error('Error creating API key:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update API key
router.put('/:id', requirePermission({ resourceType: 'api_key', action: 'update' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validated = UpdateApiKeySchema.parse(req.body);

    // Check access
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    if (existing.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (validated.name !== undefined) {
      updateData.name = validated.name;
    }

    if (validated.permissions !== undefined) {
      updateData.permissions = validated.permissions;
    }

    if (validated.expiresAt !== undefined) {
      updateData.expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null;
    }

    const [updated] = await db
      .update(apiKeys)
      .set(updateData)
      .where(eq(apiKeys.id, req.params.id))
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        key: apiKeys.key,
        userId: apiKeys.userId,
        organizationId: apiKeys.organizationId,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });

    res.json(updated);
  } catch (error) {
    console.error('Error updating API key:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete API key
router.delete('/:id', requirePermission({ resourceType: 'api_key', action: 'delete' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check access
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    if (existing.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await db.delete(apiKeys).where(eq(apiKeys.id, req.params.id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rotate API key (generate new key)
router.post('/:id/rotate', requirePermission({ resourceType: 'api_key', action: 'update' }), async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check access
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    if (existing.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const newKey = generateApiKey();

    const [rotated] = await db
      .update(apiKeys)
      .set({
        key: newKey,
        updatedAt: new Date(),
      })
      .where(eq(apiKeys.id, req.params.id))
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        key: apiKeys.key, // Return new key
        userId: apiKeys.userId,
        organizationId: apiKeys.organizationId,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        updatedAt: apiKeys.updatedAt,
      });

    res.json(rotated);
  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get API key usage statistics
router.get('/:id/usage', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check access
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, req.params.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    if (existing.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get usage from audit logs (filtered by API key usage)
    // Calculate date ranges
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get total requests (from audit logs where API key was used)
    // Note: This tracks API key actions in audit logs
    // Filter by resourceType = 'api_key' and resourceId matching this key
    const [totalCount] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceType, 'api_key'),
          eq(auditLogs.resourceId, req.params.id)
        )
      );
    
    const [last7DaysCount] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceType, 'api_key'),
          eq(auditLogs.resourceId, req.params.id),
          gte(auditLogs.createdAt, sevenDaysAgo)
        )
      );
    
    const [last30DaysCount] = await db
      .select({ count: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.resourceType, 'api_key'),
          eq(auditLogs.resourceId, req.params.id),
          gte(auditLogs.createdAt, thirtyDaysAgo)
        )
      );

    const usage = {
      lastUsedAt: existing.lastUsedAt,
      createdAt: existing.createdAt,
      totalRequests: totalCount?.count || 0,
      last7Days: last7DaysCount?.count || 0,
      last30Days: last30DaysCount?.count || 0,
    };

    res.json(usage);
  } catch (error) {
    console.error('Error fetching API key usage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

