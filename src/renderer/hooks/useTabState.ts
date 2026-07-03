import { useState, useCallback, useRef, useEffect } from 'react'
import type { SplitNode, Tab } from '../../types'

// ── Helpers ────────────────────────────────────────────

let nextTabId = 0
function generateTabId(): string {
  return `tab_${++nextTabId}`
}

let nextLeafId = 0
function generateLeafId(): string {
  return `leaf_${++nextLeafId}`
}

function createLeaf(): SplitNode {
  return { type: 'leaf', id: generateLeafId() }
}

/**
 * Walk a split tree to collect all leaf IDs (used to derive terminal IDs).
 */
function collectLeafIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return [...collectLeafIds(node.children[0]), ...collectLeafIds(node.children[1])]
}

export interface TabStateOptions {
  /** Called when a tab is about to be closed — handle PTY cleanup here. */
  onCleanupTab?: (terminalIds: string[]) => void
}

/**
 * useTabState — manages a list of tabs, each with its own layout tree.
 *
 * - createTab(): adds a new tab with a fresh full-screen leaf.
 * - closeTab(id): removes the tab. When the last tab is closed, tabs becomes
 *   empty and the caller (App.tsx) renders the empty state UI.
 * - switchTab(id): switches to a different tab, preserving the current tree.
 * - activeTab: the currently selected tab.
 * - setActiveTree: call this when the split pane tree changes (saves it to active tab).
 */
export function useTabState(options?: TabStateOptions) {
  const initialTabId = generateTabId()
  const [tabs, setTabs] = useState<Tab[]>([
    { id: initialTabId, title: 'Terminal 1', tree: createLeaf() },
  ])
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId)

  // Ref to hold the current render cycle's active tab tree
  // Prevents stale closures in callbacks
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // Ref to pass close-tab context from setTabs updater to useEffect
  const closeInfoRef = useRef<{ wasActive: boolean; index: number } | null>(null)

  const setActiveTree = useCallback((tree: SplitNode) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, tree } : t)),
    )
  }, [activeTabId])

  const createTab = useCallback(() => {
    const newTab: Tab = {
      id: generateTabId(),
      title: `Terminal ${tabsRef.current.length + 1}`,
      tree: createLeaf(),
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    // Clean up PTY processes for the tab being closed
    const tabToClose = tabsRef.current.find((t) => t.id === id)
    if (tabToClose) {
      try {
        const leafIds = collectLeafIds(tabToClose.tree)
        const terminalIds = leafIds.map((lid) => `${lid}_term`)
        options?.onCleanupTab?.(terminalIds)
      } catch (err) {
        console.error('[useTabState] PTY cleanup failed:', err)
      }
    }

    setTabs((prev) => {
      const index = prev.findIndex((t) => t.id === id)
      closeInfoRef.current = { wasActive: id === activeTabId, index }
      return prev.filter((t) => t.id !== id)
    })
  }, [activeTabId, options])

  // If active tab was removed (via closeTab), switch to nearest neighbor
  useEffect(() => {
    const info = closeInfoRef.current
    if (info && info.wasActive && tabs.length > 0) {
      const newIndex = Math.min(info.index, tabs.length - 1)
      setActiveTabId(tabs[newIndex].id)
    } else if (tabs.length > 0 && !tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id)
    }
    closeInfoRef.current = null
  }, [tabs, activeTabId])

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const renameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t)),
    )
  }, [])

  return {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    switchTab,
    setActiveTree,
    renameTab,
  }
}
