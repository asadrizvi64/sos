import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  timeWindow?: number;
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook';
  config: {
    email?: string;
    slackWebhookUrl?: string;
    webhookUrl?: string;
  };
}

interface Alert {
  id: string;
  workflowId?: string;
  name: string;
  description?: string;
  type: 'failure' | 'performance' | 'usage' | 'custom';
  status: 'active' | 'inactive' | 'triggered';
  conditions: AlertCondition[];
  notificationChannels: NotificationChannel[];
  enabled: boolean;
  cooldownMinutes?: number;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AlertHistory {
  id: string;
  alertId: string;
  executionId?: string;
  triggeredAt: string;
  message: string;
  details?: Record<string, unknown>;
  notificationSent: boolean;
  notificationChannels?: string[];
}

export default function Alerts() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [alertDetail, setAlertDetail] = useState<Alert | null>(null);

  const { data: alerts = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.alerts.all,
    queryFn: async () => {
      const response = await api.get('/alerts');
      return response.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ alertId, enabled }: { alertId: string; enabled: boolean }) => {
      await api.patch(`/alerts/${alertId}/toggle`, { enabled: !enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onError: (error) => {
      console.error('Failed to toggle alert:', error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await api.delete(`/alerts/${alertId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onError: (error) => {
      console.error('Failed to delete alert:', error);
    },
  });

  const handleToggle = (alertId: string, enabled: boolean) => {
    toggleMutation.mutate({ alertId, enabled });
  };

  const handleDelete = (alertId: string) => {
    if (!confirm('Are you sure you want to delete this alert?')) return;
    deleteMutation.mutate(alertId);
  };

  const loadHistory = async (alertId: string) => {
    try {
      const response = await api.get(`/alerts/${alertId}/history`);
      setAlertHistory(response.data);
      setShowHistory(true);
    } catch (error) {
      console.error('Failed to load alert history:', error);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'failure':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'performance':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
      case 'usage':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
            Alerts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Configure alerts for workflow failures, performance, and usage</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
        >
          + Create Alert
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="ml-3 text-gray-600 dark:text-gray-400">Loading alerts...</p>
          </div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">No alerts configured</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            Create Your First Alert
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert, index) => (
            <div 
              key={alert.id} 
              className="group relative overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-lg hover:border-indigo-300/50 dark:hover:border-indigo-500/50 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{alert.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(alert.type)}`}>
                      {alert.type}
                    </span>
                    {alert.enabled ? (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  {alert.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{alert.description}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={async () => {
                      try {
                        const response = await api.get(`/alerts/${alert.id}`);
                        setAlertDetail(response.data);
                        setShowDetail(true);
                      } catch (error) {
                        console.error('Failed to load alert details:', error);
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors duration-200 font-medium"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => loadHistory(alert.id)}
                    className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200 font-medium"
                  >
                    History
                  </button>
                  <button
                    onClick={() => handleToggle(alert.id, alert.enabled)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 font-medium ${
                      alert.enabled
                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                        : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    }`}
                  >
                    {alert.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="px-3 py-1.5 text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors duration-200 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">Conditions</h4>
                  <div className="space-y-1.5">
                    {alert.conditions.map((condition, idx) => (
                      <div key={idx} className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {condition.metric} {condition.operator} {condition.threshold}
                        {condition.timeWindow && ` (within ${condition.timeWindow} minutes)`}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">Notification Channels</h4>
                  <div className="space-y-1.5">
                    {alert.notificationChannels.map((channel, idx) => (
                      <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">{channel.type}:</span>{' '}
                        {channel.config.email ||
                          channel.config.slackWebhookUrl ||
                          channel.config.webhookUrl ||
                          'Not configured'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {alert.lastTriggeredAt && (
                <div className="text-xs text-gray-500">
                  Last triggered: {new Date(alert.lastTriggeredAt).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CreateAlertModal
          alert={selectedAlert}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedAlert(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setSelectedAlert(null);
            queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
          }}
        />
      )}

      {/* Alert Detail Modal */}
      {showDetail && alertDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alert Details</h2>
                <button
                  onClick={() => {
                    setShowDetail(false);
                    setAlertDetail(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Name</h3>
                <p className="text-gray-900 dark:text-gray-100 text-lg">{alertDetail.name}</p>
              </div>
              {alertDetail.description && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
                  <p className="text-gray-700 dark:text-gray-300">{alertDetail.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Type</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTypeColor(alertDetail.type)}`}>
                    {alertDetail.type}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Status</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    alertDetail.enabled 
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                  }`}>
                    {alertDetail.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {alertDetail.cooldownMinutes && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cooldown</h3>
                    <p className="text-gray-900 dark:text-gray-100">{alertDetail.cooldownMinutes} minutes</p>
                  </div>
                )}
                {alertDetail.lastTriggeredAt && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Last Triggered</h3>
                    <p className="text-gray-900 dark:text-gray-100">{new Date(alertDetail.lastTriggeredAt).toLocaleString()}</p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Conditions</h3>
                <div className="space-y-2">
                  {alertDetail.conditions.map((condition, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                        <strong>{condition.metric}</strong> {condition.operator} {condition.threshold}
                        {condition.timeWindow && ` (within ${condition.timeWindow} minutes)`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notification Channels</h3>
                <div className="space-y-2">
                  {alertDetail.notificationChannels.map((channel, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        <strong className="capitalize">{channel.type}</strong>: {channel.config.email || channel.config.slackWebhookUrl || channel.config.webhookUrl || 'Not configured'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => {
                  setShowDetail(false);
                  setAlertDetail(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Alert History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {alertHistory.map((history) => (
                <div key={history.id} className="border rounded p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-semibold">{history.message}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(history.triggeredAt).toLocaleString()}
                    </div>
                  </div>
                  {history.notificationSent && (
                    <div className="text-xs text-green-600">
                      Notifications sent via: {history.notificationChannels?.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAlertModal({
  alert,
  onClose,
  onSave,
}: {
  alert?: Alert | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: alert?.name || '',
    description: alert?.description || '',
    type: alert?.type || 'failure',
    workflowId: alert?.workflowId || '',
    conditions: alert?.conditions || [{ metric: 'failure_rate', operator: '>', threshold: 10 }],
    notificationChannels: alert?.notificationChannels || [],
    cooldownMinutes: alert?.cooldownMinutes || 60,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (alert) {
        await api.put(`/alerts/${alert.id}`, data);
      } else {
        await api.post('/alerts', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      onSave();
    },
    onError: (error) => {
      console.error('Failed to save alert:', error);
      alert('Failed to save alert. Please check the form and try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{alert ? 'Edit Alert' : 'Create Alert'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value as Alert['type'] })
              }
              className="w-full border rounded px-3 py-2"
            >
              <option value="failure">Failure</option>
              <option value="performance">Performance</option>
              <option value="usage">Usage</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Condition</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={formData.conditions[0]?.metric || 'failure_rate'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conditions: [
                      { ...formData.conditions[0], metric: e.target.value } as AlertCondition,
                    ],
                  })
                }
                className="border rounded px-3 py-2"
              >
                <option value="failure_rate">Failure Rate (%)</option>
                <option value="execution_time">Execution Time (ms)</option>
                <option value="error_count">Error Count</option>
                <option value="usage_count">Usage Count</option>
              </select>
              <select
                value={formData.conditions[0]?.operator || '>'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conditions: [
                      { ...formData.conditions[0], operator: e.target.value as any } as AlertCondition,
                    ],
                  })
                }
                className="border rounded px-3 py-2"
              >
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value=">=">&gt;=</option>
                <option value="<=">&lt;=</option>
                <option value="==">==</option>
              </select>
              <input
                type="number"
                value={formData.conditions[0]?.threshold || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conditions: [
                      { ...formData.conditions[0], threshold: parseFloat(e.target.value) } as AlertCondition,
                    ],
                  })
                }
                className="border rounded px-3 py-2"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notification Channel</label>
            <select
              value={formData.notificationChannels[0]?.type || 'email'}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  notificationChannels: [
                    {
                      type: e.target.value as 'email' | 'slack' | 'webhook',
                      config: {},
                    },
                  ],
                })
              }
              className="w-full border rounded px-3 py-2 mb-2"
            >
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
            </select>
            {formData.notificationChannels[0]?.type === 'email' && (
              <input
                type="email"
                placeholder="Email address"
                value={formData.notificationChannels[0]?.config?.email || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    notificationChannels: [
                      {
                        ...formData.notificationChannels[0],
                        config: { email: e.target.value },
                      },
                    ],
                  })
                }
                className="w-full border rounded px-3 py-2"
                required
              />
            )}
            {formData.notificationChannels[0]?.type === 'slack' && (
              <input
                type="url"
                placeholder="Slack Webhook URL"
                value={formData.notificationChannels[0]?.config?.slackWebhookUrl || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    notificationChannels: [
                      {
                        ...formData.notificationChannels[0],
                        config: { slackWebhookUrl: e.target.value },
                      },
                    ],
                  })
                }
                className="w-full border rounded px-3 py-2"
                required
              />
            )}
            {formData.notificationChannels[0]?.type === 'webhook' && (
              <input
                type="url"
                placeholder="Webhook URL"
                value={formData.notificationChannels[0]?.config?.webhookUrl || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    notificationChannels: [
                      {
                        ...formData.notificationChannels[0],
                        config: { webhookUrl: e.target.value },
                      },
                    ],
                  })
                }
                className="w-full border rounded px-3 py-2"
                required
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Cooldown (minutes)</label>
            <input
              type="number"
              value={formData.cooldownMinutes}
              onChange={(e) =>
                setFormData({ ...formData, cooldownMinutes: parseInt(e.target.value) })
              }
              className="w-full border rounded px-3 py-2"
              min={1}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

