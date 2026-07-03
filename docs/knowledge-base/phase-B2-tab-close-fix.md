# Phase Knowledge: B2 — 标签页关闭 Bug 修复

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase | B2 |
| 任务 | 修复标签页无法关闭、关闭后 PTY 泄露、auto-save 保存无效 activeTabId 的问题 |
| 时间 | 2026-07-03 |
| 状态 | 已提交，待 review |

## 根因分析

### Bug 1: PTY 进程泄露（关闭非活跃标签时）

**根因**: `closeTab` 在 `useTabState.ts` 中仅从数组移除 tab，没有清理该 tab 关联的 PTY 进程。

**影响链路**:
- 用户有多个标签页（Tab A 活跃，Tab B 非活跃）
- 只有活跃标签的 `SplitPane` 被渲染（通过 `key={activeTabId}`）
- 关闭非活跃标签 Tab B 时，`usePty` 的 useEffect cleanup 从不执行（因为 Tab B 的组件从未被渲染）
- Tab B 的 node-pty/pty.fork 子进程在 `ptyRegistry` 中永久泄露
- `window-all-closed` 时才会一次性清理所有 PTY

**修复**:
1. 在 `useTabState` 中添加 `TabStateOptions.onCleanupTab` 回调
2. `closeTab` 中先遍历 tab 的 split tree 收集所有 leaf ID → `{leafId}_term` 作为 terminal IDs
3. 在更新 state 之前先调用 `window.electronAPI.send('terminal:kill', termId)` 清理 PTY
4. 调用前检查 `tabsRef.current.length <= 1` 避免清理最后一个标签

### Bug 2: Auto-save 保存 stale activeTabId

**根因**: `App.tsx` 的 auto-save useEffect 在每次 `tabs` 或 `activeTabId` 变化时触发。closeTab 的 `setTabs` 更新后，`activeTabId` 还在指向已关闭的 tab，此时 save 写入的 layout.json 包含无效的 `activeTabId`。

**影响链路**:
1. closeTab 调用 → `setTabs` 移除 tab → React 重渲染
2. `activeTabId` 仍指向已关闭的 tab（还未被 post-close useEffect 修正）
3. auto-save 触发：`{ tabs: [剩余], activeTabId: "已关闭_id" }` → 写入磁盘
4. post-close useEffect 修正 `activeTabId` → 第二次 save 写入正确值

**修复**: auto-save 前检查 `activeTabId` 在当前 `tabs` 中是否存在，不存在则跳过。

### Bug 3: 关闭操作无错误边界

**根因**: `TabBar.tsx` 的 `onClose(tab.id)` 无 try-catch。如果 React state 更新抛出异常（如并发操作），错误会冒泡到渲染进程，可能导致渲染进程崩溃。

### Bug 4: × 按钮可点击性不足

**根因**: 关闭按钮 16×16px 无 `cursor: pointer`，× 字符是 `<span>` 内嵌在 `<button>` 中，点击区域太小。

## 修复代码概要

### `src/renderer/hooks/useTabState.ts`

```typescript
// 新增: 遍历 split tree 收集 leaf ID
function collectLeafIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return [...collectLeafIds(node.children[0]), ...collectLeafIds(node.children[1])]
}

// 新增: TabStateOptions 接口
export interface TabStateOptions {
  onCleanupTab?: (terminalIds: string[]) => void
}

// 修改: useTabState 接受 options 参数
export function useTabState(options?: TabStateOptions) { ... }

// 修改: closeTab 增加 PTY 清理和长度守卫
const closeTab = useCallback((id: string) => {
  if (tabsRef.current.length <= 1) return  // 守卫：不能关闭最后一个

  // PTY cleanup
  const tabToClose = tabsRef.current.find((t) => t.id === id)
  if (tabToClose) {
    const leafIds = collectLeafIds(tabToClose.tree)
    const terminalIds = leafIds.map((lid) => `${lid}_term`)
    options?.onCleanupTab?.(terminalIds)
  }

  setTabs((prev) => {
    if (prev.length <= 1) return prev  // 双重守卫
    ...
  })
}, [activeTabId, options?.onCleanupTab])
```

### `src/renderer/App.tsx`

```typescript
// 新增: PTY 清理回调
const cleanupTabPty = useCallback((terminalIds: string[]) => {
  const api = window.electronAPI
  if (!api) return
  for (const termId of terminalIds) {
    api.send('terminal:kill', termId)
  }
}, [])

// 传入 useTabState
const { ... } = useTabState({ onCleanupTab: cleanupTabPty })

// 修改: auto-save 跳过 stale activeTabId
useEffect(() => {
  if (layoutLoaded.current && tabs.length > 0) {
    if (!tabs.some((t) => t.id === activeTabId)) return // ← 新增
    const layout: LayoutData = { tabs, activeTabId }
    window.electronAPI?.send('layout:save', layout)
  }
}, [tabs, activeTabId])
```

### `src/renderer/components/TabBar.tsx`

```tsx
// 修改: 关闭按钮
<span
  className="tab-close"
  onClick={(e) => {
    e.stopPropagation()
    try {
      onClose(tab.id)
    } catch (err) {
      console.error('Failed to close tab:', err)
    }
  }}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
      e.preventDefault()
      onClose(tab.id)
    }
  }}
  aria-label={`Close ${tab.title}`}
>
  ×
</span>
```

### `src/renderer/index.css`

```css
.tab-close {
  /* 增大点击区域 */
  width: 20px;    /* 原 16px */
  height: 20px;   /* 原 16px */
  cursor: pointer;  /* 新增 */
  user-select: none; /* 新增 */
  /* 添加过渡动画 */
  transition: opacity 0.1s, background 0.1s, color 0.1s;
}
```

## 验证方法

```bash
# 单元测试
npx vitest run tests/useTabState.test.tsx tests/replaceLeaf.test.ts

# 类型检查
npx tsc --noEmit

# 构建
npm run build
```

### 预期测试输出
```
✓ tests/useTabState.test.tsx (14 tests)
  ├─ (原有 10 个测试全部通过)
  ├─ ✓ closeTab on non-active tab should keep activeTabId unchanged
  ├─ ✓ closeTab should call onCleanupTab with correct terminal IDs
  ├─ ✓ closeTab should not call onCleanupTab when closing last tab (guard)
  └─ ✓ closeTab of middle tab should switch active to left neighbor
✓ tests/replaceLeaf.test.ts (6 tests)
```

## 下游传递

| 项目 | 说明 |
|------|------|
| 已知问题 | AIChat.test.tsx 和 Cell.test.tsx 的测试因 preload `on()` API 变更而失败（`unsubLoaded is not a function`），属于 Phase B1 的 preload 改造遗留 |
| 架构决策 | PTY 清理走 `terminal:kill` IPC 逐个发送而非批量 handler，因为数量通常很小（每个 tab 1-2 个 terminal），IPC 开销不显著 |
| 后续建议 | 考虑添加 `terminal:kill-tree` IPC handler 支持批量 kill，避免多次 IPC 往返 |
