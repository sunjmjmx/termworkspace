# TermWorkspace 全项目知识库

**项目名称**: TermWorkspace
**类型**: Electron + React + TypeScript 桌面应用
**仓库**: [github.com/sunjmjmx/termworkspace](https://github.com/sunjmjmx/termworkspace)
**发布**: Homebrew tap `sunjmjmx/homebrew-termworkspace`
**最新版本**: v0.2.1
**开发周期**: 2026-07-01 ~ 2026-07-06
**Kanban 总任务**: 38 / 38 完成

---

## 一、项目概览

### 产品定位

终端原生的多模型 AI 工作台。在同一窗口中集成终端模拟器 + AI 聊天面板，支持多标签、分屏、自定义 AI Provider。

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 框架 | Electron 33.x | macOS hiddenInset 标题栏 |
| 前端 | React 19 + TypeScript 5.6 | Vite 6 构建 |
| 终端 | xterm.js + node-pty | PTY 3-tier fallback |
| 分屏 | 二叉树递归分屏 | H/V 方向，动态增删 |
| 配置 | `~/.termworkspace/` | .env + app-config.json |
| 打包 | electron-builder 25.x | DMG + ZIP (x64 + arm64) |
| 测试 | Vitest 4 + happy-dom | 65/66 测试通过 |

### 目录结构

```
termworkspace/
├── src/
│   ├── main/          # Electron 主进程
│   │   ├── index.ts   # IPC handlers + 窗口管理
│   │   ├── platform.ts # PTY 3-tier fallback
│   │   └── ai-config.ts # AI Provider 配置 + .env 管理
│   ├── preload/
│   │   └── index.cjs  # contextBridge（纯 CJS）
│   ├── renderer/      # React UI
│   │   ├── App.tsx    # 主组件
│   │   ├── components/ # AIChat / Cell / FileTree / SplitPane / TabBar / Terminal
│   │   └── hooks/     # usePty / useTabState
│   └── types/
│       └── index.ts   # IPC 通道类型安全定义
├── tests/             # vitest 单元测试
├── docs/              # 文档 + 知识库
├── scripts/           # 打包预处理
└── electron-builder.yml
```

---

## 二、架构决策

### 1. PTY 3-tier Fallback（`platform.ts`）

Electron + macOS 组合下 node-pty 的 `posix_spawnp` 可能失败，设计三段回退链：

```
Tier 1: node-pty（原生，最快）→ on error →
Tier 2: Python pty.fork() 桥接（macOS 内置）→ on error →
Tier 3: child_process.spawn（无 PTY，最终保险）
```

关键代码：`src/main/platform.ts` 的 `createPTY()`。

**陷阱**: Electron GUI 启动时不继承 Shell PATH，需手动构建安全 env 对象。

### 2. IPC 事件监听器隔离（`preload/index.cjs`）

preload 白名单机制 + `on()` 返回 `removeListener` 函数替代 `removeAllListeners`：

```typescript
// preload 核心模式
on: (channel, callback) => {
  const handler = (_event, ...args) => callback(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)  // 精准清理
}
```

**陷阱**: `removeAllListeners('ai:chunk')` 会误杀其他标签页的监听器。B1 修复。

### 3. Preload 脚本用纯 CJS（`index.cjs`）

Electron renderer 用 `require()` 加载 preload。Vite 打包输出为 ESM 格式的 `.js`，导致 `require() of ES Module not supported`。

**修复**: preload 不经过 Vite 编译，直接手写纯 CJS 文件，构建时 `cp` 到 dist。

### 4. 配置多级 Fallback（`ai-config.ts`）

API Key 查找优先级：项目目录 `.env` → `process.env` → `~/.termworkspace/.env` → `~/.env`。保存时写入 `~/.termworkspace/.env` + 同步到 `process.env`。

### 5. Electron 扁平化分发（`scripts/prepackage.cjs`）

electron-builder 25.x 在并行创建 symlink 时有 bug。将 `Electron.app` 扁平化到 `build/electron-dist-flattened/`，用硬拷贝替换深层 symlink。

### 6. 渲染层数据同步

**陷阱（B19）**: `readDir` handler 使用 `removeAllListeners('filetree:readdir-result')` + 用户两次点击文件夹 → 竞态清除。

**修复**: 移除了 `removeAllListeners`，改用 `once` 或状态守卫。

**陷阱（v0.2.1 fix）**: AIChat 只在 mount 时加载 Provider 列表，settings 保存 API Key 后模型选择器不刷新。

**修复**: AIChat 监听 `config:apikey-status` 事件，保存后自动 reload。

---

## 三、开发阶段总览

### Phase 1a: 脚手架 + 核心功能（7 个任务）

| 任务 | 交付物 | 关键决策 |
|------|--------|---------|
| 1a-1 | Electron + React + Vite 脚手架 | Vite 6 + vite-plugin-electron |
| 1a-2 | 二叉树分屏 + node-pty 终端 | 递归 SplitNode 数据结构 |
| 1a-3 | AI 对话模式 + Tab 系统 | Cell 双模式（terminal / AI） |
| 1a-fix-1 | 关闭标签时清理 PTY | `onCleanupTab` 回调 |
| 1a-fix-2 | setActiveTabId 重构 | 移除 `as any` |
| 1a-fix-3 | Phase1a 单元测试 | 66 测试用例 |
| 预发布 | Vitest + preload CJS 修复 | 发现 ESM preload 问题 |

### Phase 2: 功能完善（6 个任务）

| 任务 | 交付物 |
|------|--------|
| 2.1 | 布局/配置持久化到 `~/.termworkspace/` |
| 2.2 | 对话历史保存（SQLite 替代方案 → JSON 文件） |
| 2.3 | 浅色/深色主题切换 + xterm.js 适配 |
| 2.4 | 文件浏览器 — 左侧文件树 |
| 2.5 | 打开文件夹向导 — 启动时选项目目录 |

### Phase 3: 工程化 + 跨平台（5 个任务）

| 任务 | 交付物 |
|------|--------|
| P3-1 | 整合 platform.ts 到 index.ts，删除内联回退 |
| P3-2 | 跨平台兼容性测试 + 报告 |
| P3-3 | Python PTY bridge resize 支持 |
| P3-4 | electron-rebuild node-pty 原生路径修复 |
| P3-5 | 终端功能完整性验证 + 文档更新 |

### Bug 修复系列（B1-B19，19 个任务）

详见第四节。

### 输出文档（2 个任务）

| 任务 | 交付物 |
|------|--------|
| Phase3-DOC | GitHub 用户使用说明文档 |
| B7 | 多模型 API 配置说明文档 |

---

## 四、Bug 追踪（B 系列）

| Bug | 问题 | 根因 | 修复 |
|-----|------|------|------|
| **B1** | 多 AI 聊天窗口只有最后 1 个能收到响应 | `removeAllListeners('ai:chunk')` 误杀其他窗口 | preload `on()` 返回 `removeListener` 函数 |
| **B2** | 标签页无法关闭 / 关闭后 PTY 泄露 | closeTab 未清理 PTY、auto-save 保存无效 activeTabId | onCleanupTab 回调 + 状态守卫 |
| **B3** | AI 聊天组件 `removeAllListeners` 误杀其他实例 | 跨实例 IPC 冲突 | per-listener unsubscribe 模式 |
| **B4** | 关闭最后一个标签导致程序退出 | 窗口关闭时错误地 kill 所有 PTY | `will-quit` 事件中才清理 |
| **B5** | AI 对话面板无法关闭 | mode-btn 默认 opacity: 0 (hover-reveal) | 改为 opacity: 1 始终可见 |
| **B6** | 分屏窗格无法关闭 | 缺少 ✕ 关闭按钮 | 每个 split-leaf 加 close btn |
| **B7** | 多模型 API 配置文档缺失 | 文档未覆盖多模型场景 | B7: 补全 API 配置文档 |
| **B8** | electron-builder 打包启动崩溃 | symlink 并行创建 bug | 扁平化 Electron.app 分发 |
| **B8-v2** | 保持 electron-builder 25.x | 降级 24.x 方案问题 | prepackage.cjs 替代 |
| **B9** | 全面测试 | 整包回归 + .app 功能冒烟 | 65/66 测试通过 |
| **B10** | .app 打包版 config 路径不统一 | dev/打包双路径分叉 | 统一到 `~/.termworkspace/` |
| **B11** | prepackage 缓存损坏时静默使用残缺缓存 | 无完整性校验 | 增加缓存校验 + 检测到损坏自动重建 |
| **B12** | .app 首次启动三连失败 | config 迁移 + projectPath + API Key | 三处独立修复 |
| **B13** | 侧边栏无打开文件夹按钮 | UI 缺少入口 | 添加 📁 按钮 |
| **B14** | API Key 配置无 UI、无警告 | 只能手写 .env | 设置弹窗 + 红色警告条 |
| **B15** | 📁 按钮点击无效 | FileTree 缺少 onOpenFolder prop | 补传 prop |
| **B16** | 设置弹窗打开后窗口无法拖动 | overlay pointer-events 拦截 | pointer-events:none |
| **B17** | 只能配 Kimi/DeepSeek 两个模型 | 不支持自定义 Provider | 添加自定义 Provider 表单 |
| **B18** | 整个窗口无法拖动 | `.tab-bar-tabs` 误设 no-drag | `.tab-item` 加 no-drag |
| **B19** | 📁 选择文件夹后文件树仍显示 (empty) | `removeAllListeners` 竞态 + 重复 setProjectPath | 移除竞态 listener |
| **v0.2.1** | 保存 API Key 后模型选择器仍显示 "no API key" | AIChat 只在 mount 时加载 providers | 监听 `config:apikey-status` |

---

## 五、关键技术陷阱

### 5.1 Electron + ESM `__dirname` 未定义

**症状**: `ReferenceError: __dirname is not defined`
**根因**: Vite 构建输出 ESM 格式，ESM 模块无 `__dirname`
**修复**: 使用 `import.meta.dirname`（Node 20.11+ / Electron 33+）

### 5.2 `hermes config set` 不能正确处理 YAML 列表

**症状**: 列表被存为 JSON 字符串而非 YAML 列表
**根因**: `hermes config set` 不做类型推断
**修复**: 手动编辑 config.yaml，用 `python3 -c "import yaml; yaml.safe_load(...)"` 验证

### 5.3 node-pty `posix_spawnp failed`

**症状**: Electron 启动终端时崩溃
**根因**: Electron GUI 模式下 `process.env.SHELL` 可能为空，PATH 不完整
**修复**: 4 层防御 — 验证 shell 存在 → 构建安全 env → 验证 cwd → try-catch

### 5.4 Electron 原生对话框与 IPC 死锁

**症状**: 点击打开文件夹按钮卡死（显示 "Opening..."）
**根因**: `ready-to-show` 和 IPC handler 同时调用 `dialog.showOpenDialog()`，阻塞主进程消息循环
**修复**: 只保留 renderer 侧的 invoke 入口

### 5.5 AIChat 与 Settings 双份 Provider 状态

**症状**: 保存 API Key 后 settings 显示"已配置"，AIChat 仍显示"no API key"
**根因**: 两个组件各自独立保存 provider 列表，无同步机制
**修复**: AIChat 监听 `config:apikey-status` 事件

---

## 六、开发流程规范

### 6.1 Speckit 7 步方法论

```
Phase 1: 奠基
  Step 1 → Constitution       [规则是什么]
  Step 2 → Specify            [要做什么]
  ⏸️ CLARIFY CHECKPOINT
Phase 2: 执行
  Step 3 → Clarify            [不确定什么]
  Step 4 → Plan               [怎么做]
  Step 5 → Tasks & Dispatch   [谁做]
  Step 6 → Analyze            [方向对吗]
  Step 7 → Implement → Test → Review → Deploy
```

### 6.2 不可破坏规则

1. **沙盒红线**: 所有代码修改必须先隔离测试再写入生产（A类=Hermes profile, B类=git branch）
2. **Git 基线**: 改动前必须有 git baseline commit
3. **Review 锁定**: Worker 必须用 `review-required` 阻塞，禁止自动 complete
4. **依赖隔离**: pip 装进项目 venv，不碰全局
5. **本地测试优先**: 优先 Ollama 本地模型
6. **通知闭环**: 部署完必须通知 SUN 确认

### 6.3 Kanban Worker 规范

- Workspace: `dir:/path/to/project`（B类项目）
- 不得直接 commit 到 main
- 不得调用 `clarify`（无真人交互）
- 产出物必须含：diff 摘要 + 验证截图 + 文档
- 审核前运行 `scripts/preflight.py`

### 6.4 循环验证（Cyclic Verification）

```
Cycle 1: 代码真实性验证 — grep 确认每个声称的函数存在
Cycle 2: 范围控制 — 只改该改的文件
Cycle 3: Constitution 合规 — 分支隔离？venv？review-required？
```

### 6.5 Worker handoff 验证

从不信任 Worker 的自述变更清单。每次 review 必须用 `git show` 或 `grep` 实际验证函数存在性。

---

## 七、关键数据

| 指标 | 值 |
|------|-----|
| 源文件数 | 17 |
| 代码行数 | 4,565 |
| 测试用例 | 66（65 通过，1 已知行为差异） |
| Kanban 任务 | 38 |
| Bug 修复 | 19（B1-B19）+ 2 次热修复 |
| 知识库文档 | 9 份 |
| 发布版本 | v0.1.0 → v0.2.0 → v0.2.1 |
| 开发周期 | 6 天 |

---

## 八、已沉淀知识库文档

| 文件 | 内容 |
|------|------|
| `phase-2.1-layout-persistence.md` | 配置持久化架构 |
| `phase-2.3-theme-switching.md` | 主题切换实现 |
| `phase-2.5-open-folder-wizard.md` | 项目选择向导 |
| `phase-p3-1-integrate-platform.md` | platform.ts 整合 |
| `phase-B1-multi-ai-ipc-fix.md` | IPC 事件隔离 |
| `phase-B2-tab-close-fix.md` | 标签关闭 + PTY 清理 |
| `phase-b4-window-lifecycle.md` | 窗口生命周期 |
| `1a-fix-1-pty-cleanup.md` | PTY 清理修复 |
| `TermWorkspace全项目知识库.md` | **本文档** |

---

*归档日期: 2026-07-06*
*所有 38 个 Kanban 任务已归档，38/38 完成。*
