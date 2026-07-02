import { useCallback } from 'react'
import { Cell } from './Cell'
import type { SplitNode, SplitDirection } from '../../types'

// ── Helpers ────────────────────────────────────────────

let nextId = 0
function generateId(): string {
  return `leaf_${++nextId}`
}

function createLeaf(): SplitNode {
  return { type: 'leaf', id: generateId() }
}

/**
 * Replace a leaf node identified by targetId with a split branch.
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

  return {
    ...node,
    children: [
      replaceLeaf(node.children[0], targetId, direction),
      replaceLeaf(node.children[1], targetId, direction),
    ],
  }
}

// ── Component ──────────────────────────────────────────

interface SplitPaneProps {
  tree: SplitNode
  onTreeChange: (tree: SplitNode) => void
}

/**
 * SplitPane — controlled binary tree split pane layout engine.
 *
 * - `tree`: the current node tree.
 * - `onTreeChange`: called when a split occurs.
 *
 * Each leaf renders a <Cell> which can show Terminal or AI Chat.
 */
export function SplitPane({ tree, onTreeChange }: SplitPaneProps) {
  const handleSplit = useCallback(
    (targetId: string, direction: SplitDirection) => {
      onTreeChange(replaceLeaf(tree, targetId, direction))
    },
    [tree, onTreeChange],
  )

  return <SplitPaneNode node={tree} onSplit={handleSplit} />
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
        <Cell leafId={node.id} />
        {/* Split buttons — hover reveal */}
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
    <div className={`split-branch split-${node.direction}`}>
      <SplitPaneNode node={node.children[0]} onSplit={onSplit} />
      <div className="split-divider" />
      <SplitPaneNode node={node.children[1]} onSplit={onSplit} />
    </div>
  )
}

export default SplitPane
