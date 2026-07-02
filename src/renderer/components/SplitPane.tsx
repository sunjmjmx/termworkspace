import { useReducer, useCallback } from 'react'
import { Terminal } from './Terminal'
import type { SplitNode, SplitDirection } from '../../types'

// ── Action types ───────────────────────────────────────

type SplitAction =
  | { type: 'SPLIT'; targetId: string; direction: SplitDirection }

// ── Helpers ────────────────────────────────────────────

let nextId = 0
function generateId(): string {
  return `term_${++nextId}`
}

function createLeaf(): SplitNode {
  return { type: 'leaf', id: generateId() }
}

/**
 * Replace a leaf node identified by targetId with a split branch.
 * Recursively walks the tree to find and replace the target.
 */
function replaceLeaf(node: SplitNode, targetId: string, direction: SplitDirection): SplitNode {
  if (node.type === 'leaf') {
    if (node.id === targetId) {
      return {
        type: 'split',
        direction,
        children: [createLeaf(), createLeaf()],
      }
    }
    return node
  }

  // Branch node — recurse into children
  return {
    ...node,
    children: [
      replaceLeaf(node.children[0], targetId, direction),
      replaceLeaf(node.children[1], targetId, direction),
    ],
  }
}

// ── Reducer ────────────────────────────────────────────

function splitReducer(state: SplitNode, action: SplitAction): SplitNode {
  switch (action.type) {
    case 'SPLIT':
      return replaceLeaf(state, action.targetId, action.direction)
    default:
      return state
  }
}

// ── Component ──────────────────────────────────────────

interface SplitPaneProps {
  /** Initial node tree (defaults to a single leaf) */
  initialTree?: SplitNode
}

/**
 * SplitPane — recursive binary tree split pane layout engine.
 *
 * Root node starts as a single leaf (full-screen terminal).
 * Call onSplit(targetId, direction) to split a leaf into two.
 */
export function SplitPane({ initialTree }: SplitPaneProps) {
  const [tree, dispatch] = useReducer(
    splitReducer,
    initialTree ?? createLeaf(),
  )

  const onSplit = useCallback((targetId: string, direction: SplitDirection) => {
    dispatch({ type: 'SPLIT', targetId, direction })
  }, [])

  return <SplitPaneNode node={tree} onSplit={onSplit} />
}

// ── Internal recursive renderer ────────────────────────

interface SplitPaneNodeProps {
  node: SplitNode
  onSplit: (targetId: string, direction: SplitDirection) => void
}

function SplitPaneNode({ node, onSplit }: SplitPaneNodeProps) {
  if (node.type === 'leaf') {
    return (
      <div className="split-leaf">
        <Terminal terminalId={node.id} />
        {/* Split buttons — temporarily visible for testing */}
        <div className="split-buttons">
          <button
            className="split-btn split-btn-h"
            title="Split horizontally (left/right)"
            onClick={() => onSplit(node.id, 'horizontal')}
          >
            ⊞ H
          </button>
          <button
            className="split-btn split-btn-v"
            title="Split vertically (top/bottom)"
            onClick={() => onSplit(node.id, 'vertical')}
          >
            ⊞ V
          </button>
        </div>
      </div>
    )
  }

  // Branch node — render children in a flex container
  return (
    <div
      className={`split-branch split-${node.direction}`}
    >
      <SplitPaneNode node={node.children[0]} onSplit={onSplit} />
      <div className="split-divider" />
      <SplitPaneNode node={node.children[1]} onSplit={onSplit} />
    </div>
  )
}

export default SplitPane
