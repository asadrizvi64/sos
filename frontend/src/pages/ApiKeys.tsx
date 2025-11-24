import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  userId?: string;
  organizationId?: string;
  permissions?: Record<string, unknown>;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeyUsage {
  lastUsedAt?: string;
  createdAt: string;
  totalRequests: number;
  last7Days: number;
  last30Days: number;
}

export default function ApiKeys() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<ApiKey | null>(null);
  const [showKeyModal, setShowKeyModal] = useState<ApiKey | null>(null);
  const [showEditModal, setShowEditModal] = useState<ApiKey | null>(null);
  const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState('');
  const [editKeyName, setEditKeyName] = useState('');
  const [editKeyExpiresAt, setEditKeyExpiresAt] = useState('');

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys.all,
    queryFn: async () => {
      const response = await api.get('/api-keys');
      return response.data;
    },
  });

  const { data: usage } = useQuery<ApiKeyUsage>({
    queryKey: selectedKeyId ? queryKeys.apiKeys.usage(selectedKeyId) : [''],
    queryFn: async () => {
      if (!selectedKeyId) return null;
      const response = await api.get(`/api-keys/${selectedKeyId}/usage`);
      return response.data;
    },
    enabled: !!selectedKeyId,
  });

  const { data: keyDetail } = useQuery<ApiKey>({
    queryKey: showDetailModal ? queryKeys.apiKeys.detail(showDetailModal) : [''],
    queryFn: async () => {
      if (!showDetailModal) return null;
      const response = await api.get(`/api-keys/${showDetailModal}`);
      return response.data;
    },
    enabled: !!showDetailModal,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; expiresAt?: string }) => {
      const response = await api.post('/api-keys', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyExpiresAt('');
      // Show the newly created key
      setShowKeyModal(data);
    },
    onError: (err: any) => {
      alert(`Failed to create API key: ${err.response?.data?.error || err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await api.delete(`/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
      setShowDeleteModal(null);
    },
    onError: (err: any) => {
      alert(`Failed to delete API key: ${err.response?.data?.error || err.message}`);
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await api.post(`/api-keys/${keyId}/rotate`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
      setShowKeyModal(data);
    },
    onError: (err: any) => {
      alert(`Failed to rotate API key: ${err.response?.data?.error || err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ keyId, data }: { keyId: string; data: { name?: string; expiresAt?: string | null } }) => {
      const response = await api.put(`/api-keys/${keyId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
      setShowEditModal(null);
      setEditKeyName('');
      setEditKeyExpiresAt('');
    },
    onError: (err: any) => {
      alert(`Failed to update API key: ${err.response?.data?.error || err.message}`);
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      alert('Please enter a name for the API key');
      return;
    }

    createMutation.mutate({
      name: newKeyName,
      expiresAt: newKeyExpiresAt || undefined,
    });
  };

  const handleDelete = (key: ApiKey) => {
    setShowDeleteModal(key);
  };

  const confirmDelete = () => {
    if (showDeleteModal) {
      deleteMutation.mutate(showDeleteModal.id);
    }
  };

  const handleRotate = (key: ApiKey) => {
    if (!confirm(`Are you sure you want to rotate "${key.name}"? The old key will no longer work.`)) {
      return;
    }
    rotateMutation.mutate(key.id);
  };

  const handleEdit = (key: ApiKey) => {
    setShowEditModal(key);
    setEditKeyName(key.name);
    // Convert expiresAt to datetime-local format if it exists
    if (key.expiresAt) {
      const date = new Date(key.expiresAt);
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEditKeyExpiresAt(localDateTime);
    } else {
      setEditKeyExpiresAt('');
    }
  };

  const handleUpdate = () => {
    if (!showEditModal || !editKeyName.trim()) {
      alert('Please enter a name for the API key');
      return;
    }

    updateMutation.mutate({
      keyId: showEditModal.id,
      data: {
        name: editKeyName,
        expiresAt: editKeyExpiresAt || null,
      },
    });
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return `${key.substring(0, 8)}${'•'.repeat(key.length - 12)}${key.substring(key.length - 4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isExpiringSoon = (expiresAt?: string) => {
    if (!expiresAt) return false;
    const daysUntilExpiry = (new Date(expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
              API Keys
            </h1>
            <p className="text-gray-600 dark:text-gray-400">Manage your API keys for programmatic access</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            + Create API Key
          </button>
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="ml-3 text-gray-600 dark:text-gray-400">Loading API keys...</p>
            </div>
          </div>
        ) : keys.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-2">No API keys yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">Create your first API key to get started</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
              >
                Create API Key
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {keys.map((key, index) => (
              <div 
                key={key.id} 
                className="group relative overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-lg hover:border-indigo-300/50 dark:hover:border-indigo-500/50 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 dark:from-indigo-900/50 to-indigo-50 dark:to-indigo-900/30 flex items-center justify-center">
                        <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{key.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {isExpired(key.expiresAt) && (
                            <span className="px-2.5 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
                              Expired
                            </span>
                          )}
                          {isExpiringSoon(key.expiresAt) && !isExpired(key.expiresAt) && (
                            <span className="px-2.5 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                              Expiring Soon
                            </span>
                          )}
                          {key.organizationId && (
                            <span className="px-2.5 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full">
                              Organization
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <code className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-mono text-gray-900 dark:text-gray-100 flex-1">
                        {maskKey(key.key)}
                      </code>
                      <button
                        onClick={() => copyToClipboard(key.key)}
                        className="px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors duration-200 font-medium"
                        title="Copy full key"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>Created: {new Date(key.createdAt).toLocaleDateString()}</p>
                      {key.lastUsedAt && (
                        <p>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</p>
                      )}
                      {key.expiresAt && (
                        <p>
                          Expires: {new Date(key.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      {!key.lastUsedAt && (
                        <p className="text-gray-400 dark:text-gray-500">Never used</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setShowDetailModal(key.id)}
                      className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200 font-medium"
                    >
                      Details
                    </button>
                    <button
                      onClick={() => {
                        setSelectedKeyId(key.id);
                        // Fetch usage stats
                      }}
                      className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200 font-medium"
                    >
                      Usage
                    </button>
                    <button
                      onClick={() => handleEdit(key)}
                      className="px-3 py-1.5 text-sm bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors duration-200 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleRotate(key)}
                      className="px-3 py-1.5 text-sm bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors duration-200 font-medium"
                    >
                      🔄 Rotate
                    </button>
                    <button
                      onClick={() => handleDelete(key)}
                      className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
                {selectedKeyId === key.id && usage && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-semibold mb-2">Usage Statistics</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Last Used:</span>{' '}
                        <span className="font-medium">
                          {usage.lastUsedAt
                            ? new Date(usage.lastUsedAt).toLocaleString()
                            : 'Never'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Requests:</span>{' '}
                        <span className="font-medium">{usage.totalRequests}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create API Key Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Create API Key</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production API Key"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires At (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newKeyExpiresAt}
                    onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewKeyName('');
                    setNewKeyExpiresAt('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API Key Detail Modal */}
        {showDetailModal && keyDetail && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">API Key Details</h2>
                <button
                  onClick={() => setShowDetailModal(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">{keyDetail.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Key ID</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded font-mono">{keyDetail.id}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-gray-50 p-2 rounded font-mono break-all">
                      {maskKey(keyDetail.key)}
                    </code>
                    <button
                      onClick={() => copyToClipboard(keyDetail.key)}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {new Date(keyDetail.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Updated</label>
                  <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {new Date(keyDetail.updatedAt).toLocaleString()}
                  </p>
                </div>
                {keyDetail.lastUsedAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Used</label>
                    <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {new Date(keyDetail.lastUsedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {keyDetail.expiresAt && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
                    <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                      {new Date(keyDetail.expiresAt).toLocaleString()}
                      {isExpired(keyDetail.expiresAt) && (
                        <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Expired</span>
                      )}
                      {isExpiringSoon(keyDetail.expiresAt) && !isExpired(keyDetail.expiresAt) && (
                        <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">Expiring Soon</span>
                      )}
                    </p>
                  </div>
                )}
                {keyDetail.organizationId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Organization ID</label>
                    <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded font-mono">{keyDetail.organizationId}</p>
                  </div>
                )}
                {keyDetail.permissions && Object.keys(keyDetail.permissions).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Permissions</label>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(keyDetail.permissions, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowDetailModal(null)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete API Key</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-100">"{showDeleteModal.name}"</strong>? 
                This API key will be permanently removed and any applications using it will stop working.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium shadow-md hover:shadow-lg"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete API Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit API Key Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Edit API Key</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editKeyName}
                    onChange={(e) => setEditKeyName(e.target.value)}
                    placeholder="e.g., Production API Key"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires At (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={editKeyExpiresAt}
                    onChange={(e) => setEditKeyExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave empty to remove expiration date
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Updating...' : 'Update'}
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(null);
                    setEditKeyName('');
                    setEditKeyExpiresAt('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show Key Modal (after creation or rotation) */}
        {showKeyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">API Key Created</h2>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Important:</strong> Copy this key now. You won't be able to see it again!
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-100 rounded text-sm font-mono break-all">
                    {showKeyModal.key}
                  </code>
                  <button
                    onClick={() => copyToClipboard(showKeyModal.key)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                I've copied the key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

