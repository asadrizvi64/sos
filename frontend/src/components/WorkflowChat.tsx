import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useModals } from '../lib/modals';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
}

interface WorkflowChatProps {
  onNodesGenerated: (nodes: Array<{ type: string; config: Record<string, unknown>; position: { x: number; y: number } }>) => void;
  onClose: () => void;
}

export default function WorkflowChat({ onNodesGenerated, onClose }: WorkflowChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! I can help you create workflows. Describe what you want to automate, and I\'ll suggest the nodes to add. For example: "Create a workflow that sends an email when a new file is uploaded to Google Drive"',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { alert } = useModals();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateWorkflowMutation = useMutation({
    mutationFn: async (description: string) => {
      // Use the AI agent service to generate workflow suggestions
      const response = await api.post('/agents/execute', {
        query: `You are a workflow automation expert. Generate a workflow based on this description: "${description}". 

IMPORTANT: Return ONLY a valid JSON array of nodes. Do not include any explanation text before or after the JSON.

Return a JSON array with this exact structure:
[
  {
    "type": "node_type",
    "config": { "key": "value" },
    "description": "what this node does"
  }
]

Available node types:
- Triggers: trigger.manual, trigger.webhook, trigger.schedule, trigger.email.gmail, trigger.email.outlook
- Actions: action.code.javascript, action.code.python, action.web_scrape, action.http_request
- AI: ai.llm, ai.agent, ai.rag, ai.embedding, ai.vector_store
- Logic: logic.if, logic.loop.while, logic.loop.foreach, logic.merge, logic.switch
- Data: data.transform, data.filter, data.map
- Integration: integration.slack, integration.airtable, integration.google_sheets (use actual connector IDs)

Be specific about node types and include realistic config values.`,
        agentType: 'auto',
        useRouting: true,
      });
      return response.data;
    },
    onSuccess: (data) => {
      const responseText = data.response || data.content || data.output || '';
      let parsedNodes: any[] = [];
      let parseError: string | null = null;
      
      // Try multiple parsing strategies
      try {
        // Strategy 1: Direct JSON parse
        parsedNodes = JSON.parse(responseText);
      } catch {
        try {
          // Strategy 2: Extract JSON from markdown code blocks
          const codeBlockMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (codeBlockMatch) {
            parsedNodes = JSON.parse(codeBlockMatch[1]);
          } else {
            // Strategy 3: Extract JSON array from text
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              parsedNodes = JSON.parse(jsonMatch[0]);
            }
          }
        } catch (error: any) {
          parseError = error.message;
        }
      }
      
      // Validate parsed nodes
      if (Array.isArray(parsedNodes) && parsedNodes.length > 0) {
        // Validate node structure
        const validNodes = parsedNodes.filter((node: any) => 
          node && typeof node === 'object' && node.type
        );
        
        if (validNodes.length > 0) {
          const assistantMessage: Message = {
            id: `assistant_${Date.now()}`,
            role: 'assistant',
            content: `I've generated a workflow with ${validNodes.length} node(s). Click "Add to Canvas" to add them to your workflow.`,
            timestamp: new Date(),
          };
          (assistantMessage as any).nodes = validNodes;
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          const errorMessage: Message = {
            id: `error_${Date.now()}`,
            role: 'assistant',
            content: `I couldn't parse the workflow nodes from the response. Please try rephrasing your request or describe the workflow in more detail.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } else {
        // If parsing failed, show the raw response with helpful message
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: responseText || 'I received a response but couldn\'t parse it as a workflow. Please try rephrasing your request with more specific details about the workflow steps.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    },
    onError: (error: any) => {
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.response?.data?.error || error.message || 'Unknown error'}. 

Please try:
- Rephrasing your request with more specific details
- Breaking down complex workflows into simpler steps
- Ensuring the AI agent service is properly configured`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || generateWorkflowMutation.isPending) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    generateWorkflowMutation.mutate(input);
  };

  const handleAddToCanvas = (message: Message) => {
    const nodes = (message as any).nodes;
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      alert('No workflow nodes found in this message. Please try asking again with more specific details about the workflow steps you need.');
      return;
    }

    // Validate and filter nodes
    const validNodes = nodes
      .filter((node: any) => node && typeof node === 'object' && node.type)
      .map((node: any, index: number) => ({
        type: node.type || 'action.code.javascript',
        config: node.config || {},
        position: {
          x: 100 + (index % 3) * 300,
          y: 100 + Math.floor(index / 3) * 200,
        },
      }));

    if (validNodes.length === 0) {
      alert('No valid workflow nodes found. Please try rephrasing your request.');
      return;
    }

    onNodesGenerated(validNodes);
    alert(`✅ Added ${validNodes.length} node(s) to the canvas! You can now configure and connect them.`);
  };

  return (
    <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">💬 Chat to Create</h2>
        <button
          onClick={onClose}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              {(message as any).nodes && Array.isArray((message as any).nodes) && (
                <button
                  onClick={() => handleAddToCanvas(message)}
                  className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded transition-colors"
                >
                  ➕ Add to Canvas
                </button>
              )}
            </div>
          </div>
        ))}
        {generateWorkflowMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your workflow..."
            className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={generateWorkflowMutation.isPending}
          />
          <button
            type="submit"
            disabled={!input.trim() || generateWorkflowMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

