import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CodeEditor } from '../components/CodeEditor';
import api from '../lib/api';
import { useAuth } from '@clerk/clerk-react';
import { useTheme } from '../contexts/ThemeContext';

interface CodeAgent {
  id: string;
  name: string;
  description?: string;
  version: string;
  language: 'javascript' | 'python' | 'typescript' | 'bash';
  code: string;
  inputSchema?: any;
  outputSchema?: any;
  runtime: string;
  packages?: string[];
  environment?: Record<string, string>;
  isPublic: boolean;
  usageCount: number;
  deprecated: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SandboxStudio() {
  const { userId } = useAuth();
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<CodeAgent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<'javascript' | 'python' | 'typescript' | 'bash'>('javascript');
  const [runtime, setRuntime] = useState('auto');
  const [packages, setPackages] = useState<string[]>([]);
  const [packagesText, setPackagesText] = useState('');
  const [environment, setEnvironment] = useState<Record<string, string>>({});
  const [envKey, setEnvKey] = useState('');
  const [envValue, setEnvValue] = useState('');
  const [inputSchema, setInputSchema] = useState<any>(null);
  const [outputSchema, setOutputSchema] = useState<any>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedAgentForLogs, setSelectedAgentForLogs] = useState<string | null>(null);

  // Fetch code agents
  const { data: agents, isLoading } = useQuery<CodeAgent[]>({
    queryKey: ['code-agents'],
    queryFn: async () => {
      const response = await api.get('/code-agents');
      return response.data;
    },
  });

  // Fetch execution logs for selected agent
  const { data: executionLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['code-exec-logs', selectedAgentForLogs],
    queryFn: async () => {
      if (!selectedAgentForLogs) return null;
      const response = await api.get(`/code-exec-logs/agent/${selectedAgentForLogs}`);
      return response.data;
    },
    enabled: showLogs && !!selectedAgentForLogs,
  });

  // Fetch execution statistics for selected agent
  const { data: executionStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['code-exec-logs-stats', selectedAgentForLogs],
    queryFn: async () => {
      if (!selectedAgentForLogs) return null;
      const response = await api.get(`/code-exec-logs/agent/${selectedAgentForLogs}/stats`);
      return response.data;
    },
    enabled: showLogs && !!selectedAgentForLogs,
  });

  // Create agent mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/code-agents', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['code-agents'] });
      setIsCreating(false);
      resetForm();
    },
  });

  // Update agent mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.put(`/code-agents/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['code-agents'] });
      resetForm();
    },
  });

  // Delete agent mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/code-agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['code-agents'] });
      if (selectedAgent?.id) {
        setSelectedAgent(null);
      }
    },
  });

  // Export as tool mutation
  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/code-agents/${id}/export-tool`);
      return response.data;
    },
  });

  useEffect(() => {
    if (selectedAgent) {
      setCode(selectedAgent.code);
      setName(selectedAgent.name);
      setDescription(selectedAgent.description || '');
      setLanguage(selectedAgent.language);
      setRuntime(selectedAgent.runtime);
      setPackages(selectedAgent.packages || []);
      setPackagesText((selectedAgent.packages || []).join('\n'));
      setEnvironment(selectedAgent.environment || {});
      setInputSchema(selectedAgent.inputSchema);
      setOutputSchema(selectedAgent.outputSchema);
      setIsPublic(selectedAgent.isPublic);
    }
  }, [selectedAgent]);

  const resetForm = () => {
    setCode('');
    setName('');
    setDescription('');
    setLanguage('javascript');
    setRuntime('auto');
    setPackages([]);
    setPackagesText('');
    setEnvironment({});
    setInputSchema(null);
    setOutputSchema(null);
    setIsPublic(false);
    setSelectedAgent(null);
  };

  const handleSave = () => {
    const agentData = {
      name,
      description,
      language,
      code,
      runtime,
      packages: packagesText.split('\n').filter(p => p.trim()),
      environment,
      inputSchema: inputSchema || undefined,
      outputSchema: outputSchema || undefined,
      isPublic,
    };

    if (selectedAgent) {
      updateMutation.mutate({ id: selectedAgent.id, data: agentData });
    } else {
      createMutation.mutate(agentData);
    }
  };

  const handleAddEnvVar = () => {
    if (envKey && envValue) {
      setEnvironment({ ...environment, [envKey]: envValue });
      setEnvKey('');
      setEnvValue('');
    }
  };

  const handleRemoveEnvVar = (key: string) => {
    const newEnv = { ...environment };
    delete newEnv[key];
    setEnvironment(newEnv);
  };

  const handleExportTool = async () => {
    if (!selectedAgent) return;
    const toolManifest = await exportMutation.mutateAsync(selectedAgent.id);
    
    // Download as JSON file
    const blob = new Blob([JSON.stringify(toolManifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedAgent.name}-tool.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sandbox Studio</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create and manage reusable code agents
            </p>
          </div>
          <div className="flex gap-2">
            {selectedAgent && (
              <>
                <button
                  onClick={handleExportTool}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Export as Tool
                </button>
                <button
                  onClick={() => deleteMutation.mutate(selectedAgent.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (isCreating) {
                  resetForm();
                } else {
                  setIsCreating(true);
                  resetForm();
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {isCreating ? 'Cancel' : 'New Agent'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Agent List */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Code Agents</h2>
            {isLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : agents && agents.length > 0 ? (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setIsCreating(false);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedAgent?.id === agent.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400'
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{agent.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {agent.language} • v{agent.version}
                    </div>
                    {agent.usageCount > 0 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Used {agent.usageCount} times
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAgentForLogs(agent.id);
                        setShowLogs(true);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                    >
                      View logs
                    </button>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No code agents yet</div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center - Code Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {(selectedAgent || isCreating) ? (
              <>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Agent name"
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
                    />
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                      className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
                    >
                      <option value="javascript">JavaScript</option>
                      <option value="python">Python</option>
                      <option value="typescript">TypeScript</option>
                      <option value="bash">Bash</option>
                    </select>
                    <button
                      onClick={handleSave}
                      disabled={!name || !code || createMutation.isPending || updateMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto">
                  <CodeEditor
                    language={language}
                    value={code}
                    onChange={setCode}
                    height="100%"
                    placeholder={`// Your ${language} code here\n// Access input data via 'input' variable\n// Set 'result' variable or return a value`}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <p className="text-lg mb-2">Select a code agent or create a new one</p>
                  <p className="text-sm">Code agents are reusable code blocks that can be used in workflows</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Configuration */}
          {(selectedAgent || isCreating) && (
            <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto">
              <div className="p-4 space-y-6">
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what this code agent does"
                    rows={3}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
                  />
                </div>

                {/* Runtime */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Runtime
                  </label>
                  <select
                    value={runtime}
                    onChange={(e) => setRuntime(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
                  >
                    <option value="auto">Auto (Intelligent Routing)</option>
                    <option value="vm2">VM2 (JavaScript/TypeScript)</option>
                    <option value="e2b">E2B (Ultra-fast)</option>
                    <option value="subprocess">Subprocess (Python/Bash)</option>
                    <option value="wasmedge">WasmEdge (Secure WASM)</option>
                    <option value="bacalhau">Bacalhau (Distributed)</option>
                  </select>
                </div>

                {/* Packages (for Python) */}
                {language === 'python' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Python Packages (one per line)
                    </label>
                    <textarea
                      value={packagesText}
                      onChange={(e) => {
                        setPackagesText(e.target.value);
                        setPackages(e.target.value.split('\n').filter(p => p.trim()));
                      }}
                      placeholder="pandas&#10;numpy&#10;requests"
                      rows={4}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100 font-mono text-sm"
                    />
                  </div>
                )}

                {/* Environment Variables */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Environment Variables
                  </label>
                  <div className="space-y-2">
                    {Object.entries(environment).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{key}={value}</span>
                        <button
                          onClick={() => handleRemoveEnvVar(key)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={envKey}
                        onChange={(e) => setEnvKey(e.target.value)}
                        placeholder="Key"
                        className="flex-1 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm"
                      />
                      <input
                        type="text"
                        value={envValue}
                        onChange={(e) => setEnvValue(e.target.value)}
                        placeholder="Value"
                        className="flex-1 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm"
                      />
                      <button
                        onClick={handleAddEnvVar}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Public/Private */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Make this agent public
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Public agents can be used by other users in the registry
                  </p>
                </div>

                {/* Schema Editor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Input/Output Schemas (Advanced)
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Define Zod (JS/TS) or Pydantic (Python) schemas for validation
                  </p>
                  
                  {/* Input Schema */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Input Schema (JSON)
                    </label>
                    <CodeEditor
                      language="json"
                      value={inputSchema ? JSON.stringify(inputSchema, null, 2) : '{\n  "type": "object",\n  "properties": {\n    "input": { "type": "any" }\n  }\n}'}
                      onChange={(val) => {
                        try {
                          const parsed = JSON.parse(val);
                          setInputSchema(parsed);
                        } catch {
                          // Invalid JSON, keep as string for now
                        }
                      }}
                      height="120px"
                      placeholder='{"type": "object", "properties": {...}}'
                    />
                  </div>

                  {/* Output Schema */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Output Schema (JSON)
                    </label>
                    <CodeEditor
                      language="json"
                      value={outputSchema ? JSON.stringify(outputSchema, null, 2) : '{\n  "type": "object",\n  "properties": {\n    "output": { "type": "any" }\n  }\n}'}
                      onChange={(val) => {
                        try {
                          const parsed = JSON.parse(val);
                          setOutputSchema(parsed);
                        } catch {
                          // Invalid JSON, keep as string for now
                        }
                      }}
                      height="120px"
                      placeholder='{"type": "object", "properties": {...}}'
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Execution Logs Modal */}
      {showLogs && selectedAgentForLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Execution Logs & Statistics
                </h2>
                <button
                  onClick={() => {
                    setShowLogs(false);
                    setSelectedAgentForLogs(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Statistics */}
              {executionStats?.data && (
                <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Executions</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {executionStats.data.totalExecutions}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {executionStats.data.successRate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Avg Duration</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {executionStats.data.avgDurationMs.toFixed(0)}ms
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {executionStats.data.failedExecutions}
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Logs */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Recent Executions
                </h3>
                {isLoadingLogs ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading logs...</div>
                ) : executionLogs?.data && executionLogs.data.length > 0 ? (
                  <div className="space-y-2">
                    {executionLogs.data.map((log: any) => (
                      <div
                        key={log.id}
                        className={`p-4 rounded-lg border ${
                          log.success
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                log.success
                                  ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                                  : 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                              }`}
                            >
                              {log.success ? 'Success' : 'Failed'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {log.runtime} • {log.language}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {log.durationMs && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Duration: {log.durationMs}ms
                            {log.memoryMb && ` • Memory: ${log.memoryMb}MB`}
                            {log.tokensUsed && ` • Tokens: ${log.tokensUsed}`}
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                            Error: {log.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No execution logs yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

