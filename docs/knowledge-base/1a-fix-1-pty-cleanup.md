# Phase 1a-fix-1: PTY Cleanup on Tab Close

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase | 1a-fix-1: 关闭标签时清理 PTY 进程 |
| 交付物 | PTY 进程在标签关闭时被正确 kill + ptyRegistry 清理 |
| 状态 | ✅ 完成，待审核 |

## 工作过程

### 问题现象
closeTab 只在渲染层删除标签（React state），ptyRegistry 中的 PTY 进程残留。切换标签/关闭标签导致 PTY 泄漏。

### 修复方案
1. **`src/types/index.ts`**: `TERMINAL_CHANNELS.send` 新增 `'terminal:kill'`
2. **`src/preload/index.ts`**: `validSendChannels` 新增 `'terminal:kill'`
3. **`src/main/index.ts`**: 新增 IPC handler `terminal:kill` — 按 terminalId kill PTY + 从 registry 删除
4. **`src/renderer/hooks/usePty.ts`**: `useEffect` cleanup 中发送 `api.send('terminal:kill', terminalId)`

### 关键决策
- **为什么在 usePty cleanup 中发送 kill 信号？** 因为 React 卸载 Terminal 组件时会触发 usePty 的 cleanup，此时 terminalId 仍然有效（从 closure 捕获），能正确路由到 main process 的对应 PTY。
- **为什么不在 closeTab 中手动发送？** 因为 TabBar 的 onClose 触发的 React state 更新 → 组件卸载 → cleanup 是天然的解耦链，无需额外在 useTabState 中加入 IPC 调用。

## 异常与处理

| 异常 | 根因 | 修复 | 预防 |
|------|------|------|------|
| 上次运行遗留了 tests/ 目录和 vitest 配置 | 前次 worker 添加了测试基础设施（scope creep） | `git checkout -- package.json package-lock.json vite.config.ts SplitPane.tsx` 还原 | 每次 block 前用 `git diff main --stat` 检查 scope |

## 可沉淀方案

### IPC 通道添加标准流程
```typescript
// 1. types/index.ts — 定义通道
TERMINAL_CHANNELS.send: [...existing, 'terminal:kill']

// 2. preload/index.ts — 白名单
validSendChannels: [...existing, 'terminal:kill']

// 3. main/index.ts — 处理器
ipcMain.on('terminal:kill', (_event, terminalId: string) => { ... })

// 4. renderer — 发送方
window.electronAPI.send('terminal:kill', terminalId)
```

### 验证方法
```bash
# 检查所有改动文件
grep -n "terminal:kill" src/main/index.ts src/preload/index.ts src/types/index.ts src/renderer/hooks/usePty.ts

# TypeScript 编译
npx tsc --noEmit
```

## 下游传递

- 需要确认 Electron 应用实际运行时的 PTY 泄漏验证（创建多个终端标签 → 关闭 → 观察 ptyRegistry size）
- 依赖 Phase1a-3 的 Tab 系统架构（`key={activeTabId}` 的 remount 机制）
