# Phase 2.1 — 布局持久化（layout.json）

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase 名称 | 2.1: 配置持久化 — 布局保存到 ~/.termworkspace/layout.json |
| 时间 | 2026-07-02 |
| 交付物 | layout.json 自动序列化 + 启动恢复 + IPC 通道 |
| 状态 | ✅ 完成（review 中） |

## 工作过程

1. **Scope 缩减** — 原始任务包含 config.json 持久化，但已被 2.3 Theme Worker 实现并合入 main。此 phase 仅实现 layout 序列化部分。

2. **类型定义** (`src/types/index.ts`)  — 新增 `LayoutData` 接口（`{ tabs: Tab[], activeTabId: string }`）和 `LAYOUT_CHANNELS`（layout:load / layout:save / layout:loaded）。

3. **Preload 桥接** (`src/preload/index.ts`)  — 将 layout 通道加入 validSendChannels / validOnChannels。

4. **IPC 处理** (`src/main/index.ts`) —
   - 布局文件路径：`~/.termworkspace/layout.json`
   - `loadLayout()` — 读取并校验 JSON，损坏或无文件返回 null
   - `saveLayout()` — 递归创建目录 + 写入 JSON
   - 监听 `layout:load`（回复 `layout:loaded`）和 `layout:save`（静默持久化）

5. **Hook 扩展** (`src/renderer/hooks/useTabState.ts`)  — 新增 `restoreTabs(newTabs, activeId)`：替换完整 tab 状态并重置 ID 计数器，避免与恢复的 ID 冲突。

6. **App 集成** (`src/renderer/App.tsx`)  —
   - 启动时发送 `layout:load` 请求，收到后调用 `restoreTabs` 恢复布局
   - 300ms 超时兜底：无 layout.json 时也能正常启动
   - tabs/activeTabId 变化时自动通过 IPC 保存（由 `layoutLoaded` ref 控制，避免初始加载时触发保存）

### 关键决策

- **路径选择**：使用 `~/.termworkspace/layout.json`（与 `config.json`/`config.yaml` 同级），而非 `app.getPath('userData')`。
- **布局 vs 配置分离**：layout 存 Tab 列表和 split 树，config 存 theme/偏好。两者独立 IPC 通道，互不污染。
- **300ms 超时兜底**：如果 layout.json 不存在，主进程不会回复 `layout:loaded`，所以超时确保 `layoutLoaded` 最终被标记为 true，后续用户操作才能触发保存。
- **计数器重置**：`restoreTabs` 重置 `nextTabId` 和 `nextLeafId`，避免恢复的 ID 与后续生成的 ID 冲突。

## 异常与处理

无异常。TypeScript 编译通过，30 个测试全部通过。

## 可沉淀方案

### 布局持久化 IPC 模式

```typescript
// Main process — 文件读写
const layoutFile = path.join(os.homedir(), '.termworkspace', 'layout.json')

function loadLayout(): LayoutData | null {
  try {
    if (existsSync(layoutFile)) {
      return JSON.parse(readFileSync(layoutFile, 'utf-8'))
    }
  } catch { /* corrupt */ }
  return null
}

function saveLayout(layout: LayoutData): void {
  mkdirSync(path.dirname(layoutFile), { recursive: true })
  writeFileSync(layoutFile, JSON.stringify(layout, null, 2), 'utf-8')
}

// IPC handlers
ipcMain.on('layout:load', (event) => {
  event.reply('layout:loaded', loadLayout())
})
ipcMain.on('layout:save', (_event, layout: LayoutData) => {
  saveLayout(layout)
})
```

### Renderer 加载/保存模式

```typescript
const layoutLoaded = useRef(false)

// 加载
useEffect(() => {
  api.on('layout:loaded', (raw) => {
    const data = raw as LayoutData | null
    if (data?.tabs?.length && data?.activeTabId) {
      restoreTabs(data.tabs, data.activeTabId)
    }
    layoutLoaded.current = true
  })
  api.send('layout:load')
  const fallback = setTimeout(() => { layoutLoaded.current = true }, 300)
  return () => { clearTimeout(fallback) }
}, [restoreTabs])

// 自动保存
useEffect(() => {
  if (layoutLoaded.current && tabs.length > 0) {
    api.send('layout:save', { tabs, activeTabId })
  }
}, [tabs, activeTabId])
```

### 序列化格式

layout.json 是对 `Tab[]` 的直接 JSON 序列化：

```json
{
  "tabs": [
    {
      "id": "tab_1",
      "title": "Terminal 1",
      "tree": {
        "type": "leaf",
        "id": "leaf_1"
      }
    }
  ],
  "activeTabId": "tab_1"
}
```

Split pane 树中的 SplitBranch 也是自然 JSON 序列化的：

```json
{
  "type": "split",
  "direction": "horizontal",
  "children": [
    { "type": "leaf", "id": "leaf_1" },
    {
      "type": "split",
      "direction": "vertical",
      "children": [
        { "type": "leaf", "id": "leaf_2" },
        { "type": "leaf", "id": "leaf_3" }
      ]
    }
  ]
}
```

所有结构都是纯 JSON 友好类型，可直接 `JSON.stringify` / `JSON.parse`，无需自定义序列化/反序列化逻辑。

## 验证方法

```bash
# 编译检查
npx tsc --noEmit

# 测试
npx vitest run

# 运行并验证（需要 GUI）
npm run dev
# 1. 启动后打开多个终端标签页并拆分面板
# 2. cat ~/.termworkspace/layout.json 确认内容
# 3. 关闭应用，重新启动
# 4. 验证标签页和布局被恢复
```

## 下游传递

- Cell 组件（Terminal / AI Chat）的状态恢复尚未实现——恢复后 leaf 仍然是空白终端，需要 PTY 重建逻辑后续处理。
- 如果后续要支持 workspace 会话恢复（每个 terminal 保存 cmd 历史等），可在 LayoutData 中扩展字段。
