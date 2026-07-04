import { useCallback } from 'react'
import { Cell } from './Cell'
import type { SplitNode, SplitDirection, ThemeMode } from '../../types'

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
 * Exported for testing.
 */
export function replaceLeaf(node: SplitNode, targetId: string, direction: SplitDirection): SplitNode {
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

/**
 * Count total leaves in a split tree.
 */
export function countLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

/**
 * Remove a leaf node identified by targetId from the tree.
 * Auto-flattens: when a split node is left with only one child,
 * that child replaces the split (promotion).
 *
 * Returns the new tree, or null if the last leaf is removed
 * (caller should guard against this case).
 * Exported for testing.
 */
export function removeLeaf(node: SplitNode, targetId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.id === targetId ? null : node
  }

  const left = removeLeaf(node.children[0], targetId)
  const right = removeLeaf(node.children[1], targetId)

  // No change — tree unmodified
  if (left === node.children[0] && right === node.children[1]) {
    return node
  }

  // One or both children changed
  if (left && right) {
    // Both alive — return updated split
    return { ...node, children: [left, right] }
  }

  // One child was removed — flatten: promote the surviving child
  return left ?? right
}

// ── Component ──────────────────────────────────────────

interface SplitPaneProps {
  tree: SplitNode
  onTreeChange: (tree: SplitNode) => void
  theme: ThemeMode
  projectPath?: string
}

/**
 * SplitPane — controlled binary tree split pane layout engine.
 *
 * - `tree`: the current node tree.
 * - `onTreeChange`: called when a split or remove occurs.
 *
 * Each leaf renders a <Cell> which can show Terminal or AI Chat.
 */
export function SplitPane({ tree, onTreeChange, theme, projectPath }: SplitPaneProps) {
  const totalLeaves = countLeaves(tree)

  const handleSplit = useCallback(
    (targetId: string, direction: SplitDirection) => {
      onTreeChange(replaceLeaf(tree, targetId, direction))
    },
    [tree, onTreeChange],
  )

  const handleRemove = useCallback(
    (targetId: string) => {
      const newTree = removeLeaf(tree, targetId)
      if (newTree) {
        onTreeChange(newTree)
      }
    },
    [tree, onTreeChange],
  )

  return (
    <SplitPaneNode
      node={tree}
      onSplit={handleSplit}
      onRemove={handleRemove}
      showCloseButton={totalLeaves > 1}
      theme={theme}
      projectPath={projectPath}
    />
  )
}

// ── Internal recursive renderer ────────────────────────

interface SplitPaneNodeProps {
  node: SplitNode
  onSplit: (targetId: string, direction: SplitDirection) => void
  onRemove: (targetId: string) => void
  showCloseButton: boolean
  theme: ThemeMode
  projectPath?: string
}

function SplitPaneNode({ node, onSplit, onRemove, showCloseButton, theme, projectPath }: SplitPaneNodeProps) {
  if (node.type === 'leaf') {
    return (
      <div className="split-leaf">
        {showCloseButton && (
          <button
            className="split-close-btn"
            title="Close pane"
            onClick={() => onRemove(node.id)}
          >
            ✕
          </button>
        )}
        <Cell leafId={node.id} theme={theme} projectPath={projectPath} />
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
      <SplitPaneNode node={node.children[0]} onSplit={onSplit} onRemove={onRemove} showCloseButton={showCloseButton} theme={theme} projectPath={projectPath} />
      <div className="split-divider" />
      <SplitPaneNode node={node.children[1]} onSplit={onSplit} onRemove={onRemove} showCloseButton={showCloseButton} theme={theme} projectPath={projectPath} />
    </div>
  )
}

export default SplitPane
