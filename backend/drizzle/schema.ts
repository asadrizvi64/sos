import { pgTable, text, timestamp, boolean, jsonb, integer, pgEnum, index, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Enums
export const planEnum = pgEnum('plan', ['free', 'pro', 'team', 'enterprise']);
export const roleEnum = pgEnum('role', ['owner', 'admin', 'developer', 'viewer', 'guest', 'member']);
export const executionStatusEnum = pgEnum('execution_status', ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);
export const logLevelEnum = pgEnum('log_level', ['info', 'warn', 'error', 'debug']);
export const osintSourceEnum = pgEnum('osint_source', ['twitter', 'reddit', 'news', 'forums', 'github', 'linkedin', 'youtube', 'web']);
export const osintMonitorStatusEnum = pgEnum('osint_monitor_status', ['active', 'paused', 'error', 'disabled']);

// Users table (Note: Supabase Auth handles authentication, this is for additional user data)
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar: text('avatar'),
  emailVerified: boolean('email_verified').default(false),
  preferences: jsonb('preferences'), // User preferences (theme, notifications, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  organizationMembers: many(organizationMembers),
  apiKeys: many(apiKeys),
  auditLogs: many(auditLogs),
  teamMembers: many(teamMembers),
  sentInvitations: many(invitations),
  connectorCredentials: many(connectorCredentials),
}));

// Organizations
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: planEnum('plan').default('free').notNull(),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  workspaces: many(workspaces),
  apiKeys: many(apiKeys),
  roles: many(roles),
  alerts: many(alerts),
  teams: many(teams),
  invitations: many(invitations),
  osintMonitors: many(osintMonitors),
  osintResults: many(osintResults),
  connectorCredentials: many(connectorCredentials),
}));

// Organization Members
export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: roleEnum('role').default('member').notNull(), // Legacy enum role (for backward compatibility)
  roleId: text('role_id').references(() => roles.id, { onDelete: 'set null' }), // Custom role reference
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  customRole: one(roles, {
    fields: [organizationMembers.roleId],
    references: [roles.id],
  }),
}));

// Workspaces
export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  workflows: many(workflows),
  invitations: many(invitations),
}));

// Workflows
export const workflows = pgTable('workflows', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  definition: jsonb('definition').notNull(),
  active: boolean('active').default(true).notNull(),
  settings: jsonb('settings'),
  tags: jsonb('tags').$type<string[]>().default([]), // Array of tag strings
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [workflows.workspaceId],
    references: [workspaces.id],
  }),
  versions: many(workflowVersions),
  executions: many(workflowExecutions),
  webhooks: many(webhookRegistry),
}));

// Webhook Registry
export const webhookRegistry = pgTable('webhook_registry', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  method: text('method').default('POST').notNull(),
  nodeId: text('node_id').notNull(), // ID of the webhook trigger node
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const webhookRegistryRelations = relations(webhookRegistry, ({ one }) => ({
  workflow: one(workflows, {
    fields: [webhookRegistry.workflowId],
    references: [workflows.id],
  }),
}));

// Workflow Versions
export const workflowVersions = pgTable('workflow_versions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  definition: jsonb('definition').notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workflowVersionsRelations = relations(workflowVersions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowVersions.workflowId],
    references: [workflows.id],
  }),
}));

// Workflow Executions
export const workflowExecutions = pgTable('workflow_executions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  status: executionStatusEnum('status').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  metadata: jsonb('metadata'),
});

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
  logs: many(executionLogs),
  steps: many(executionSteps),
}));

// Execution Steps (for replay functionality)
export const executionSteps = pgTable('execution_steps', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull().references(() => workflowExecutions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  stepNumber: integer('step_number').notNull(),
  status: text('status').notNull(), // 'pending', 'running', 'completed', 'failed', 'skipped'
  input: jsonb('input'),
  output: jsonb('output'),
  error: jsonb('error'),
  startedAt: timestamp('started_at'),
  finishedAt: timestamp('finished_at'),
  executionTime: integer('execution_time'), // milliseconds
  retryAttempt: integer('retry_attempt').default(0),
  parentStepId: text('parent_step_id').references(() => executionSteps.id, { onDelete: 'set null' }), // For nested executions
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(workflowExecutions, {
    fields: [executionSteps.executionId],
    references: [workflowExecutions.id],
  }),
  parentStep: one(executionSteps, {
    fields: [executionSteps.parentStepId],
    references: [executionSteps.id],
  }),
}));

// Execution Logs
export const executionLogs = pgTable('execution_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull().references(() => workflowExecutions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  level: logLevelEnum('level').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
  execution: one(workflowExecutions, {
    fields: [executionLogs.executionId],
    references: [workflowExecutions.id],
  }),
}));

// Connector Credentials
export const connectorCredentials = pgTable('connector_credentials', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  connectorId: text('connector_id').notNull(), // e.g., 'slack', 'airtable', 'google_sheets'
  credentials: jsonb('credentials').notNull(), // Encrypted credentials
  expiresAt: timestamp('expires_at'), // For OAuth tokens
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const connectorCredentialsRelations = relations(connectorCredentials, ({ one }) => ({
  user: one(users, {
    fields: [connectorCredentials.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [connectorCredentials.organizationId],
    references: [organizations.id],
  }),
}));

// Plugins
export const plugins = pgTable('plugins', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull(),
  author: text('author'),
  category: text('category'),
  config: jsonb('config'),
  code: text('code'),
  public: boolean('public').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// API Keys
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  key: text('key').notNull().unique(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  permissions: jsonb('permissions'),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [apiKeys.organizationId],
    references: [organizations.id],
  }),
}));

// Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  organizationId: text('organization_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Alert Types
export const alertTypeEnum = pgEnum('alert_type', ['failure', 'performance', 'usage', 'custom']);
export const alertStatusEnum = pgEnum('alert_status', ['active', 'inactive', 'triggered']);
export const notificationChannelEnum = pgEnum('notification_channel', ['email', 'slack', 'webhook']);

// Alerts
export const alerts = pgTable('alerts', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  type: alertTypeEnum('type').notNull(),
  status: alertStatusEnum('status').default('active').notNull(),
  conditions: jsonb('conditions').notNull(), // Alert conditions (e.g., { threshold: 100, operator: '>' })
  notificationChannels: jsonb('notification_channels').notNull(), // Array of channels with config
  enabled: boolean('enabled').default(true).notNull(),
  cooldownMinutes: integer('cooldown_minutes').default(60), // Prevent spam
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const alertsRelations = relations(alerts, ({ one }) => ({
  organization: one(organizations, {
    fields: [alerts.organizationId],
    references: [organizations.id],
  }),
  workflow: one(workflows, {
    fields: [alerts.workflowId],
    references: [workflows.id],
  }),
}));

// Alert History
export const alertHistory = pgTable('alert_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  alertId: text('alert_id').notNull().references(() => alerts.id, { onDelete: 'cascade' }),
  executionId: text('execution_id').references(() => workflowExecutions.id, { onDelete: 'set null' }),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  message: text('message').notNull(),
  details: jsonb('details'),
  notificationSent: boolean('notification_sent').default(false),
  notificationChannels: jsonb('notification_channels'), // Which channels were notified
});

export const alertHistoryRelations = relations(alertHistory, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertHistory.alertId],
    references: [alerts.id],
  }),
  execution: one(workflowExecutions, {
    fields: [alertHistory.executionId],
    references: [workflowExecutions.id],
  }),
}));

// Roles (Custom roles for organizations)
export const roles = pgTable('roles', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false).notNull(), // System roles cannot be deleted
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
  permissions: many(rolePermissions),
  organizationMembers: many(organizationMembers),
}));

// Permissions (Permission definitions)
export const permissions = pgTable('permissions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  resourceType: text('resource_type').notNull(), // 'workflow', 'workspace', 'organization', 'alert', etc.
  action: text('action').notNull(), // 'read', 'write', 'execute', 'delete', 'admin'
  name: text('name').notNull(),
  description: text('description'),
});

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

// Role Permissions (Many-to-many relationship)
export const rolePermissions = pgTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: { primaryKey: { columns: [table.roleId, table.permissionId] } },
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

// Teams
export const teams = pgTable('teams', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  members: many(teamMembers),
}));

// Team Members
export const teamMembers = pgTable('team_members', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').references(() => roles.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [teamMembers.roleId],
    references: [roles.id],
  }),
}));

// Invitations
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  roleId: text('role_id').references(() => roles.id, { onDelete: 'set null' }),
  invitedBy: text('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  role: one(roles, {
    fields: [invitations.roleId],
    references: [roles.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

// Email Trigger Configurations
export const emailTriggers = pgTable('email_triggers', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // The trigger node ID in the workflow
  provider: text('provider').notNull(), // 'gmail', 'outlook', 'imap'
  email: text('email').notNull(), // Email address being monitored
  credentials: jsonb('credentials').notNull(), // Encrypted OAuth tokens or IMAP credentials
  folder: text('folder').default('INBOX'), // Email folder to monitor (for IMAP)
  lastCheckedAt: timestamp('last_checked_at'),
  lastMessageId: text('last_message_id'), // Last processed message ID
  active: boolean('active').default(true).notNull(),
  pollInterval: integer('poll_interval').default(60).notNull(), // Poll interval in seconds
  filters: jsonb('filters'), // Email filters (from, subject, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailTriggersRelations = relations(emailTriggers, ({ one }) => ({
  user: one(users, {
    fields: [emailTriggers.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [emailTriggers.organizationId],
    references: [organizations.id],
  }),
  workflow: one(workflows, {
    fields: [emailTriggers.workflowId],
    references: [workflows.id],
  }),
}));

// Vector Store Indexes (for RAG)
export const vectorIndexes = pgTable('vector_indexes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Index name (e.g., 'default', 'documents', 'knowledge-base')
  provider: text('provider').notNull().default('memory'), // 'memory', 'pinecone', 'weaviate', 'chroma'
  providerConfig: jsonb('provider_config'), // Provider-specific configuration (API keys, endpoints, etc.)
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Unique index name per organization
  uniqueOrgIndex: { unique: { columns: [table.organizationId, table.name] } },
}));

export const vectorIndexesRelations = relations(vectorIndexes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [vectorIndexes.organizationId],
    references: [organizations.id],
  }),
  documents: many(vectorDocuments),
}));

// Vector Documents (for RAG)
export const vectorDocuments = pgTable('vector_documents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  indexId: text('index_id').notNull().references(() => vectorIndexes.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  text: text('text').notNull(), // Document text content
  embedding: jsonb('embedding').$type<number[]>().notNull(), // Vector embedding (stored as JSONB array)
  metadata: jsonb('metadata'), // Additional metadata (source, title, author, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vectorDocumentsRelations = relations(vectorDocuments, ({ one }) => ({
  index: one(vectorIndexes, {
    fields: [vectorDocuments.indexId],
    references: [vectorIndexes.id],
  }),
  organization: one(organizations, {
    fields: [vectorDocuments.organizationId],
    references: [organizations.id],
  }),
}));

// Workflow Templates
export const workflowTemplates = pgTable('workflow_templates', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'), // 'webhook', 'logic', 'ai', 'schedule', etc.
  definition: jsonb('definition').notNull(), // WorkflowDefinition
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }), // null = public template
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  isPublic: boolean('is_public').default(false).notNull(), // Public templates available to all organizations
  usageCount: integer('usage_count').default(0).notNull(), // Track how many times template was used
  tags: jsonb('tags').$type<string[]>().default([]), // Template tags for categorization
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for public templates
  publicTemplatesIdx: { columns: [table.isPublic, table.category] },
  // Index for organization templates
  orgTemplatesIdx: { columns: [table.organizationId, table.category] },
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [workflowTemplates.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workflowTemplates.createdBy],
    references: [users.id],
  }),
}));

// OSINT Monitors
export const osintMonitors = pgTable('osint_monitors', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  source: osintSourceEnum('source').notNull(),
  status: osintMonitorStatusEnum('status').default('active').notNull(),
  config: jsonb('config').notNull(), // Source-specific configuration (keywords, filters, etc.)
  schedule: jsonb('schedule'), // Polling schedule (interval, timezone, etc.)
  filters: jsonb('filters'), // Content filters (sentiment, language, date range, etc.)
  workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }), // Optional workflow to trigger
  alertId: text('alert_id').references(() => alerts.id, { onDelete: 'set null' }), // Optional alert to trigger
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0).notNull(),
  resultCount: integer('result_count').default(0).notNull(), // Total results collected
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orgIdx: { columns: [table.organizationId, table.status] },
  sourceIdx: { columns: [table.source, table.status] },
  nextRunIdx: { columns: [table.nextRunAt, table.status] },
}));

export const osintMonitorsRelations = relations(osintMonitors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [osintMonitors.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [osintMonitors.workspaceId],
    references: [workspaces.id],
  }),
  workflow: one(workflows, {
    fields: [osintMonitors.workflowId],
    references: [workflows.id],
  }),
  alert: one(alerts, {
    fields: [osintMonitors.alertId],
    references: [alerts.id],
  }),
  results: many(osintResults),
}));

// OSINT Results
export const osintResults = pgTable('osint_results', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  monitorId: text('monitor_id').notNull().references(() => osintMonitors.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  source: osintSourceEnum('source').notNull(),
  sourceId: text('source_id').notNull(), // Unique ID from the source (e.g., tweet ID, Reddit post ID)
  title: text('title'),
  content: text('content').notNull(), // Main content text
  url: text('url'), // Source URL
  author: text('author'), // Author username/name
  authorUrl: text('author_url'), // Author profile URL
  publishedAt: timestamp('published_at').notNull(), // When the content was published
  collectedAt: timestamp('collected_at').defaultNow().notNull(), // When we collected it
  metadata: jsonb('metadata'), // Additional source-specific metadata (likes, retweets, comments, etc.)
  sentiment: text('sentiment'), // 'positive', 'negative', 'neutral' (if analyzed)
  sentimentScore: integer('sentiment_score'), // -100 to 100
  tags: jsonb('tags').$type<string[]>().default([]), // Extracted tags/keywords
  processed: boolean('processed').default(false).notNull(), // Whether this result has been processed by workflow/alert
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  monitorIdx: { columns: [table.monitorId, table.publishedAt] },
  sourceIdx: { columns: [table.source, table.sourceId] },
  orgIdx: { columns: [table.organizationId, table.collectedAt] },
  unprocessedIdx: { columns: [table.processed, table.collectedAt] },
}));

export const osintResultsRelations = relations(osintResults, ({ one }) => ({
  monitor: one(osintMonitors, {
    fields: [osintResults.monitorId],
    references: [osintMonitors.id],
  }),
  organization: one(organizations, {
    fields: [osintResults.organizationId],
    references: [organizations.id],
  }),
}));

// Early Access Signups
export const earlyAccessSignups = pgTable('early_access_signups', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  status: text('status').default('pending').notNull(), // 'pending', 'contacted', 'approved', 'rejected'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Contact Submissions
export const contactSubmissions = pgTable('contact_submissions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').default('new').notNull(), // 'new', 'read', 'replied', 'archived'
  repliedAt: timestamp('replied_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Event Logs (Phase 2: Observability)
export const eventLogs = pgTable('event_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // e.g., 'workflow_executed', 'connector_used', 'tool_executed'
  context: jsonb('context'), // Additional event context
  status: text('status').notNull(), // 'success', 'error', 'pending'
  latencyMs: integer('latency_ms'), // Execution latency in milliseconds
  traceId: text('trace_id'), // OpenTelemetry trace ID
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('event_logs_user_id_idx').on(table.userId),
  workspaceIdIdx: index('event_logs_workspace_id_idx').on(table.workspaceId),
  eventTypeIdx: index('event_logs_event_type_idx').on(table.eventType),
  traceIdIdx: index('event_logs_trace_id_idx').on(table.traceId),
  timestampIdx: index('event_logs_timestamp_idx').on(table.timestamp),
}));

// Agent Trace History (Phase 2: Observability)
export const agentTraceHistory = pgTable('agent_trace_history', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  agentId: text('agent_id').notNull(), // Reference to agent/workflow
  flowId: text('flow_id'), // Reference to workflow execution
  traceId: text('trace_id').notNull(), // OpenTelemetry trace ID
  inputContext: jsonb('input_context'), // Input data for the agent
  executionNodes: jsonb('execution_nodes'), // Array of executed nodes
  outputSummary: jsonb('output_summary'), // Summary of output
  error: text('error'), // Error message if failed
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (table) => ({
  agentIdIdx: index('agent_trace_history_agent_id_idx').on(table.agentId),
  flowIdIdx: index('agent_trace_history_flow_id_idx').on(table.flowId),
  traceIdIdx: index('agent_trace_history_trace_id_idx').on(table.traceId),
  timestampIdx: index('agent_trace_history_timestamp_idx').on(table.timestamp),
}));

// Model Cost Logs (Phase 2: Observability)
export const modelCostLogs = pgTable('model_cost_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => codeAgents.id, { onDelete: 'set null' }), // Reference to code agent
  workflowExecutionId: text('workflow_execution_id').references(() => workflowExecutions.id, { onDelete: 'set null' }), // Reference to workflow execution
  nodeId: text('node_id'), // Node ID in workflow
  modelName: text('model_name').notNull(), // e.g., 'gpt-4', 'claude-3-opus'
  provider: text('provider').notNull(), // Provider (e.g., 'openai', 'anthropic', 'google')
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  tokensTotal: integer('tokens_total'), // Total tokens (input + output)
  ratePer1k: integer('rate_per_1k'), // Rate per 1k tokens in cents (optional, for historical data)
  costUsd: integer('cost_usd').notNull(), // Cost in cents (for precision)
  usdCost: decimal('usd_cost', { precision: 10, scale: 6 }), // Cost in USD (decimal for precision)
  prompt: text('prompt'), // Prompt text (optional, can be truncated)
  response: text('response'), // Response text (optional, can be truncated)
  traceId: text('trace_id'), // OpenTelemetry trace ID
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(), // Alias for timestamp for consistency
}, (table) => ({
  userIdIdx: index('model_cost_logs_user_id_idx').on(table.userId),
  agentIdIdx: index('model_cost_logs_agent_id_idx').on(table.agentId),
  workflowExecutionIdIdx: index('model_cost_logs_workflow_execution_id_idx').on(table.workflowExecutionId),
  nodeIdIdx: index('model_cost_logs_node_id_idx').on(table.nodeId),
  modelNameIdx: index('model_cost_logs_model_name_idx').on(table.modelName),
  providerIdx: index('model_cost_logs_provider_idx').on(table.provider),
  traceIdIdx: index('model_cost_logs_trace_id_idx').on(table.traceId),
  organizationIdIdx: index('model_cost_logs_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('model_cost_logs_workspace_id_idx').on(table.workspaceId),
  timestampIdx: index('model_cost_logs_timestamp_idx').on(table.timestamp),
  createdAtIdx: index('model_cost_logs_created_at_idx').on(table.createdAt),
}));

// Prompt Similarity Logs (Phase 2: Observability)
export const promptSimilarityLogs = pgTable('prompt_similarity_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').references(() => codeAgents.id, { onDelete: 'set null' }), // Reference to code agent
  workflowExecutionId: text('workflow_execution_id').references(() => workflowExecutions.id, { onDelete: 'set null' }), // Reference to workflow execution
  nodeId: text('node_id'), // Node ID in workflow
  prompt: text('prompt').notNull(), // The prompt being checked
  promptEmbedding: jsonb('prompt_embedding'), // Embedding vector for the prompt
  similarityScore: decimal('similarity_score', { precision: 5, scale: 4 }).notNull(), // Similarity score (0.0-1.0, cosine similarity)
  similarityScorePercent: integer('similarity_score_percent'), // Similarity score as percentage (0-100) for backward compatibility
  flaggedReference: text('flagged_reference'), // Reference to flagged content (ID or hash)
  flaggedContent: text('flagged_content'), // The flagged content that matched
  flaggedContentEmbedding: jsonb('flagged_content_embedding'), // Embedding vector for flagged content
  actionTaken: text('action_taken').notNull(), // 'blocked', 'allowed', 'flagged', 'warned'
  threshold: decimal('threshold', { precision: 5, scale: 4 }), // Threshold used for comparison
  method: text('method').notNull(), // 'cosine', 'euclidean', 'dot_product', 'manhattan'
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  traceId: text('trace_id'), // OpenTelemetry trace ID
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(), // Alias for timestamp for consistency
}, (table) => ({
  userIdIdx: index('prompt_similarity_logs_user_id_idx').on(table.userId),
  agentIdIdx: index('prompt_similarity_logs_agent_id_idx').on(table.agentId),
  workflowExecutionIdIdx: index('prompt_similarity_logs_workflow_execution_id_idx').on(table.workflowExecutionId),
  nodeIdIdx: index('prompt_similarity_logs_node_id_idx').on(table.nodeId),
  similarityScoreIdx: index('prompt_similarity_logs_similarity_score_idx').on(table.similarityScore),
  actionTakenIdx: index('prompt_similarity_logs_action_taken_idx').on(table.actionTaken),
  methodIdx: index('prompt_similarity_logs_method_idx').on(table.method),
  organizationIdIdx: index('prompt_similarity_logs_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('prompt_similarity_logs_workspace_id_idx').on(table.workspaceId),
  traceIdIdx: index('prompt_similarity_logs_trace_id_idx').on(table.traceId),
  timestampIdx: index('prompt_similarity_logs_timestamp_idx').on(table.timestamp),
  createdAtIdx: index('prompt_similarity_logs_created_at_idx').on(table.createdAt),
}));

export const promptSimilarityLogsRelations = relations(promptSimilarityLogs, ({ one }) => ({
  agent: one(codeAgents, {
    fields: [promptSimilarityLogs.agentId],
    references: [codeAgents.id],
  }),
  workflowExecution: one(workflowExecutions, {
    fields: [promptSimilarityLogs.workflowExecutionId],
    references: [workflowExecutions.id],
  }),
  organization: one(organizations, {
    fields: [promptSimilarityLogs.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [promptSimilarityLogs.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [promptSimilarityLogs.userId],
    references: [users.id],
  }),
}));

// Feature Flags (Phase 2: Observability)
export const featureFlags = pgTable('feature_flags', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  flagName: text('flag_name').notNull(),
  isEnabled: boolean('is_enabled').default(false).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  flagNameIdx: index('feature_flags_flag_name_idx').on(table.flagName),
  userIdIdx: index('feature_flags_user_id_idx').on(table.userId),
  workspaceIdIdx: index('feature_flags_workspace_id_idx').on(table.workspaceId),
}));

// Scraper Events (Phase 1: Web Scraping)
export const scraperEvents = pgTable('scraper_events', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  engine: text('engine').notNull(), // 'cheerio', 'puppeteer', 'playwright', etc.
  success: boolean('success').notNull(),
  latencyMs: integer('latency_ms'), // Request latency in milliseconds
  contentLength: integer('content_length'), // HTML content length
  errorMessage: text('error_message'), // Error message if failed
  metadata: jsonb('metadata'), // Additional metadata (selectors used, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index('scraper_events_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('scraper_events_workspace_id_idx').on(table.workspaceId),
  userIdIdx: index('scraper_events_user_id_idx').on(table.userId),
  urlIdx: index('scraper_events_url_idx').on(table.url),
  engineIdx: index('scraper_events_engine_idx').on(table.engine),
  successIdx: index('scraper_events_success_idx').on(table.success),
  createdAtIdx: index('scraper_events_created_at_idx').on(table.createdAt),
}));

// Proxy Pools (Phase 4: Proxy Infrastructure)
export const proxyPools = pgTable('proxy_pools', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Pool name
  type: text('type').notNull(), // 'residential', 'datacenter', 'mobile', 'isp'
  provider: text('provider'), // 'brightdata', 'oxylabs', 'custom', etc.
  host: text('host').notNull(), // Proxy host
  port: integer('port').notNull(), // Proxy port
  username: text('username'), // Proxy username (if required)
  password: text('password'), // Proxy password (if required)
  country: text('country'), // Country code (ISO 3166-1 alpha-2)
  city: text('city'), // City name
  isActive: boolean('is_active').default(true).notNull(),
  maxConcurrent: integer('max_concurrent').default(10), // Max concurrent connections
  metadata: jsonb('metadata'), // Additional metadata (provider-specific)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index('proxy_pools_organization_id_idx').on(table.organizationId),
  typeIdx: index('proxy_pools_type_idx').on(table.type),
  countryIdx: index('proxy_pools_country_idx').on(table.country),
  isActiveIdx: index('proxy_pools_is_active_idx').on(table.isActive),
  createdAtIdx: index('proxy_pools_created_at_idx').on(table.createdAt),
}));

// Proxy Logs (Phase 4: Proxy Infrastructure)
export const proxyLogs = pgTable('proxy_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  proxyId: text('proxy_id').notNull().references(() => proxyPools.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // URL that was accessed
  status: text('status').notNull(), // 'success', 'failed', 'banned', 'timeout'
  statusCode: integer('status_code'), // HTTP status code
  latencyMs: integer('latency_ms'), // Request latency in milliseconds
  banReason: text('ban_reason'), // Reason for ban (if banned)
  errorMessage: text('error_message'), // Error message (if failed)
  metadata: jsonb('metadata'), // Additional metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  proxyIdIdx: index('proxy_logs_proxy_id_idx').on(table.proxyId),
  organizationIdIdx: index('proxy_logs_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('proxy_logs_workspace_id_idx').on(table.workspaceId),
  userIdIdx: index('proxy_logs_user_id_idx').on(table.userId),
  statusIdx: index('proxy_logs_status_idx').on(table.status),
  createdAtIdx: index('proxy_logs_created_at_idx').on(table.createdAt),
}));

// Proxy Scores (Phase 4: Proxy Infrastructure)
export const proxyScores = pgTable('proxy_scores', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  proxyId: text('proxy_id').notNull().references(() => proxyPools.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(), // Overall score (0-100)
  successRate: integer('success_rate').notNull(), // Success rate (0-100)
  avgLatencyMs: integer('avg_latency_ms'), // Average latency in milliseconds
  banRate: integer('ban_rate').notNull(), // Ban rate (0-100)
  totalRequests: integer('total_requests').default(0).notNull(),
  successfulRequests: integer('successful_requests').default(0).notNull(),
  failedRequests: integer('failed_requests').default(0).notNull(),
  bannedRequests: integer('banned_requests').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'), // Last time proxy was used
  lastScoredAt: timestamp('last_scored_at').defaultNow().notNull(), // Last time score was calculated
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  proxyIdIdx: index('proxy_scores_proxy_id_idx').on(table.proxyId),
  organizationIdIdx: index('proxy_scores_organization_id_idx').on(table.organizationId),
  scoreIdx: index('proxy_scores_score_idx').on(table.score),
  lastScoredAtIdx: index('proxy_scores_last_scored_at_idx').on(table.lastScoredAt),
}));

// Scraper Selectors (Phase 5: Self-Healing & Change Detection)
export const scraperSelectors = pgTable('scraper_selectors', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // URL pattern or exact URL
  fieldName: text('field_name').notNull(), // Field name for the selector
  selector: text('selector').notNull(), // CSS selector or XPath
  selectorType: text('selector_type').notNull().default('css'), // 'css' or 'xpath'
  successCount: integer('success_count').default(0).notNull(), // Number of successful extractions
  failureCount: integer('failure_count').default(0).notNull(), // Number of failed extractions
  lastSuccessAt: timestamp('last_success_at'), // Last successful extraction
  lastFailureAt: timestamp('last_failure_at'), // Last failed extraction
  isActive: boolean('is_active').default(true).notNull(), // Whether selector is currently active
  metadata: jsonb('metadata'), // Additional metadata (alternative selectors, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index('scraper_selectors_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('scraper_selectors_workspace_id_idx').on(table.workspaceId),
  urlIdx: index('scraper_selectors_url_idx').on(table.url),
  fieldNameIdx: index('scraper_selectors_field_name_idx').on(table.fieldName),
  isActiveIdx: index('scraper_selectors_is_active_idx').on(table.isActive),
  createdAtIdx: index('scraper_selectors_created_at_idx').on(table.createdAt),
}));

// Change Detection (Phase 5: Self-Healing & Change Detection)
export const changeDetection = pgTable('change_detection', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(), // URL being monitored
  selector: text('selector'), // CSS selector to monitor (optional)
  previousContent: text('previous_content'), // Previous HTML/content snapshot
  previousHash: text('previous_hash'), // Hash of previous content
  currentContent: text('current_content'), // Current HTML/content snapshot
  currentHash: text('current_hash'), // Hash of current content
  changeDetected: boolean('change_detected').default(false).notNull(), // Whether change was detected
  changeType: text('change_type'), // 'added', 'removed', 'modified', 'structure'
  changeDetails: jsonb('change_details'), // Details about the change
  lastCheckedAt: timestamp('last_checked_at').defaultNow().notNull(), // Last time change was checked
  lastChangedAt: timestamp('last_changed_at'), // Last time change was detected
  isActive: boolean('is_active').default(true).notNull(), // Whether monitoring is active
  checkInterval: integer('check_interval').default(3600), // Check interval in seconds
  metadata: jsonb('metadata'), // Additional metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index('change_detection_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('change_detection_workspace_id_idx').on(table.workspaceId),
  userIdIdx: index('change_detection_user_id_idx').on(table.userId),
  urlIdx: index('change_detection_url_idx').on(table.url),
  changeDetectedIdx: index('change_detection_change_detected_idx').on(table.changeDetected),
  isActiveIdx: index('change_detection_is_active_idx').on(table.isActive),
  lastCheckedAtIdx: index('change_detection_last_checked_at_idx').on(table.lastCheckedAt),
}));

// Code Agents (Custom Code & Code Agents PRD)
export const codeAgents = pgTable('code_agents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  language: text('language').notNull(), // 'javascript' | 'python' | 'typescript' | 'bash'
  code: text('code').notNull(),
  codeStoragePath: text('code_storage_path'), // Supabase Storage path for large code blobs
  inputSchema: jsonb('input_schema'), // Zod/Pydantic schema
  outputSchema: jsonb('output_schema'), // Zod/Pydantic schema
  runtime: text('runtime').notNull().default('vm2'), // 'vm2' | 'e2b' | 'wasmedge' | 'bacalhau' | 'subprocess'
  packages: jsonb('packages').$type<string[]>(), // Python packages or npm packages
  environment: jsonb('environment').$type<Record<string, string>>(), // Environment variables
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  isPublic: boolean('is_public').default(false).notNull(), // Whether agent is public in registry
  usageCount: integer('usage_count').default(0).notNull(), // Number of times used
  deprecated: boolean('deprecated').default(false).notNull(), // Whether agent is deprecated
  changelog: jsonb('changelog').$type<Array<{ version: string; changes: string; date: string }>>(), // Version changelog
  metadata: jsonb('metadata'), // Additional metadata (owner, license, scope, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  organizationIdIdx: index('code_agents_organization_id_idx').on(table.organizationId),
  workspaceIdIdx: index('code_agents_workspace_id_idx').on(table.workspaceId),
  userIdIdx: index('code_agents_user_id_idx').on(table.userId),
  nameIdx: index('code_agents_name_idx').on(table.name),
  languageIdx: index('code_agents_language_idx').on(table.language),
  isPublicIdx: index('code_agents_is_public_idx').on(table.isPublic),
  deprecatedIdx: index('code_agents_deprecated_idx').on(table.deprecated),
  createdAtIdx: index('code_agents_created_at_idx').on(table.createdAt),
}));

// Code Agent Versions
export const codeAgentVersions = pgTable('code_agent_versions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  codeAgentId: text('code_agent_id').notNull().references(() => codeAgents.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  code: text('code').notNull(),
  codeStoragePath: text('code_storage_path'),
  inputSchema: jsonb('input_schema'),
  outputSchema: jsonb('output_schema'),
  changelog: jsonb('changelog').$type<Array<{ version: string; changes: string; date: string }>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  codeAgentIdIdx: index('code_agent_versions_code_agent_id_idx').on(table.codeAgentId),
  versionIdx: index('code_agent_versions_version_idx').on(table.version),
  createdAtIdx: index('code_agent_versions_created_at_idx').on(table.createdAt),
}));

// Code Execution Logs
export const codeExecLogs = pgTable('code_exec_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  codeAgentId: text('code_agent_id').references(() => codeAgents.id, { onDelete: 'set null' }),
  workflowExecutionId: text('workflow_execution_id').references(() => workflowExecutions.id, { onDelete: 'set null' }),
  nodeId: text('node_id'), // Node ID in workflow
  runtime: text('runtime').notNull(), // 'vm2' | 'e2b' | 'wasmedge' | 'bacalhau' | 'subprocess'
  language: text('language').notNull(), // 'javascript' | 'python' | 'typescript' | 'bash'
  durationMs: integer('duration_ms'), // Execution duration in milliseconds
  memoryMb: integer('memory_mb'), // Memory usage in MB
  exitCode: integer('exit_code'), // Exit code (0 for success)
  success: boolean('success').notNull(), // Whether execution was successful
  errorMessage: text('error_message'), // Error message if failed
  tokensUsed: integer('tokens_used'), // Tokens used for AI-assisted code (if applicable)
  validationPassed: boolean('validation_passed'), // Whether schema validation passed
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  codeAgentIdIdx: index('code_exec_logs_code_agent_id_idx').on(table.codeAgentId),
  workflowExecutionIdIdx: index('code_exec_logs_workflow_execution_id_idx').on(table.workflowExecutionId),
  runtimeIdx: index('code_exec_logs_runtime_idx').on(table.runtime),
  languageIdx: index('code_exec_logs_language_idx').on(table.language),
  successIdx: index('code_exec_logs_success_idx').on(table.success),
  createdAtIdx: index('code_exec_logs_created_at_idx').on(table.createdAt),
}));

// Code Schemas (for validation)
export const codeSchemas = pgTable('code_schemas', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  codeId: text('code_id').notNull(), // References code_agents.id or workflow node ID
  codeType: text('code_type').notNull(), // 'code_agent' | 'workflow_node'
  inputSchema: jsonb('input_schema'), // Zod/Pydantic schema JSON
  outputSchema: jsonb('output_schema'), // Zod/Pydantic schema JSON
  validationType: text('validation_type').notNull(), // 'zod' | 'pydantic'
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  codeIdIdx: index('code_schemas_code_id_idx').on(table.codeId),
  codeTypeIdx: index('code_schemas_code_type_idx').on(table.codeType),
  validationTypeIdx: index('code_schemas_validation_type_idx').on(table.validationType),
  createdAtIdx: index('code_schemas_created_at_idx').on(table.createdAt),
}));

