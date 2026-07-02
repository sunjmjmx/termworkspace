# Phase 2.5 — 打开文件夹向导（启动时选项目目录）

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase 名称 | 2.5: 打开文件夹向导 — 启动时选项目目录 |
| 时间 | 2026-07-02 |
| 交付物 | 启动时弹窗选项目目录 + PTY 自动 cd + 文件树展开选定目录 |
| 状态 | ✅ review-required |

## 工作过程

### 需求拆解

根据任务 body 的 4 点要求：

1. **启动时弹窗选项目文件夹** — 使用 Electron `dialog.showOpenDialog`，在 main process 中触发
2. **选中的路径存入 config.json** — 扩展 `AppConfig` 增加 `projectPath` 字段
3. **每个新 Tab 自动 cd 到项目目录** — PTY 创建时传递 `cwd` 参数
4. **文件树默认展开选定目录** — FileTree 组件接收 `projectPath` prop 替代硬编码路径

### 所改文件（10 个）

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | `AppConfig` 加 `projectPath?`；新增 `PROJECT_CHANNELS`；`ElectronAPI` 加 `invoke` 方法 |
| `src/preload/index.ts` | 新增 `invoke` 桥接 + project 通道白名单 |
| `src/main/index.ts` | 新增 `promptProjectFolder()` 函数 + `dialog:select-project` IPC handle + `terminal:create` 支持 cwd 参数 + 启动时自动弹窗 |
| `src/renderer/hooks/usePty.ts` | 新增可选 `cwd` 参数，传给 `terminal:create` IPC |
| `src/renderer/components/Terminal.tsx` | 新增 `projectPath?` prop 传给 usePty |
| `src/renderer/components/Cell.tsx` | 新增 `projectPath?` prop 传给 Terminal |
| `src/renderer/components/SplitPane.tsx` | 新增 `projectPath?` prop，thread 到所有 leaf 的 Cell |
| `src/renderer/components/FileTree.tsx` | `projectPath` prop 替代硬编码 `/Users/sunjmj/termworkspace-v2` |
| `src/renderer/App.tsx` | 核心集成：`project:selected` 事件监听 + 先显示项目选择器覆盖层 + 项目路径传递到 FileTree/SplitPane + TabBar 路径显示 |
| `src/renderer/index.css` | 项目选择器覆盖层样式 + TabBar 路径按钮样式 |

### 架构模式

#### 对话框触发方式

使用 **main process 主动触发**（非 renderer→IPC→main 的 request/response模式）：

1. `app.whenReady()` → `createWindow()` → `ready-to-show` 事件
2. 加载 config，如果 `projectPath` 缺失则调用 `promptProjectFolder()` 弹出原生对话框
3. 选择结果存入 config + 通过 `project:selected` IPC 推送到 renderer

同时也支持 renderer 端手动触发（"切换项目"按钮）：

1. App.tsx 的 `openProjectPicker` 调用 `api.invoke('dialog:select-project')`
2. 选择后调用 `api.send('project:cwd-set', path)` 持久化到 config

#### PTY 自动 cd 的实现

修改 `terminal:create` IPC handler，新增可选 `cwd` 参数：

```typescript
// main/index.ts
ipcMain.on('terminal:create', (_event, terminalId: string, cwd?: string) => {
  const pty = spawn(shell, [], {
    cwd: cwd || process.env.HOME || os.homedir(),
    ...
  })
})
```

usePty hook 新增可选 `cwd` 参数，传递给 `terminal:create`。这样每个新 Tab 的 PTY 都直接在工作目录启动，无需额外 `cd` 命令。

#### 组件树数据流

```
App (projectPath state)
 ├── FileTree (projectPath prop → 加载目录)
 └── SplitPane (projectPath prop)
      └── SplitPaneNode (递归传递)
           └── Cell (projectPath prop)
                └── Terminal (projectPath → usePty cwd)
```

## 关键决策

### 启动时如何弹窗

选择了 **main process 在 ready-to-show 后主动弹窗** 而非 renderer 请求后弹窗。理由：
- `dialog.showOpenDialog` 需要 `BrowserWindow` 引用
- 主进程触发可以在窗口显示前就完成选择
- 无 projectPath 时 renderer 显示选择器覆盖层兜底

### `invoke` 模式 vs `send+on`

新增了 `ElectronAPI.invoke` 桥接（使用 `ipcRenderer.invoke`），用于 renderer 请求主进程返回数据的情况（如"选择项目文件夹"返回路径）。现有的 config/layout 等仍使用 `send+on` 模式。

### config 存储路径选择

项目路径存入 `app-config.json`（与 theme 同文件），使用 `app.getPath('userData')` 路径而非 `~/.termworkspace/`。这样下次启动时无需用户重新选择，除非手动切换。

## 可沉淀方案

### 原生对话框 IPC 模式

```typescript
// Main process — 注册 handler
ipcMain.handle('dialog:select-project', async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  })
  return result.canceled ? null : result.filePaths[0]
})

// Preload — 暴露 invoke
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.invoke(channel, ...args)
  },
})

// Renderer — 调用
const path = await window.electronAPI.invoke('dialog:select-project')
```

### PTY 启动到指定目录

```typescript
// Main process — terminal:create 支持 cwd
const pty = spawn(shell, [], {
  cwd: cwd || process.env.HOME,
  ...
})
```

## 验证

- TypeScript 编译通过（`npx tsc --noEmit` ✅）
- 构建通过（`npm run build` ✅ 3个 bundle）
- 30 个单元测试通过（`npx vitest run` ✅）
- scope 检查：10 个文件，全部在本任务范围内
- git diff main 确认无额外修改
