import { useState } from 'react';
import { useModals } from '../lib/modals';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileNode[];
}

interface FileTreeProps {
  files: FileNode[];
  selectedFile?: string;
  onSelectFile?: (path: string) => void;
  onAddFile?: (path: string, type: 'file' | 'folder') => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
}

export default function FileTree({
  files,
  selectedFile,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const { prompt, confirm } = useModals();

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderNode = (node: FileNode, path: string = '', depth: number = 0): JSX.Element => {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    const isExpanded = expandedFolders.has(fullPath);
    const isSelected = selectedFile === fullPath;
    const isEditing = editingFile === fullPath;

    if (node.type === 'folder') {
      return (
        <div key={fullPath}>
          <div
            className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
              isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => toggleFolder(fullPath)}
          >
            <span className="text-gray-500 dark:text-gray-400">
              {isExpanded ? '📂' : '📁'}
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{node.name}</span>
            {onAddFile && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const newPath = await prompt('Enter file/folder name:', 'New File/Folder', '', 'Enter file/folder name');
                  if (newPath) {
                    onAddFile(`${fullPath}/${newPath}`, 'file');
                  }
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                +
              </button>
            )}
          </div>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, fullPath, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div
          key={fullPath}
          className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
            isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFile?.(fullPath)}
        >
          <span className="text-gray-500 dark:text-gray-400">📄</span>
          {isEditing ? (
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onBlur={() => {
                if (newFileName && newFileName !== node.name) {
                  onRenameFile?.(fullPath, newFileName);
                }
                setEditingFile(null);
                setNewFileName('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (newFileName && newFileName !== node.name) {
                    onRenameFile?.(fullPath, newFileName);
                  }
                  setEditingFile(null);
                  setNewFileName('');
                } else if (e.key === 'Escape') {
                  setEditingFile(null);
                  setNewFileName('');
                }
              }}
              className="flex-1 text-sm bg-white dark:bg-gray-900 border border-blue-500 rounded px-1"
              autoFocus
            />
          ) : (
            <>
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{node.name}</span>
              {onDeleteFile && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const confirmed = await confirm(`Delete ${node.name}?`, 'Confirm Delete', 'danger');
                    if (confirmed) {
                      onDeleteFile(fullPath);
                    }
                  }}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  ×
                </button>
              )}
              {onRenameFile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFile(fullPath);
                    setNewFileName(node.name);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ✎
                </button>
              )}
            </>
          )}
        </div>
      );
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="p-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Files</h3>
          {onAddFile && (
            <button
              onClick={async () => {
                const newPath = await prompt('Enter file name:', 'New File', '', 'Enter file name');
                if (newPath) {
                  onAddFile(newPath, 'file');
                }
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Add File
            </button>
          )}
        </div>
        <div className="space-y-1">
          {files.map((file) => renderNode(file))}
        </div>
      </div>
    </div>
  );
}

