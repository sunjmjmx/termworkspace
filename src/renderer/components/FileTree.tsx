import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileTreeEntry, ThemeMode } from '../../types'

// ── TreeNode for internal state ───────────────────────────

interface TreeNode {
  entry: FileTreeEntry
  expanded: boolean
  children: TreeNode[]
  loaded: boolean
}

// ── Helpers ───────────────────────────────────────────────

function createNode(entry: FileTreeEntry): TreeNode {
  return { entry, expanded: false, children: [], loaded: false }
}

/**
 * Sort: directories first, then alphabetically.
 */
function sortEntries(entries: FileTreeEntry[]): FileTreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Load a directory via IPC (event-based: send → on → result).
 * Returns a promise that resolves with the entries or [].
 */
function readDir(dirPath: string): Promise<FileTreeEntry[]> {
  return new Promise((resolve) => {
    const api = window.electronAPI
    if (!api) return resolve([])

    const handler = (raw: unknown) => {
      const entries = raw as FileTreeEntry[]
      api.removeAllListeners('filetree:readdir-result')
      resolve(entries ?? [])
    }
    api.on('filetree:readdir-result', handler)
    api.send('filetree:readdir', dirPath)

    // Timeout fallback
    setTimeout(() => {
      api.removeAllListeners('filetree:readdir-result')
      resolve([])
    }, 3000)
  })
}

// ── Props ─────────────────────────────────────────────────

interface FileTreeProps {
  theme: ThemeMode
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenFolder?: () => void
  activeTerminalId: string
  projectPath: string
}

export function FileTree({ theme, collapsed, onToggleCollapse, onOpenFolder, activeTerminalId, projectPath }: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // We keep a mutable ref so toggleNode can update state without stale closures
  const nodeMapRef = useRef<Map<string, TreeNode>>(new Map())

  // ── Load / reload when projectPath changes ─────────────
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError(null)
      const entries = await readDir(projectPath)
      if (cancelled) return
      const sorted = sortEntries(entries)
      const nodes = sorted.map(createNode)
      // Build node map for O(1) lookup
      const map = new Map<string, TreeNode>()
      for (const n of nodes) map.set(n.entry.path, n)
      nodeMapRef.current = map
      setRootNodes(nodes)
      setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [projectPath])

  // ── Toggle a node (expand/collapse dir, or open file) ──
  const handleNodeClick = useCallback(async (node: TreeNode) => {
    if (!node.entry.isDirectory) {
      // File — output path to active terminal
      const api = window.electronAPI
      if (api && activeTerminalId) {
        api.send('filetree:open-file', activeTerminalId, node.entry.path)
      }
      return
    }

    // Directory — toggle expand
    if (!node.loaded) {
      const childrenEntries = await readDir(node.entry.path)
      const sorted = sortEntries(childrenEntries)
      node.children = sorted.map(createNode)
      node.loaded = true
      // Register children in the node map
      for (const child of node.children) {
        nodeMapRef.current.set(child.entry.path, child)
      }
    }

    node.expanded = !node.expanded
    // Force re-render by cloning root nodes array
    setRootNodes((prev) => [...prev])
  }, [activeTerminalId])

  // ── Render a single tree node ──────────────────────────
  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const indent = depth * 16

    return (
      <div key={node.entry.path}>
        <div
          className={`filetree-node ${node.entry.isDirectory ? 'filetree-dir' : 'filetree-file'}`}
          style={{ paddingLeft: `${12 + indent}px` }}
          onClick={() => handleNodeClick(node)}
          title={node.entry.path}
        >
          <span className="filetree-icon">
            {node.entry.isDirectory
              ? (node.expanded ? '▼' : '▶')
              : '·'}
          </span>
          <span className="filetree-name">{node.entry.name}</span>
        </div>
        {node.expanded && node.entry.isDirectory && (
          <div className="filetree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
            {!node.loaded && (
              <div
                className="filetree-node filetree-loading"
                style={{ paddingLeft: `${12 + indent + 16}px` }}
              >
                <span className="filetree-name">Loading...</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className={`filetree-sidebar ${collapsed ? 'filetree-collapsed' : ''}`}>
      {/* Header */}
      <div className="filetree-header">
        <div className="filetree-header-left">
          {!collapsed && (
            <button
              className="filetree-open-btn"
              onClick={onOpenFolder}
              title="更换项目文件夹"
            >
              📁
            </button>
          )}
          <span className="filetree-title">
            {collapsed ? '📂' : 'Explorer'}
          </span>
        </div>
        <button
          className="filetree-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Tree content */}
      <div className="filetree-content">
        {error ? (
          <div className="filetree-error">{error}</div>
        ) : loading ? (
          <div className="filetree-loading-msg">Loading...</div>
        ) : rootNodes.length === 0 ? (
          <div className="filetree-empty">(empty)</div>
        ) : (
          rootNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  )
}

export default FileTree
