import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import WorkflowTemplates from '../components/WorkflowTemplates';
import { queryKeys } from '../lib/queryKeys';
import { useModals } from '../lib/modals';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export default function Workflows() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const { alert, confirm } = useModals();

  // Fetch all workflows to get all available tags
  const { data: allWorkflows = [] } = useQuery({
    queryKey: queryKeys.workflows.all,
    queryFn: async () => {
      const response = await api.get('/workflows');
      return response.data;
    },
  });

  // Get all unique tags from all workflows
  const allTags = Array.from(
    new Set(
      ([] as string[]).concat(...allWorkflows.map((w: Workflow) => w.tags || []))
    )
  ).sort();

  const { data: workflows = [], isLoading, error } = useQuery({
    queryKey: [...queryKeys.workflows.all, searchQuery, selectedTags.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));
      const response = await api.get(`/workflows?${params.toString()}`);
      return response.data;
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      const response = await api.post(`/workflows/${workflowId}/duplicate`);
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      await alert('Workflow duplicated successfully!', 'Success', 'success');
    },
    onError: async (err: any) => {
      await alert(`Failed to duplicate workflow: ${err.response?.data?.error || err.message}`, 'Error', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      await api.delete(`/workflows/${workflowId}`);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      await alert('Workflow deleted successfully!', 'Success', 'success');
    },
    onError: async (err: any) => {
      await alert(`Failed to delete workflow: ${err.response?.data?.error || err.message}`, 'Error', 'error');
    },
  });

  const handleDuplicate = async (workflowId: string) => {
    const confirmed = await confirm('Duplicate this workflow?', 'Confirm Duplicate', 'info');
    if (!confirmed) return;
    duplicateMutation.mutate(workflowId);
  };

  const handleDelete = async (workflowId: string) => {
    const confirmed = await confirm('Are you sure you want to delete this workflow? This action cannot be undone.', 'Confirm Delete', 'danger');
    if (!confirmed) return;
    deleteMutation.mutate(workflowId);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
            Workflows
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Manage and organize your automation workflows</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowTemplates(true)}
            className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 font-medium shadow-sm"
          >
            📋 Templates
          </button>
          <Link
            to="/dashboard/workflows/new"
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            + Create Workflow
          </Link>
        </div>
      </div>

      {/* Templates Modal */}
      {showTemplates && (
        <WorkflowTemplates
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search workflows by name, description, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all duration-200 shadow-sm placeholder-gray-400 dark:placeholder-gray-500"
          />
          <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Filter by tags:</span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 font-medium ${
                  selectedTags.includes(tag)
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-transparent shadow-md'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="px-3 py-1.5 text-sm rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6 shadow-sm">
          {(error as any)?.response?.data?.error || 'Failed to load workflows'}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="ml-3 text-gray-600 dark:text-gray-400">Loading workflows...</p>
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
          <div className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {searchQuery || selectedTags.length > 0 ? 'No workflows match your filters.' : 'No workflows yet.'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {searchQuery || selectedTags.length > 0 ? 'Try adjusting your search or filters.' : 'Create your first workflow to get started.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-50/50 dark:from-gray-800 dark:to-gray-800/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
              {workflows.map((workflow) => (
                <tr key={workflow.id} className="hover:bg-gradient-to-r hover:from-indigo-50/30 dark:hover:from-indigo-900/20 hover:to-transparent transition-all duration-200">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 dark:from-indigo-900/50 to-indigo-50 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{workflow.name}</div>
                        {workflow.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{workflow.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {workflow.tags && workflow.tags.length > 0 ? (
                        workflow.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">No tags</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        workflow.active
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {workflow.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(workflow.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/dashboard/workflows/${workflow.id}`}
                        className="px-3 py-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all duration-200 font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDuplicate(workflow.id)}
                        className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all duration-200 font-medium"
                        title="Duplicate workflow"
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(workflow.id)}
                        className="px-3 py-1.5 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 font-medium"
                        title="Delete workflow"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

