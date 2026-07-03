# Phase Knowledge: B1 — 多 AI 聊天窗口 IPC 事件冲突修复

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase | B1 (Bug #1) |
| 问题 | 同时打开多个 AI 聊天窗口，只有最后一个窗口能收到 LLM 响应 |
| 根因 | AIChat 组件 cleanup 使用 `removeAllListeners('ai:chunk')`，这会移除**所有**窗口的 `ai:chunk` 监听器 |
| 修复时间 | 2026-07-03 |
| 交付物 | 4 个文件被修改 |
| 状态 | ✅ review-required |

## 根因分析

### 调用链

1. 用户打开 Term A (AIChat #1) → useEffect 注册 `on('ai:chunk', callbackA)`
2. 用户打开 Term B (AIChat #2) → useEffect 注册 `on('ai:chunk', callbackB)`
3. `ipcRenderer.on('ai:chunk', ...)` 现在有 2 个监听器
4. 任意原因导致 AIChat #1 的 useEffect cleanup 执行 → `removeAllListeners('ai:chunk')`
5. **callbackA 和 callbackB 都被移除！**
6. 现在 Term A 和 Term B 都收不到 `ai:chunk` 事件

### 为什么 cleanup 会意外执行

`useEffect` 依赖 `[chatId]`，这通常不变化。但以下场景会触发：
- 终端关闭/重建（AIChat 组件 unmount → remount）
- React strict mode 双重渲染
- 父组件重新排列导致 key/position 变化

## 修复方案

### 方案：on() 返回清理函数（已在 preload 层实现）

**preload/index.cjs**: `on()` 方法不再只是注册监听器，而是返回一个清理函数：

```javascript
on: (channel, callback) => {
    if (validOnChannels.includes(channel)) {
      const handler = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
    return () => {}
  },
```

**核心原理**: 每个 `on()` 调用创建唯一的 `handler` 闭包，清理函数通过 `removeListener(channel, handler)` 只移除自己注册的那个监听器——不影响其他组件注册的监听器。

**AIChat.tsx**: 使用返回的清理函数：

```typescript
const unsubLoaded = api.on('chat:loaded', onLoaded)
const unsubChunk = api.on('ai:chunk', onChunk)
const unsubDone = api.on('ai:done', onDone)

return () => {
  unsubLoaded()
  unsubChunk()
  unsubDone()
}
```

**types/index.ts**: `on()` 的返回类型更新为 `() => () => void`。

### 为什么这个方案好

| 方案 | 问题 | 结论 |
|------|------|------|
| `removeAllListeners` | 移除所有监听器，跨实例冲突 | ❌ 淘汰 |
| Map 跟踪 + `removeListener` | 需要全局状态，Map 泄露风险 | ⚠️ 可行但复杂 |
| **on() 返回清理函数** | 零全局状态，闭包即隔离，与 React useEffect 范式一致 | ✅ 最佳 |

## 影响范围

| 文件 | 修改内容 |
|------|---------|
| `src/preload/index.cjs` | `on()` 返回清理函数；保留 `removeAllListeners` 做向后兼容 |
| `src/renderer/components/AIChat.tsx` | Cleanup 使用 `unsub*()` 清理函数替代 `removeAllListeners` |
| `src/types/index.ts` | `on()` 返回类型改为 `() => void` |
| `tests/AIChat.test.tsx` | Mock `on()` 返回清理函数；unmount 测试验证清理函数被调用 |

## 验证

- `tsc --noEmit`: ✅ 无错误
- `vitest run`: ✅ 36/36 测试通过（4 个文件）
- preload 语法: ✅ `node -c` 通过

## 已知风险

- `usePty.ts` 中也有 `removeAllListeners('terminal:output')` 模式，同理 **不** 修复
