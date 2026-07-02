# Phase 2.3 — Light/Dark Theme System

## 工作全景

| 项目 | 内容 |
|------|------|
| Phase 名称 | 2.3: 浅色/深色主题 — 主题切换 + xterm.js 适配 |
| 时间 | 2026-07-02 |
| 交付物 | CSS 变量系统 + 浅色主题 + 切换按钮 + xterm.js 主题适配 + config.json 持久化 |
| 状态 | ✅ 完成 |

## 工作过程

1. **CSS 变量系统** — 将 Catppuccin Mocha 硬编码色值抽象为 CSS 自定义属性（`--bg-base`, `--text-primary`, `--accent-blue` 等）。定义两个主题类：`.theme-dark`（Catppuccin Mocha）和 `.theme-light`（idoubi 风格：白底/灰字/蓝色强调）。
2. **浅色主题方案** — idoubi 风格设计：纯白背景 (#ffffff)、深灰文本 (#333333)、#999 次要文本、#4a90d9 蓝色强调色。
3. **主题切换按钮** — TabBar 右上角添加 ☀️/🌙 按钮，点击切换主题。
4. **xterm.js 主题适配** — Terminal 组件接收 `theme` prop，定义 DARK_THEME / LIGHT_THEME 两套终端色，通过 `term.options.theme` 热切换（无需重建 xterm 实例）。
5. **配置持久化** — 通过 IPC (`config:load` / `config:save`) 读写 `app.getPath('userData')/config/app-config.json`，存储 theme 设置。App 初始加载时读取持久化配置。

### 关键决策

- 使用 `<html class="theme-dark|light">` 而非 CSS 嵌套选择器，确保 CSS 变量对全页面所有组件生效。
- xterm.js 不销毁重建，通过 `term.options.theme` 热更新主题，避免终端状态丢失。
- Config 保存在 Electron `userData` 目录，不使用文件选择器或用户干预。

## 异常与处理

无异常。构建通过，30 个测试全部通过。

## 可沉淀方案

### CSS 变量命名规范
```
--bg-base         # 最底层背景
--bg-surface      # 表面层（tab bar、input area）
--bg-elevated     # 抬升层（按钮、input 背景）
--bg-hover        # hover 态
--text-primary    # 主文本
--text-secondary  # 次要文本（tab 未激活、占位符）
--text-muted      # 更淡文本
--border-color    # 边框
--border-hover    # 边框 hover
--accent-*        # 强调色（blue/green/red/purple/cyan/yellow/peach）
--scrollbar-thumb # 滚动条
--send-btn-*      # 发送按钮
--chat-*          # 聊天气泡
```

### xterm.js 主题切换模式
```typescript
// 热更新（不销毁重建）
useEffect(() => {
  const term = termRef.current
  if (!term) return
  term.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
}, [theme])
```

### 配置持久化 IPC 模式
```typescript
// Main process
ipcMain.on('config:load', (event) => {
  const config = loadConfig()
  event.reply('config:loaded', config)
})
ipcMain.on('config:save', (_event, config: AppConfig) => {
  saveConfig(config)
})

// Renderer
api.on('config:loaded', (raw) => { setTheme(raw.theme) })
api.send('config:load')
// ...
api.send('config:save', { theme: next })
```

## 验证方法

```bash
# 构建
rm -rf dist dist-electron && npx vite build

# 测试
npx vitest run

# 运行
npm run dev  # 然后点击右上角 ☀️/🌙 按钮切换主题
```

## 下游传递

- 后续可扩展更多主题（高对比度、色盲友好模式）
- CSS 变量列表可在 `.theme-*` 类中扩展，无需改动组件
- xterm.js 的 `term.options.theme` 热更新在部分版本可能有闪烁，可考虑在切换时加上 `transition`
