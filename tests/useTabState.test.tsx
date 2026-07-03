// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabState } from '../src/renderer/hooks/useTabState'

describe('useTabState', () => {
  beforeEach(() => {
    // Reset module state (generateTabId counter) between tests
    vi.resetModules()
  })

  it('should initialize with one tab', () => {
    const { result } = renderHook(() => useTabState())
    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0].title).toBe('Terminal 1')
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id)
  })

  it('createTab should add a new tab and switch to it', () => {
    const { result } = renderHook(() => useTabState())

    act(() => {
      result.current.createTab()
    })

    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.tabs[1].title).toBe('Terminal 2')
    // Should auto-switch to the new tab
    expect(result.current.activeTabId).toBe(result.current.tabs[1].id)
  })

  it('createTab should increment tab titles', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })

    expect(result.current.tabs).toHaveLength(4)
    expect(result.current.tabs[0].title).toBe('Terminal 1')
    expect(result.current.tabs[1].title).toBe('Terminal 2')
    expect(result.current.tabs[2].title).toBe('Terminal 3')
    expect(result.current.tabs[3].title).toBe('Terminal 4')
  })

  it('closeTab should remove the specified tab', () => {
    const { result } = renderHook(() => useTabState())

    // Create a second tab first
    act(() => { result.current.createTab() })
    const secondTabId = result.current.tabs[1].id
    const firstTabId = result.current.tabs[0].id

    // Close the second tab
    act(() => {
      result.current.closeTab(secondTabId)
    })

    expect(result.current.tabs).toHaveLength(1)
    expect(result.current.tabs[0].id).toBe(firstTabId)
    // Should switch to the remaining tab
    expect(result.current.activeTabId).toBe(firstTabId)
  })

  it('closeTab should remove the last tab (tabs become empty)', () => {
    const { result } = renderHook(() => useTabState())
    const onlyTabId = result.current.tabs[0].id

    act(() => {
      result.current.closeTab(onlyTabId)
    })

    // Last tab is removed, tabs is now empty
    expect(result.current.tabs).toHaveLength(0)
  })

  it('closeTab of active tab should switch to nearest neighbor', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })

    // tabs: [tab0, tab1, tab2], active = tab2 (last created)
    act(() => {
      result.current.closeTab(result.current.tabs[2].id)
    })

    // After closing tab2, should switch to tab1 (the nearest)
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeTabId).toBe(result.current.tabs[1].id)
  })

  it('switchTab should switch to the specified tab', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    const firstTabId = result.current.tabs[0].id
    const secondTabId = result.current.tabs[1].id

    // Switch back to first tab
    act(() => {
      result.current.switchTab(firstTabId)
    })
    expect(result.current.activeTabId).toBe(firstTabId)

    // Switch to second tab
    act(() => {
      result.current.switchTab(secondTabId)
    })
    expect(result.current.activeTabId).toBe(secondTabId)
  })

  it('setActiveTree should update the active tab tree', () => {
    const { result } = renderHook(() => useTabState())
    const tabId = result.current.tabs[0].id

    const newTree = {
      type: 'split' as const,
      direction: 'horizontal' as const,
      children: [
        { type: 'leaf' as const, id: 'test_leaf_1' },
        { type: 'leaf' as const, id: 'test_leaf_2' },
      ],
    }

    act(() => {
      result.current.setActiveTree(newTree)
    })

    const updatedTab = result.current.tabs.find(t => t.id === tabId)
    expect(updatedTab).toBeDefined()
    expect(updatedTab!.tree).toEqual(newTree)
  })

  it('setActiveTree should only update the active tab', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    const firstTabId = result.current.tabs[0].id
    const secondTabId = result.current.tabs[1].id

    // Currently active is tab1 (the new one)
    act(() => {
      result.current.setActiveTree({
        type: 'split',
        direction: 'vertical',
        children: [
          { type: 'leaf', id: 'a' },
          { type: 'leaf', id: 'b' },
        ],
      })
    })

    const firstTab = result.current.tabs.find(t => t.id === firstTabId)!
    const secondTab = result.current.tabs.find(t => t.id === secondTabId)!

    // Second tab should have the split tree
    expect(secondTab.tree.type).toBe('split')
    // First tab should still be a leaf
    expect(firstTab.tree.type).toBe('leaf')
  })

  it('renameTab should update tab title', () => {
    const { result } = renderHook(() => useTabState())
    const tabId = result.current.tabs[0].id

    act(() => {
      result.current.renameTab(tabId, 'My Custom Tab')
    })

    expect(result.current.tabs[0].title).toBe('My Custom Tab')
  })

  // ── New tests for B2 fix: PTY cleanup + close behavior ──

  it('closeTab on non-active tab should keep activeTabId unchanged', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })

    // tabs: [tab0, tab1, tab2], active = tab2 (last created)
    const tab0Id = result.current.tabs[0].id
    // Switch to tab0
    act(() => { result.current.switchTab(tab0Id) })
    expect(result.current.activeTabId).toBe(tab0Id)

    // Close tab1 (non-active)
    const tab1Id = result.current.tabs[1].id
    act(() => { result.current.closeTab(tab1Id) })

    // activeTabId should still be tab0, tabs should be [tab0, tab2]
    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.activeTabId).toBe(tab0Id)
    expect(result.current.tabs[0].id).toBe(tab0Id)
  })

  it('closeTab should call onCleanupTab with correct terminal IDs', () => {
    const onCleanupTab = vi.fn()
    const { result } = renderHook(() => useTabState({ onCleanupTab }))

    act(() => { result.current.createTab() })
    const tab1Id = result.current.tabs[1].id

    act(() => { result.current.closeTab(tab1Id) })

    // onCleanupTab should have been called with leafId_term for the closed tab's tree
    expect(onCleanupTab).toHaveBeenCalledTimes(1)
    const terminalIds = onCleanupTab.mock.calls[0][0]
    expect(Array.isArray(terminalIds)).toBe(true)
    expect(terminalIds.length).toBeGreaterThanOrEqual(1)
    for (const id of terminalIds) {
      expect(id).toMatch(/_term$/)
    }
  })

  it('closeTab should call onCleanupTab when closing last tab', () => {
    const onCleanupTab = vi.fn()
    const { result } = renderHook(() => useTabState({ onCleanupTab }))

    const onlyTabId = result.current.tabs[0].id
    act(() => { result.current.closeTab(onlyTabId) })

    // Last tab is closed — cleanup IS called, tabs become empty
    expect(result.current.tabs).toHaveLength(0)
    expect(onCleanupTab).toHaveBeenCalledTimes(1)
  })

  it('closeTab of middle tab should switch active to left neighbor', () => {
    const { result } = renderHook(() => useTabState())

    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })
    act(() => { result.current.createTab() })

    // tabs: [tab0, tab1, tab2, tab3], active = tab3 (last created)
    // Switch to tab1
    act(() => { result.current.switchTab(result.current.tabs[1].id) })
    const tab1Id = result.current.activeTabId

    // Close tab1 (the active tab)
    act(() => { result.current.closeTab(tab1Id) })

    // Should switch to tab0 (left neighbor)
    expect(result.current.tabs).toHaveLength(3)
    expect(result.current.activeTabId).toBe(result.current.tabs[1].id)
  })
})
