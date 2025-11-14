import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';

/**
 * Policy Configuration Page
 * 
 * Allows users to configure routing policies for their organization/workspace
 */

interface PolicyCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'regex' | 'exists';
  value: any;
}

interface PolicyAction {
  type: 'route' | 'block' | 'warn' | 'modify' | 'log';
  target?: string;
  value?: any;
  reason?: string;
}

interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  metadata?: Record<string, any>;
}

interface PolicySet {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  workspaceId?: string;
  rules: PolicyRule[];
  enabled: boolean;
  priority: number;
}

export default function PolicyConfiguration() {
  const queryClient = useQueryClient();
  const [selectedPolicySet, setSelectedPolicySet] = useState<PolicySet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['policies', workspaceId],
    queryFn: async () => {
      const params = workspaceId ? { workspaceId } : {};
      const response = await api.get('/policies', { params });
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (policySet: Partial<PolicySet>) => {
      const response = await api.post('/policies', policySet);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setIsCreating(false);
      alert('Policy set created successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to create policy set: ${err.response?.data?.error || err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<PolicySet> & { id: string }) => {
      const response = await api.put(`/policies/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      alert('Policy set updated successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to update policy set: ${err.response?.data?.error || err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/policies/${id}`, {
        params: workspaceId ? { workspaceId } : {},
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setSelectedPolicySet(null);
      alert('Policy set deleted successfully!');
    },
    onError: (err: any) => {
      alert(`Failed to delete policy set: ${err.response?.data?.error || err.message}`);
    },
  });

  const handleCreatePolicySet = () => {
    const newPolicySet: Partial<PolicySet> = {
      name: 'New Policy Set',
      description: '',
      enabled: true,
      priority: 0,
      rules: [],
      workspaceId,
    };
    createMutation.mutate(newPolicySet);
  };

  const handleSavePolicySet = () => {
    if (!selectedPolicySet) return;
    updateMutation.mutate(selectedPolicySet);
  };

  const handleDeletePolicySet = () => {
    if (!selectedPolicySet || !confirm('Are you sure you want to delete this policy set?')) return;
    deleteMutation.mutate(selectedPolicySet.id);
  };

  const handleAddRule = () => {
    if (!selectedPolicySet) return;
    const newRule: PolicyRule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      description: '',
      priority: 0,
      enabled: true,
      conditions: [],
      actions: [],
    };
    setSelectedPolicySet({
      ...selectedPolicySet,
      rules: [...selectedPolicySet.rules, newRule],
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!selectedPolicySet) return;
    setSelectedPolicySet({
      ...selectedPolicySet,
      rules: selectedPolicySet.rules.filter((r) => r.id !== ruleId),
    });
  };

  const handleUpdateRule = (ruleId: string, updates: Partial<PolicyRule>) => {
    if (!selectedPolicySet) return;
    setSelectedPolicySet({
      ...selectedPolicySet,
      rules: selectedPolicySet.rules.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    });
  };

  const handleAddCondition = (ruleId: string) => {
    if (!selectedPolicySet) return;
    const newCondition: PolicyCondition = {
      field: '',
      operator: 'eq',
      value: '',
    };
    handleUpdateRule(ruleId, {
      conditions: [
        ...selectedPolicySet.rules.find((r) => r.id === ruleId)?.conditions || [],
        newCondition,
      ],
    });
  };

  const handleDeleteCondition = (ruleId: string, conditionIndex: number) => {
    if (!selectedPolicySet) return;
    const rule = selectedPolicySet.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    handleUpdateRule(ruleId, {
      conditions: rule.conditions.filter((_, i) => i !== conditionIndex),
    });
  };

  const handleAddAction = (ruleId: string) => {
    if (!selectedPolicySet) return;
    const newAction: PolicyAction = {
      type: 'route',
      target: '',
      value: '',
    };
    handleUpdateRule(ruleId, {
      actions: [
        ...selectedPolicySet.rules.find((r) => r.id === ruleId)?.actions || [],
        newAction,
      ],
    });
  };

  const handleDeleteAction = (ruleId: string, actionIndex: number) => {
    if (!selectedPolicySet) return;
    const rule = selectedPolicySet.rules.find((r) => r.id === ruleId);
    if (!rule) return;
    handleUpdateRule(ruleId, {
      actions: rule.actions.filter((_, i) => i !== actionIndex),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in p-6">
        <div className="bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm p-6">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-3 text-gray-500 dark:text-gray-400">Loading policies...</p>
          </div>
        </div>
      </div>
    );
  }

  const policySets: PolicySet[] = data?.policySets || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
            Policy Configuration
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure routing policies for your organization
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Policy Sets List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Policy Sets</h2>
                <button
                  onClick={handleCreatePolicySet}
                  disabled={createMutation.isPending}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  + New
                </button>
              </div>

              <div className="space-y-2">
                {policySets.map((policySet) => (
                  <button
                    key={policySet.id}
                    onClick={() => setSelectedPolicySet(policySet)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedPolicySet?.id === policySet.id
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{policySet.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {policySet.rules.length} rule(s)
                        </div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        policySet.enabled ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Policy Set Editor */}
          <div className="lg:col-span-2">
            {selectedPolicySet ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedPolicySet.name}</h2>
                    {selectedPolicySet.description && (
                      <p className="text-gray-600 dark:text-gray-400 mt-1">
                        {selectedPolicySet.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSavePolicySet}
                      disabled={updateMutation.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleDeletePolicySet}
                      disabled={deleteMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Policy Set Settings */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={selectedPolicySet.name}
                      onChange={(e) =>
                        setSelectedPolicySet({ ...selectedPolicySet, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={selectedPolicySet.description || ''}
                      onChange={(e) =>
                        setSelectedPolicySet({ ...selectedPolicySet, description: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Priority
                      </label>
                      <input
                        type="number"
                        value={selectedPolicySet.priority}
                        onChange={(e) =>
                          setSelectedPolicySet({
                            ...selectedPolicySet,
                            priority: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPolicySet.enabled}
                          onChange={(e) =>
                            setSelectedPolicySet({
                              ...selectedPolicySet,
                              enabled: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          Enabled
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Rules */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Rules</h3>
                    <button
                      onClick={handleAddRule}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      + Add Rule
                    </button>
                  </div>

                  <div className="space-y-4">
                    {selectedPolicySet.rules.map((rule, ruleIndex) => (
                      <div
                        key={rule.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={rule.name}
                              onChange={(e) =>
                                handleUpdateRule(rule.id, { name: e.target.value })
                              }
                              placeholder="Rule name"
                              className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={rule.priority}
                              onChange={(e) =>
                                handleUpdateRule(rule.id, {
                                  priority: parseInt(e.target.value) || 0,
                                })
                              }
                              placeholder="Priority"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                            />
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={(e) =>
                                handleUpdateRule(rule.id, { enabled: e.target.checked })
                              }
                              className="w-4 h-4 text-indigo-600 rounded"
                            />
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* Conditions */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">Conditions</label>
                            <button
                              onClick={() => handleAddCondition(rule.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                            >
                              + Add Condition
                            </button>
                          </div>
                          <div className="space-y-2">
                            {rule.conditions.map((condition, condIndex) => (
                              <div key={condIndex} className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  value={condition.field}
                                  onChange={(e) => {
                                    const updated = [...rule.conditions];
                                    updated[condIndex] = { ...condition, field: e.target.value };
                                    handleUpdateRule(rule.id, { conditions: updated });
                                  }}
                                  placeholder="Field (e.g., userPlan)"
                                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                />
                                <select
                                  value={condition.operator}
                                  onChange={(e) => {
                                    const updated = [...rule.conditions];
                                    updated[condIndex] = {
                                      ...condition,
                                      operator: e.target.value as PolicyCondition['operator'],
                                    };
                                    handleUpdateRule(rule.id, { conditions: updated });
                                  }}
                                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                >
                                  <option value="eq">==</option>
                                  <option value="ne">!=</option>
                                  <option value="gt">&gt;</option>
                                  <option value="gte">&gt;=</option>
                                  <option value="lt">&lt;</option>
                                  <option value="lte">&lt;=</option>
                                  <option value="in">in</option>
                                  <option value="not_in">not in</option>
                                  <option value="contains">contains</option>
                                  <option value="regex">regex</option>
                                  <option value="exists">exists</option>
                                </select>
                                <input
                                  type="text"
                                  value={condition.value}
                                  onChange={(e) => {
                                    const updated = [...rule.conditions];
                                    updated[condIndex] = { ...condition, value: e.target.value };
                                    handleUpdateRule(rule.id, { conditions: updated });
                                  }}
                                  placeholder="Value"
                                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                />
                                <button
                                  onClick={() => handleDeleteCondition(rule.id, condIndex)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">Actions</label>
                            <button
                              onClick={() => handleAddAction(rule.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                            >
                              + Add Action
                            </button>
                          </div>
                          <div className="space-y-2">
                            {rule.actions.map((action, actionIndex) => (
                              <div key={actionIndex} className="flex gap-2 items-center">
                                <select
                                  value={action.type}
                                  onChange={(e) => {
                                    const updated = [...rule.actions];
                                    updated[actionIndex] = {
                                      ...action,
                                      type: e.target.value as PolicyAction['type'],
                                    };
                                    handleUpdateRule(rule.id, { actions: updated });
                                  }}
                                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                >
                                  <option value="route">Route</option>
                                  <option value="block">Block</option>
                                  <option value="warn">Warn</option>
                                  <option value="modify">Modify</option>
                                  <option value="log">Log</option>
                                </select>
                                {action.type === 'route' || action.type === 'modify' ? (
                                  <>
                                    <input
                                      type="text"
                                      value={action.target || ''}
                                      onChange={(e) => {
                                        const updated = [...rule.actions];
                                        updated[actionIndex] = {
                                          ...action,
                                          target: e.target.value,
                                        };
                                        handleUpdateRule(rule.id, { actions: updated });
                                      }}
                                      placeholder="Target (e.g., requestedModel)"
                                      className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      value={action.value || ''}
                                      onChange={(e) => {
                                        const updated = [...rule.actions];
                                        updated[actionIndex] = {
                                          ...action,
                                          value: e.target.value,
                                        };
                                        handleUpdateRule(rule.id, { actions: updated });
                                      }}
                                      placeholder="Value"
                                      className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                    />
                                  </>
                                ) : null}
                                <input
                                  type="text"
                                  value={action.reason || ''}
                                  onChange={(e) => {
                                    const updated = [...rule.actions];
                                    updated[actionIndex] = {
                                      ...action,
                                      reason: e.target.value,
                                    };
                                    handleUpdateRule(rule.id, { actions: updated });
                                  }}
                                  placeholder="Reason"
                                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                                />
                                <button
                                  onClick={() => handleDeleteAction(rule.id, actionIndex)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Select a policy set to edit, or create a new one
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

