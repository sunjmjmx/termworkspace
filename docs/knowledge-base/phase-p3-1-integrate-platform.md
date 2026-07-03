# Phase P3-1 — 整合 platform.ts 到 main/index.ts

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase 名称 | P3-1: 整合 platform.ts — index.ts 改用 createPTY() |
| 时间 | 2026-07-03 |
| 交付物 | `src/main/index.ts` 改为使用 `platform.ts` 的 `createPTY()`，删除内联 ~235 行回退代码 |
| 状态 | ✅ review-required |

## 工作过程

### 背景

`src/main/platform.ts` 已经封装了 3 级 PTY 回退逻辑（node-pty → Python PTY bridge → raw spawn），但 `src/main/index.ts` 的 `terminal:create` handler 仍然维护着一份独立的、重复的内联实现，包含：

- Shell/Arch/Node/PATH 诊断输出（~20 行）
- 安全环境变量构建（~20 行）
- Tier 1: node-pty spawn + IPC 转发（~30 行）
- Tier 2: Python PTY bridge + 内联 Python 脚本（~100 行）
- Tier 3: raw child_process.spawn（~60 行）
- 多层 try/catch 和 flushDiag（~20 行）

### 所做修改

只改了一个文件：`src/main/index.ts`（+15/-235）

| 改动 | 说明 |
|------|------|
| `import { spawn } from 'node-pty'` → `import { createPTY, PtyProcess } from './platform'` | 去掉直接 node-pty 依赖 |
| `Map<string, ReturnType<typeof spawn>>` → `Map<string, PtyProcess>` | 类型适配 PtyProcess 接口 |
| `terminal:create` handler 全部 ~235 行 → 调用 `createPTY()` 的 ~30 行 | 核心重构，3 级回退由 platform.ts 统一处理 |

### 验证

```bash
npx tsc --noEmit    # ✅ 无新错误
npm run build       # ✅ 3 targets (renderer 40 modules / main / preload)
```

## 异常与处理

本次是重做（上一轮 Worker 声称改了代码但没有提交，分支与基线完全一致）。本次从最新 `main` 重新创建分支，实际做了所有代码修改并提交。

## 可沉淀方案

### 统一 PTY 创建调用模式

所有需要创建 PTY 的地方统一使用：

```typescript
import { createPTY, PtyProcess } from './platform'

const pty = createPTY(terminalId, cwd, {
  onData: (data) => { /* 转发到 renderer */ },
  onExit: (code, signal) => { /* 清理 registry */ },
  onError: (err) => { /* 日志/诊断 */ },
})
```

### PtyProcess 接口

`platform.ts` 导出的 `PtyProcess` 接口很精简——只有 `write`/`kill`/`resize`——与 registry 中的使用模式完全匹配（下游 `terminal:write`/`terminal:kill`/`terminal:resize` handler 都只调这三个方法）。

## 下游传递

- P3-2 跨平台验证：确认 PTY 在 macOS/Windows/Linux 上都能正常工作
- 诊断输出已从 index.ts 移除，改为 `onError` 回调日志。如需详细诊断，可在 `platform.ts` 的 `createPTY()` 中添加回调
- `node-pty` 仍为依赖（在 `platform.ts` 中作为 Tier 1 使用）
