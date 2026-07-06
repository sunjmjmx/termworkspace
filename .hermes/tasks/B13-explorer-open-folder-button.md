# B13: Explorer 侧边栏添加"打开/更换文件夹"按钮

## 问题

用户选好项目文件夹后，Explorer 侧边栏只显示文件树，没有任何方式**更换**项目文件夹。一旦 `projectPath` 被设置，用户无法回到项目选择器。

## 截图证据

Explorer 侧边栏标题为 "Explorer"，内容为空 `(empty)` 或有文件树，但标题栏只有折叠按钮（◀），没有"打开文件夹"按钮。

## 现有基础设施

- `openProjectPicker()` 函数已存在于 `src/renderer/App.tsx:146-166` — 调用 `api.invoke('dialog:select-project')` 弹系统原生文件夹选择器
- `project:cwd-set` IPC 通道已存在，选中路径后会通知 main process 持久化
- `project:selected` IPC 通道已存在，main 回复后更新 renderer 的 projectPath 状态

## 需要修改

### 1. `src/renderer/components/FileTree.tsx`
在 FileTree sidebar 的 header 区域（当前仅显示标题 + 折叠按钮），**添加一个"打开文件夹"按钮**（📁 图标 + 文字）。点击后调用回调函数触发项目选择器。

**具体改动：**
- `FileTreeProps` 新增 `onOpenFolder?: () => void` 属性
- Header 区添加按钮：`<button className="filetree-open-btn" onClick={onOpenFolder} title="Open / Change project folder">📁</button>`
- 按钮样式：尺寸 28x28，与折叠按钮对称排列（折叠按钮在右，打开按钮在左），hover 变色，tooltip "更换项目文件夹"

### 2. `src/renderer/App.tsx`
- 将 `openProjectPicker` 作为 `onOpenFolder` 传入 FileTree：
  ```tsx
  <FileTree
    ...
    projectPath={projectPath}
    onOpenFolder={openProjectPicker}
  />
  ```

### 3. `src/renderer/styles/` 或对应 CSS
添加 `.filetree-open-btn` 样式（与 `.filetree-collapse-btn` 对称）

## 验收标准

- [ ] Explorer 侧边栏 header 显示 📁 图标按钮
- [ ] 点击后弹出系统原生文件夹选择对话框
- [ ] 选择新文件夹后，文件树刷新为新路径的内容
- [ ] 原 projectPath 被覆盖（不是追加）
- [ ] 终端启动目录自动切换为新路径
- [ ] 不破坏现有文件树浏览功能

## 不在此任务范围

- API Key 配置（B14 单独处理）
- 文件树性能优化
