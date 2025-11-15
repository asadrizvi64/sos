import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nodeRegistry, getAllNodes, NodeDefinition, registerConnectorNode } from '../lib/nodes/nodeRegistry';
import api from '../lib/api';

interface NodePaletteProps {
  onAddNode: (nodeType: string, position: { x: number; y: number }) => void;
}

interface ConnectorManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  actions: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

const categories = [
  { id: 'trigger', name: 'Triggers', icon: '⚡' },
  { id: 'action', name: 'Actions', icon: '🔧' },
  { id: 'ai', name: 'AI', icon: '🤖' },
  { id: 'code', name: 'Code', icon: '💻' },
  { id: 'logic', name: 'Logic', icon: '🔀' },
  { id: 'data', name: 'Data', icon: '📊' },
  { id: 'communication', name: 'Communication', icon: '📧' },
  { id: 'integration', name: 'Integrations', icon: '🔌' },
];

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch connectors from backend
  const { data: connectors = [] } = useQuery<ConnectorManifest[]>({
    queryKey: ['connectors'],
    queryFn: async () => {
      try {
        const response = await api.get('/connectors');
        return response.data;
      } catch (error) {
        console.error('Failed to fetch connectors:', error);
        return [];
      }
    },
  });

  // Generate integration nodes from connectors
  const integrationNodes = useMemo(() => {
    const nodes: NodeDefinition[] = [];
    
    connectors.forEach((connector) => {
      // Create a node for each action in the connector
      connector.actions.forEach((action) => {
        const nodeType = `integration.${connector.id}`;
        const nodeDef: NodeDefinition = {
          type: nodeType,
          name: `${connector.name}: ${action.name}`,
          description: action.description || connector.description,
          category: 'integration',
          icon: 'plug',
          inputs: [],
          outputs: [
            { name: 'output', type: 'object', description: 'Action output' },
            { name: 'success', type: 'boolean', description: 'Operation success' },
          ],
          config: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [action.id],
                default: action.id,
                description: 'Action to execute',
              },
            },
            required: ['action'],
          },
        };
        nodes.push(nodeDef);
        // Register in nodeRegistry for getNodeDefinition to work
        registerConnectorNode(nodeDef);
      });
    });
    
    return nodes;
  }, [connectors]);

  // Combine hardcoded nodes with dynamic integration nodes
  const allNodes = useMemo(() => {
    const hardcodedNodes = getAllNodes();
    // Filter out existing integration nodes to avoid duplicates
    const existingIntegrationTypes = new Set(
      hardcodedNodes.filter(n => n.category === 'integration').map(n => n.type)
    );
    const newIntegrationNodes = integrationNodes.filter(
      n => !existingIntegrationTypes.has(n.type)
    );
    return [...hardcodedNodes, ...newIntegrationNodes];
  }, [integrationNodes]);

  const filteredNodes = allNodes.filter((node) => {
    const matchesCategory = !selectedCategory || node.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleNodeClick = (nodeType: string) => {
    // Add node at center of viewport (will be adjusted by React Flow)
    onAddNode(nodeType, { x: 250, y: 250 });
  };

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Node Palette</h2>
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() =>
              setSelectedCategory(selectedCategory === category.id ? null : category.id)
            }
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap ${
              selectedCategory === category.id
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {category.icon} {category.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filteredNodes.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8">
            No nodes found
          </div>
        ) : (
          <div className="space-y-1">
            {filteredNodes.map((node, index) => {
              // Use a unique key - combine type with name to handle multiple actions per connector
              const uniqueKey = node.type.startsWith('integration.') 
                ? `${node.type}-${node.name}-${index}` 
                : node.type;
              return (
                <button
                  key={uniqueKey}
                  onClick={() => handleNodeClick(node.type)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
                  title={node.description}
                >
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{node.name}</div>
                  {node.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                      {node.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

