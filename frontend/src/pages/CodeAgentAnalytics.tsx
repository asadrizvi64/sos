import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { FaChartLine, FaClock, FaMemory, FaCheckCircle, FaTimesCircle, FaCode } from 'react-icons/fa';

export default function CodeAgentAnalytics() {
  const { userId } = useAuth();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  // Fetch code agents
  const { data: agents } = useQuery({
    queryKey: ['code-agents'],
    queryFn: async () => {
      const response = await api.get('/code-agents');
      return response.data;
    },
  });

  // Fetch analytics for selected agent or all agents
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['code-agent-analytics', selectedAgentId, timeRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAgentId) params.append('agentId', selectedAgentId);
      params.append('timeRange', timeRange);
      
      const response = await api.get(`/code-agents/analytics?${params.toString()}`);
      return response.data;
    },
    enabled: !!userId,
  });

  const stats = analytics?.stats || {
    totalExecutions: 0,
    successRate: 0,
    avgDurationMs: 0,
    totalErrors: 0,
    totalTokensUsed: 0,
    avgMemoryMb: 0,
    executionsByLanguage: {},
    executionsByRuntime: {},
    executionsOverTime: [],
  };

  const executionsByLanguage = stats.executionsByLanguage || {};
  const executionsByRuntime = stats.executionsByRuntime || {};
  const executionsOverTime = stats.executionsOverTime || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Code Agent Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track usage, performance, and insights for your code agents
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Agent
              </label>
              <select
                value={selectedAgentId || ''}
                onChange={(e) => setSelectedAgentId(e.target.value || null)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
              >
                <option value="">All Agents</option>
                {agents?.map((agent: any) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.language})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time Range
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-100"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading analytics...
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Executions</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.totalExecutions.toLocaleString()}
                    </p>
                  </div>
                  <FaCode className="text-3xl text-blue-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {(stats.successRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <FaCheckCircle className="text-3xl text-green-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Avg Duration</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.avgDurationMs > 0 ? `${(stats.avgDurationMs / 1000).toFixed(2)}s` : 'N/A'}
                    </p>
                  </div>
                  <FaClock className="text-3xl text-purple-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Errors</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.totalErrors.toLocaleString()}
                    </p>
                  </div>
                  <FaTimesCircle className="text-3xl text-red-500" />
                </div>
              </div>
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Tokens Used</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.totalTokensUsed > 0 ? stats.totalTokensUsed.toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  <FaChartLine className="text-3xl text-yellow-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Avg Memory Usage</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.avgMemoryMb > 0 ? `${stats.avgMemoryMb.toFixed(2)} MB` : 'N/A'}
                    </p>
                  </div>
                  <FaMemory className="text-3xl text-indigo-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Error Rate</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.totalExecutions > 0
                        ? ((stats.totalErrors / stats.totalExecutions) * 100).toFixed(1)
                        : 0}%
                    </p>
                  </div>
                  <FaTimesCircle className="text-3xl text-orange-500" />
                </div>
              </div>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Executions by Language */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Executions by Language
                </h2>
                <div className="space-y-3">
                  {Object.entries(executionsByLanguage).map(([language, count]: [string, any]) => {
                    const percentage = stats.totalExecutions > 0
                      ? ((count / stats.totalExecutions) * 100).toFixed(1)
                      : 0;
                    return (
                      <div key={language}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-300 capitalize">{language}</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(executionsByLanguage).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
                  )}
                </div>
              </div>

              {/* Executions by Runtime */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Executions by Runtime
                </h2>
                <div className="space-y-3">
                  {Object.entries(executionsByRuntime).map(([runtime, count]: [string, any]) => {
                    const percentage = stats.totalExecutions > 0
                      ? ((count / stats.totalExecutions) * 100).toFixed(1)
                      : 0;
                    return (
                      <div key={runtime}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-300">{runtime}</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(executionsByRuntime).length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Executions Over Time */}
            {executionsOverTime.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Executions Over Time
                </h2>
                <div className="space-y-2">
                  {executionsOverTime.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-24 text-sm text-gray-600 dark:text-gray-400">
                        {new Date(item.date).toLocaleDateString()}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-300">
                            {item.count} executions
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {item.successCount} successful, {item.errorCount} errors
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(item.count / Math.max(...executionsOverTime.map((e: any) => e.count))) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

