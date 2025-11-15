import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import NodePalette from '../components/NodePalette';
import NodeConfigPanel from '../components/NodeConfigPanel';
import ExecutionMonitor from '../components/ExecutionMonitor';
import WorkflowVersions from '../components/WorkflowVersions';
import CustomNode from '../components/nodes/CustomNode';
import { createId } from '@paralleldrive/cuid2';
import api from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { useWebSocket, ExecutionEvent } from '../hooks/useWebSocket';
import { WorkflowGroup } from '@sos/shared';
import GroupNode from '../components/nodes/GroupNode';
import { getNodeDefinition } from '../lib/nodes/nodeRegistry';

const nodeTypes = {
  custom: CustomNode,
  group: GroupNode,
};

function WorkflowBuilderContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showExecutionHistory, setShowExecutionHistory] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [groups, setGroups] = useState<WorkflowGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<WorkflowGroup | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupStartPos, setGroupStartPos] = useState<{ x: number; y: number } | null>(null);
  const { getViewport, setViewport, fitView, screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  
  // History for undo/redo
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Real-time execution state
  const [executingNodes, setExecutingNodes] = useState<Set<string>>(new Set());
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [errorNodes, setErrorNodes] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  // WebSocket connection for real-time execution updates
  const { isConnected, onEvent } = useWebSocket(executionId);
  
  // Clipboard for copy/paste
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);

  // Handle OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailSuccess = params.get('gmail_oauth_success');
    const outlookSuccess = params.get('outlook_oauth_success');
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      alert(`OAuth error: ${error}`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if ((gmailSuccess || outlookSuccess) && token) {
      const provider = gmailSuccess ? 'gmail' : 'outlook';
      const nodeId = sessionStorage.getItem('oauth_node_id');
      
      if (nodeId) {
        // Store token in sessionStorage for NodeConfigPanel to pick up
        sessionStorage.setItem(`oauth_${provider}_token`, token);
        
        // Trigger a custom event that NodeConfigPanel can listen to
        window.dispatchEvent(new CustomEvent('oauth-callback', { 
          detail: { provider, token, nodeId } 
        }));
      }
      
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [selectedNode]);

  // Save state to history
  const saveToHistory = useCallback((nodesToSave: Node[], edgesToSave: Edge[]) => {
    const newState = { nodes: JSON.parse(JSON.stringify(nodesToSave)), edges: JSON.parse(JSON.stringify(edgesToSave)) };
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(newState);
    historyIndexRef.current = historyRef.current.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(state.nodes);
      setEdges(state.edges);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
    }
  }, [setNodes, setEdges]);

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const state = historyRef.current[historyIndexRef.current];
      setNodes(state.nodes);
      setEdges(state.edges);
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }
  }, [setNodes, setEdges]);

  // Copy selected nodes
  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;

    // Find edges connected to selected nodes
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    clipboardRef.current = {
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
      edges: JSON.parse(JSON.stringify(selectedEdges)),
    };
  }, [nodes, edges]);

  // Paste nodes
  const handlePaste = useCallback(() => {
    if (!clipboardRef.current) return;

    const offset = 50;
    const newNodes = clipboardRef.current.nodes.map((node) => ({
      ...node,
      id: createId(),
      position: {
        x: node.position.x + offset,
        y: node.position.y + offset,
      },
      selected: false,
    }));

    // Create new edges with new node IDs
    const nodeIdMap = new Map(
      clipboardRef.current.nodes.map((node, index) => [node.id, newNodes[index].id])
    );

    const newEdges = clipboardRef.current.edges.map((edge) => ({
      ...edge,
      id: createId(),
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
    }));

    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
    saveToHistory([...nodes, ...newNodes], [...edges, ...newEdges]);
  }, [nodes, edges, setNodes, setEdges, saveToHistory]);

  // Delete selected nodes
  const handleDelete = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedNodeIds.size === 0) return;

    const newNodes = nodes.filter((node) => !selectedNodeIds.has(node.id));
    const newEdges = edges.filter(
      (edge) => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)
    );

    setNodes(newNodes);
    setEdges(newEdges);
    saveToHistory(newNodes, newEdges);
  }, [nodes, edges, setNodes, setEdges, saveToHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Ctrl/Cmd + Z: Undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') ||
        ((event.ctrlKey || event.metaKey) && event.key === 'y')
      ) {
        event.preventDefault();
        handleRedo();
      }

      // Ctrl/Cmd + C: Copy
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault();
        handleCopy();
      }

      // Ctrl/Cmd + V: Paste
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault();
        handlePaste();
      }

      // Delete or Backspace: Delete selected nodes
      if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleCopy, handlePaste, handleDelete]);

  // Save to history when nodes or edges change
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      // Debounce history saves
      const timeout = setTimeout(() => {
        saveToHistory(nodes, edges);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [nodes, edges, saveToHistory]);

  // Load workflow if editing
  const { data: workflow } = useQuery({
    queryKey: id && id !== 'new' ? queryKeys.workflows.detail(id) : [''],
    queryFn: async () => {
      if (!id || id === 'new') return null;
      const response = await api.get(`/workflows/${id}`);
      return response.data;
    },
    enabled: !!id && id !== 'new',
  });

  // Load execution history
  const { data: executionHistory = [] } = useQuery({
    queryKey: id && id !== 'new' ? queryKeys.workflows.executions(id) : [''],
    queryFn: async () => {
      if (!id || id === 'new') return [];
      const response = await api.get(`/executions/workflow/${id}`);
      return response.data;
    },
    enabled: !!id && id !== 'new' && showExecutionHistory,
  });

  // Initialize workflow data when loaded
  useEffect(() => {
    if (workflow?.definition) {
      const loadedNodes = workflow.definition.nodes || [];
      const loadedEdges = workflow.definition.edges || [];
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      
      // Load workflow metadata
      if (workflow.name) setWorkflowName(workflow.name);
      if (workflow.description) setWorkflowDescription(workflow.description);
      if (workflow.tags) setWorkflowTags(workflow.tags);
      if (workflow.definition.groups) setGroups(workflow.definition.groups);
      
      // Restore viewport if saved
      if (workflow.definition.viewport) {
        setViewport(workflow.definition.viewport);
      } else {
        // Fit view after a short delay to ensure nodes are rendered
        setTimeout(() => fitView(), 100);
      }
      
      // Initialize history
      historyRef.current = [{ nodes: JSON.parse(JSON.stringify(loadedNodes)), edges: JSON.parse(JSON.stringify(loadedEdges)) }];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    } else if (!id || id === 'new') {
      // Initialize history for new workflow
      historyRef.current = [{ nodes: [], edges: [] }];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
      // Reset metadata for new workflow
      setWorkflowName('');
      setWorkflowDescription('');
      setWorkflowTags([]);
      setGroups([]);
    }
  }, [workflow, id, setViewport, fitView]);

  const handleAddNode = useCallback(
    (nodeType: string, position: { x: number; y: number }) => {
      // Get node definition to extract default config
      const nodeDef = getNodeDefinition(nodeType);
      const defaultConfig: Record<string, unknown> = {};
      
      // Extract default values from node definition config
      if (nodeDef?.config?.properties) {
        Object.entries(nodeDef.config.properties).forEach(([key, prop]: [string, any]) => {
          if (prop.default !== undefined) {
            defaultConfig[key] = prop.default;
          }
        });
      }
      
      const newNode: Node = {
        id: createId(),
        type: 'custom',
        position,
        data: {
          type: nodeType,
          label: nodeDef?.name || nodeType.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || nodeType,
          config: defaultConfig,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // For logic nodes, preserve sourceHandle to route to correct output
      setEdges((eds) => addEdge({
        ...params,
        sourceHandle: params.sourceHandle, // Preserve handle ID for conditional routing
      }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowConfig(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowConfig(false);
  }, []);

  const handleUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node))
      );
    },
    [setNodes]
  );

  const saveMutation = useMutation({
    mutationFn: async (workflowData: any) => {
      if (id && id !== 'new') {
        await api.put(`/workflows/${id}`, workflowData);
        return { id };
      } else {
        const response = await api.post('/workflows', workflowData);
        return response.data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      if (!id || id === 'new') {
        navigate(`/workflows/${data.id}`);
      } else {
        alert('Workflow saved successfully!');
      }
    },
    onError: (error) => {
      console.error('Failed to save workflow:', error);
      alert('Failed to save workflow');
    },
  });

  const handleSave = () => {
    const viewport = getViewport();
    const workflowDefinition: any = {
      nodes,
      edges,
      viewport,
    };

    if (groups.length > 0) {
      workflowDefinition.groups = groups;
    }

    const workflowData: any = {
      name: workflowName || `Workflow ${new Date().toLocaleDateString()}`,
      description: workflowDescription || undefined,
      // workspaceId will be auto-created by backend if not provided
      workspaceId: id && id !== 'new' ? undefined : 'default-workspace',
      definition: workflowDefinition,
      active: true,
    };

    if (workflowTags.length > 0) {
      workflowData.tags = workflowTags;
    }

    saveMutation.mutate(workflowData);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !workflowTags.includes(trimmed)) {
      setWorkflowTags([...workflowTags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setWorkflowTags(workflowTags.filter((tag) => tag !== tagToRemove));
  };

  // Group management functions
  const handleCreateGroup = () => {
    setIsCreatingGroup(true);
  };

  const handleGroupMouseDown = useCallback((event: React.MouseEvent) => {
    if (!isCreatingGroup) return;
    event.preventDefault();
    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    setGroupStartPos(position);
  }, [isCreatingGroup, screenToFlowPosition]);

  const handleGroupMouseUp = useCallback((event: React.MouseEvent) => {
    if (!isCreatingGroup || !groupStartPos) return;
    event.preventDefault();
    
    const endPos = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const minX = Math.min(groupStartPos.x, endPos.x);
    const minY = Math.min(groupStartPos.y, endPos.y);
    const width = Math.abs(endPos.x - groupStartPos.x);
    const height = Math.abs(endPos.y - groupStartPos.y);

    if (width > 50 && height > 50) {
      // Find nodes within the group bounds
      const nodeIds = nodes
        .filter((node) => {
          const nodeX = node.position.x;
          const nodeY = node.position.y;
          // Approximate node size (150px width, 80px height)
          const nodeWidth = 150;
          const nodeHeight = 80;
          return (
            nodeX + nodeWidth >= minX &&
            nodeX <= minX + width &&
            nodeY + nodeHeight >= minY &&
            nodeY <= minY + height
          );
        })
        .map((node) => node.id);

      if (nodeIds.length > 0) {
        const newGroup: WorkflowGroup = {
          id: createId(),
          label: `Group ${groups.length + 1}`,
          position: { x: minX, y: minY },
          size: { width, height },
          style: {
            backgroundColor: 'rgba(243, 244, 246, 0.5)',
            borderColor: '#d1d5db',
            borderWidth: 2,
          },
          nodeIds,
        };
        setGroups([...groups, newGroup]);
      }
    }

    setIsCreatingGroup(false);
    setGroupStartPos(null);
  }, [isCreatingGroup, groupStartPos, nodes, groups, screenToFlowPosition]);

  const handleDeleteGroup = (groupId: string) => {
    setGroups(groups.filter((g) => g.id !== groupId));
    if (selectedGroup?.id === groupId) {
      setSelectedGroup(null);
    }
  };

  const handleUpdateGroup = (updatedGroup: WorkflowGroup) => {
    setGroups(groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)));
    setSelectedGroup(updatedGroup);
  };

  const handleExport = () => {
    const workflowData = {
      name: `Workflow ${id || 'new'}`,
      definition: {
        nodes,
        edges,
        viewport: getViewport(),
      },
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${id || 'new'}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        
        if (imported.definition) {
          if (imported.definition.nodes) setNodes(imported.definition.nodes);
          if (imported.definition.edges) setEdges(imported.definition.edges);
          if (imported.definition.viewport) setViewport(imported.definition.viewport);
          alert('Workflow imported successfully!');
        } else {
          alert('Invalid workflow file format');
        }
      } catch (error) {
        console.error('Failed to import workflow:', error);
        alert('Failed to import workflow. Please check the file format.');
      }
    };
    input.click();
  };

  const executeMutation = useMutation({
    mutationFn: async (data: { workflowId: string; definition: any; input: any }) => {
      const response = await api.post('/executions/execute', data);
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Execution started:', data);
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows.executions(id || '') });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      setExecutionId(data.id);
      setShowMonitor(true);
    },
    onError: (error) => {
      console.error('Failed to execute workflow:', error);
      alert('Failed to execute workflow. Please check the console for details.');
    },
  });

  // Handle WebSocket events for real-time visualization
  useEffect(() => {
    if (!executionId) {
      // Reset execution state when no execution
      setExecutingNodes(new Set());
      setCompletedNodes(new Set());
      setErrorNodes(new Set());
      setActiveEdges(new Set());
      return;
    }

    const unsubscribeNodeStart = onEvent('node_start', (event: ExecutionEvent) => {
      if (event.nodeId) {
        setExecutingNodes((prev) => new Set(prev).add(event.nodeId!));
        setErrorNodes((prev) => {
          const next = new Set(prev);
          next.delete(event.nodeId!);
          return next;
        });
      }
    });

    const unsubscribeNodeComplete = onEvent('node_complete', (event: ExecutionEvent) => {
      if (event.nodeId) {
        setExecutingNodes((prev) => {
          const next = new Set(prev);
          next.delete(event.nodeId!);
          return next;
        });
        setCompletedNodes((prev) => new Set(prev).add(event.nodeId!));
        
        // Animate edges from this node
        const outgoingEdges = edges.filter((e) => e.source === event.nodeId);
        setActiveEdges((prev) => {
          const next = new Set(prev);
          outgoingEdges.forEach((edge) => next.add(edge.id));
          return next;
        });

        // Clear edge animation after a delay
        setTimeout(() => {
          setActiveEdges((prev) => {
            const next = new Set(prev);
            outgoingEdges.forEach((edge) => next.delete(edge.id));
            return next;
          });
        }, 2000);
      }
    });

    const unsubscribeNodeError = onEvent('node_error', (event: ExecutionEvent) => {
      if (event.nodeId) {
        setExecutingNodes((prev) => {
          const next = new Set(prev);
          next.delete(event.nodeId!);
          return next;
        });
        setErrorNodes((prev) => new Set(prev).add(event.nodeId!));
      }
    });

    const unsubscribeExecutionComplete = onEvent('execution_complete', () => {
      // Clear all executing nodes
      setExecutingNodes(new Set());
    });

    return () => {
      unsubscribeNodeStart();
      unsubscribeNodeComplete();
      unsubscribeNodeError();
      unsubscribeExecutionComplete();
    };
  }, [executionId, edges, onEvent]);

  const handleExecute = () => {
    // Validate workflow has nodes
    if (nodes.length === 0) {
      alert('Please add at least one node to the workflow before executing.');
      return;
    }

    const workflowDefinition = {
      nodes,
      edges,
    };

    executeMutation.mutate({
      workflowId: id || 'new',
      definition: workflowDefinition,
      input: {},
    });
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 animate-fade-in">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold mb-1 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent">
              {workflowName || (!id || id === 'new' ? 'New Workflow' : `Workflow ${id}`)}
            </h1>
            {workflowDescription && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{workflowDescription}</p>
            )}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
          {/* Keyboard Shortcuts Info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mr-4 hidden lg:block">
            <span>Shortcuts: </span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono">Ctrl+Z</kbd>
            <span className="mx-1">/</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono">Ctrl+C</kbd>
            <span className="mx-1">/</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono">Del</kbd>
          </div>
          
          {/* Undo/Redo Buttons */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
          
          <button
            onClick={handleExecute}
            disabled={executeMutation.isPending}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
            ▶ Run
          </button>
          {isConnected && executionId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Live</span>
            </div>
          )}
          <button
            onClick={handleCreateGroup}
            className={`px-3 py-2 rounded-lg transition-all duration-200 font-medium ${
              isCreatingGroup
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="Create group (drag to select nodes)"
          >
            📦 Group
          </button>
          <button
            onClick={() => setShowWorkflowSettings(!showWorkflowSettings)}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
            title="Workflow settings"
          >
            ⚙️ Settings
          </button>
          <button
            onClick={handleSave}
              disabled={saveMutation.isPending}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
          >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          
          {/* Import/Export */}
          <button
            onClick={handleImport}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
            title="Import workflow"
          >
            📥 Import
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
            title="Export workflow"
          >
            📤 Export
          </button>
          
          {/* Execution History */}
          {id && id !== 'new' && (
            <button
              onClick={async () => {
                if (!showExecutionHistory) {
                  try {
                    const response = await api.get(`/executions/workflow/${id}`);
                    setExecutionHistory(response.data);
                  } catch (error) {
                    console.error('Failed to load execution history:', error);
                  }
                }
                setShowExecutionHistory(!showExecutionHistory);
              }}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
              title="View execution history"
            >
              📊 History
            </button>
          )}
          
          {/* Versions */}
          {id && id !== 'new' && (
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
              title="View versions"
            >
              📚 Versions
            </button>
          )}
          </div>
        </div>

        {/* Workflow Settings Panel */}
        {showWorkflowSettings && (
          <div className="mt-4 p-6 bg-white dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm animate-slide-up">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Workflow Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Enter workflow name"
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 dark:focus:border-indigo-500/50 transition-all duration-200 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Enter workflow description"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 dark:focus:border-indigo-500/50 transition-all duration-200 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Enter tag and press Enter"
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 dark:focus:border-indigo-500/50 transition-all duration-200 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-md hover:shadow-lg"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workflowTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full text-sm font-medium"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors duration-200"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex border border-gray-200/50 dark:border-gray-700/50 rounded-xl bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
        {/* Node Palette */}
        <NodePalette onAddNode={handleAddNode} />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes.map((node) => ({
              ...node,
              data: {
                ...node.data,
                isExecuting: executingNodes.has(node.id),
                isCompleted: completedNodes.has(node.id),
                hasError: errorNodes.has(node.id),
              },
            }))}
            edges={edges.map((edge) => ({
              ...edge,
              animated: activeEdges.has(edge.id),
              style: activeEdges.has(edge.id)
                ? { stroke: '#10b981', strokeWidth: 3 }
                : undefined,
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: activeEdges.has(edge.id) ? '#10b981' : '#6b7280',
              },
            }))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onPaneMouseDown={handleGroupMouseDown}
            onPaneMouseUp={handleGroupMouseUp}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            deleteKeyCode={null} // Disable default delete to use our handler
          >
            <Background variant="dots" gap={12} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => {
                if (node.selected) return '#3b82f6';
                if (node.data?.type?.startsWith('trigger.')) return '#10b981';
                if (node.data?.type?.startsWith('logic.')) return '#8b5cf6';
                return '#94a3b8';
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
            </ReactFlow>
          
          {/* Render Groups as Overlay */}
          {groups.map((group) => (
            <div
              key={group.id}
              className={`absolute border-2 rounded-lg cursor-pointer ${
                selectedGroup?.id === group.id ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{
                left: `${group.position.x}px`,
                top: `${group.position.y}px`,
                width: `${group.size.width}px`,
                height: `${group.size.height}px`,
                backgroundColor: group.style?.backgroundColor || 'rgba(243, 244, 246, 0.5)',
                borderColor: group.style?.borderColor || (selectedGroup?.id === group.id ? '#3b82f6' : '#d1d5db'),
                borderWidth: `${group.style?.borderWidth || 2}px`,
                pointerEvents: 'none',
                zIndex: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedGroup(group);
              }}
            >
              {/* Group Label */}
              <div
                className="absolute -top-6 left-0 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 pointer-events-auto shadow-sm"
                style={{ minWidth: '100px' }}
              >
                {group.label}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGroup(group.id);
                  }}
                  className="ml-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors duration-200"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          
          {/* Group Creation Preview */}
          {isCreatingGroup && groupStartPos && (
            <div
              className="absolute border-2 border-dashed border-blue-500 bg-blue-50 bg-opacity-30 pointer-events-none"
              style={{
                left: `${groupStartPos.x}px`,
                top: `${groupStartPos.y}px`,
                width: '0px',
                height: '0px',
                zIndex: 1000,
              }}
            />
          )}
          </div>

        {/* Node Config Panel */}
        {showConfig && selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleUpdateNode}
            onClose={() => setShowConfig(false)}
          />
        )}

        {/* Execution Monitor */}
        {showMonitor && executionId && (
          <ExecutionMonitor
            executionId={executionId}
            onClose={() => setShowMonitor(false)}
          />
        )}

        {/* Execution History */}
        {showExecutionHistory && id && id !== 'new' && (
          <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Execution History</h2>
              <button
                onClick={() => setShowExecutionHistory(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {executionHistory.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm">No executions yet</div>
              ) : (
                <div className="space-y-2">
                  {executionHistory.map((execution) => (
                    <div
                      key={execution.id}
                      className="p-3 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => {
                        setExecutionId(execution.id);
                        setShowMonitor(true);
                        setShowExecutionHistory(false);
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          execution.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                          execution.status === 'failed' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                          execution.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                        }`}>
                          {execution.status}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(execution.startedAt).toLocaleString()}
                        </span>
                      </div>
                      {execution.finishedAt && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Duration: {Math.round((new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)}s
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workflow Versions */}
        {showVersions && id && id !== 'new' && (
          <WorkflowVersions
            workflowId={id}
            onVersionRestore={() => {
              loadWorkflow(id);
              setShowVersions(false);
            }}
            onClose={() => setShowVersions(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function WorkflowBuilder() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderContent />
    </ReactFlowProvider>
  );
}
