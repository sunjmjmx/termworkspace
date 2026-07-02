import { useState, useCallback, useRef } from 'react'
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
      const filtered = prev.filter((t) => t.id !== id)

      // If we closed the active tab, switch to the nearest neighbor
      if (id === activeTabId) {
        const newIndex = Math.min(index, filtered.length - 1)
        setActiveTabId(filtered[newIndex].id)
      }

      return filtered
    })
  }, [activeTabId])

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
    activeTab,
    activeTabId,
    setActiveTree,
    createTab,
    closeTab,
    switchTab,
    renameTab,
  }
}
