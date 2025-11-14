// Query keys for React Query - centralized for consistency
export const queryKeys = {
  // Agent frameworks
  agentFrameworks: {
    all: ['agentFrameworks'] as const,
    detail: (id: string) => ['agentFrameworks', id] as const,
  },
  // Observability
  observability: {
    system: (range: string) => ['observability', 'system', range] as const,
    errors: (range: string) => ['observability', 'errors', range] as const,
  },
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
  },
  workflows: {
    all: ['workflows'] as const,
    detail: (id: string) => ['workflows', id] as const,
    executions: (workflowId: string) => ['workflows', workflowId, 'executions'] as const,
  },
  analytics: {
    workflows: (startDate: string, endDate: string) => ['analytics', 'workflows', startDate, endDate] as const,
    nodes: (startDate: string, endDate: string) => ['analytics', 'nodes', startDate, endDate] as const,
    costs: (startDate: string, endDate: string) => ['analytics', 'costs', startDate, endDate] as const,
    errors: (startDate: string, endDate: string) => ['analytics', 'errors', startDate, endDate] as const,
    usage: (startDate: string, endDate: string) => ['analytics', 'usage', startDate, endDate] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    detail: (id: string) => ['alerts', id] as const,
    history: (id: string) => ['alerts', id, 'history'] as const,
  },
  roles: {
    all: ['roles'] as const,
    detail: (id: string) => ['roles', id] as const,
    permissions: ['roles', 'permissions'] as const,
  },
  teams: {
    all: ['teams'] as const,
    detail: (id: string) => ['teams', id] as const,
  },
  invitations: {
    all: ['invitations'] as const,
    byToken: (token: string) => ['invitations', 'token', token] as const,
  },
  templates: {
    all: ['templates'] as const,
    detail: (id: string) => ['templates', id] as const,
  },
  users: {
    me: ['users', 'me'] as const,
    activity: (filters?: string) => ['users', 'me', 'activity', filters] as const,
  },
  apiKeys: {
    all: ['api-keys'] as const,
    detail: (id: string) => ['api-keys', id] as const,
    usage: (id: string) => ['api-keys', id, 'usage'] as const,
  },
  auditLogs: {
    all: (filters?: string) => ['audit-logs', filters] as const,
    detail: (id: string) => ['audit-logs', id] as const,
  },
  emailTriggerMonitoring: {
    health: ['email-trigger-monitoring', 'health'] as const,
    healthAll: ['email-trigger-monitoring', 'health', 'all'] as const,
    healthDetail: (triggerId: string) => ['email-trigger-monitoring', 'health', triggerId] as const,
    metrics: ['email-trigger-monitoring', 'metrics'] as const,
    alerts: (filters?: string) => ['email-trigger-monitoring', 'alerts', filters] as const,
  },
  performanceMonitoring: {
    all: ['performance-monitoring'] as const,
    system: ['performance-monitoring', 'system'] as const,
    endpoint: (method: string, endpoint: string) => ['performance-monitoring', 'endpoint', method, endpoint] as const,
    slowest: (limit?: number) => ['performance-monitoring', 'slowest', limit] as const,
    mostRequested: (limit?: number) => ['performance-monitoring', 'most-requested', limit] as const,
    cache: ['performance-monitoring', 'cache'] as const,
  },
  osint: {
    monitors: ['osint', 'monitors'] as const,
    monitor: (id: string) => ['osint', 'monitors', id] as const,
    results: (monitorId?: string) => monitorId ? ['osint', 'results', monitorId] as const : ['osint', 'results'] as const,
    stats: ['osint', 'stats'] as const,
  },
  policies: {
    all: (workspaceId?: string) => workspaceId ? ['policies', workspaceId] as const : ['policies'] as const,
    detail: (id: string) => ['policies', id] as const,
  },
};

