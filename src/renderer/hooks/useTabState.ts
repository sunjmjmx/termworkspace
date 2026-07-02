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
 * useTabState — manages a list of tabs, each with its own layout tree.
 *
 * - createTab(): adds a new tab with a fresh full-screen leaf.
 * - closeTab(id): removes the tab (won't close the last one).
 * - switchTab(id): switches to a different tab, preserving the current tree.
 * - activeTab: the currently selected tab.
 * - setActiveTree: call this when the split pane tree changes (saves it to active tab).
 */
export function useTabState() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: generateTabId(), title: 'Terminal 1', tree: createLeaf() },
  ])
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id)

  // Ref to hold the current render cycle's active tab tree
  // Prevents stale closures in callbacks
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // Ref to pass close-tab context from setTabs updater to useEffect
  const closeInfoRef = useRef<{ wasActive: boolean; index: number } | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  // Called by SplitPane when the tree changes (user splits a pane)
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
    setTabs((prev) => {
      if (prev.length <= 1) return prev // Don't close the last tab
      const index = prev.findIndex((t) => t.id === id)
      closeInfoRef.current = { wasActive: id === activeTabId, index }
      return prev.filter((t) => t.id !== id)
    })
  }, [activeTabId])

  // If active tab was removed (via closeTab), switch to nearest neighbor
  useEffect(() => {
    const info = closeInfoRef.current
    closeInfoRef.current = null
    if (info && info.wasActive && tabs.length > 0) {
      const newIndex = Math.min(info.index, tabs.length - 1)
      setActiveTabId(tabs[newIndex].id)
    } else if (tabs.length > 0 && !tabs.some((t) => t.id === activeTabId)) {
      // Fallback: active tab was removed externally (edge case)
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const renameTab = useCallback((id: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t)),
    )
  }, [])

  /**
   * restoreTabs — replace entire tab state from persisted layout.
   * Resets the tab counter so new tabs don't collide with restored IDs.
   */
  const restoreTabs = useCallback((newTabs: Tab[], activeId: string) => {
    // Reset counters to avoid collisions with restored IDs
    nextTabId = 0
    nextLeafId = 0
    setTabs(newTabs)
    setActiveTabId(activeId)
  }, [])

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
    renameTab,
    restoreTabs,
  }
}
