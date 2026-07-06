# B14: API Key 配置 UI + 红色警告条常驻显示

## 问题

两个问题：

1. **红色警告条只在项目选择器叠加层显示**（`src/renderer/App.tsx:182-186`，在 `if (!projectPath)` 块内）。一旦用户选了项目文件夹进入主界面，警告消失，即使没有 API Key 用户也看不到提示。
2. **完全没有 API Key 配置界面**。用户必须手动编辑 `~/.termworkspace/.env` 文件，不知道格式、不知道文件名、不知道路径。

## 截图证据

App 主界面，模型下拉菜单列表中显示 `Kimi (kimi-k2.6) — no API key` 和 `DeepSeek (deepseek-v4-flash) — no API key`，但没有任何地方提示用户如何配置，也没有红色警告条。

## 现有基础设施

- `config:apikey-status` IPC 事件已在 `src/main/index.ts:376` 发出，renderer 在 `App.tsx:67-71` 监听并设置 `noApiKey` 和 `isPackaged` state
- 状态变量 `noApiKey`、`isPackaged` 已存在
- `.env` 文件四级 fallback 已实现（项目根 → process.env → `~/.termworkspace/` → `~/`）
- 模型列表在 `AIChat.tsx` 中显示 `!p.configured ? ' — no API key'` 标签

## 需要修改

### 1. 红色警告条常驻显示（轻量修复）
在 `App.tsx` 主界面渲染区（`if (projectPath)` 之后的 `return` 块），添加条件渲染：

```tsx
{noApiKey && (
  <div className="api-key-warning">
    ⚠️ 未配置 API 密钥 — 在右下角 ⚙️ 设置中添加
  </div>
)}
```

放在 TabBar 下方、app-content 上方，作为一个全局横幅。

### 2. API Key 设置面板（主要功能）
新增一个设置弹窗/面板，包含：

**a) 触发入口**
- 在 TabBar 右侧（灯💡图标旁边）添加 ⚙️ 齿轮图标按钮
- 点击弹出设置模态框

**b) 设置模态框内容**
- 标题："API 密钥配置"
- 每个 Provider 一行：
  - Provider 名称（如 "DeepSeek"、"Kimi/Moonshot"）
  - 输入框（type=password，可切换明文/密文显示 👁️）
  - 状态指示器（✅ 已配置 / ❌ 未配置）
- "保存"按钮 → 调用新的 IPC 通道 `config:save-api-key`
- "关闭"按钮

**c) 新增 IPC 通道**
- `src/main/index.ts` 中新增 `config:save-api-key` handler：
  ```typescript
  ipcMain.on('config:save-api-key', (event, { provider, key }) => {
    // 写入 ~/.termworkspace/.env
    // 格式: PROVIDER_API_KEY=sk-xxx
    // 如果文件不存在则创建
    // 更新内存中的 process.env
    // 广播 config:apikey-status 通知所有窗口
  })
  ```
- 已有 `config:apikey-status` 通道保持不变

**d) .env 文件写入逻辑**
- 读取现有 `~/.termworkspace/.env`
- 如果已有同 provider 的 key，替换（不要重复追加）
- 如果无，追加
- 写完后更新 process.env 并广播状态

### 3. CSS 样式
- `.api-key-warning` — 保持在主界面也可见，红色背景 + 白色文字，位置在 TabBar 下方
- `.settings-modal` — 模态框遮罩层，居中，深色背景主题
- `.settings-input` — 输入框，深色主题，密码输入
- `.settings-btn` — 保存/关闭按钮

## 验收标准

- [ ] 没有 API Key 时，主界面顶部显示红色警告条
- [ ] 配置 API Key 后，红色警告条消失
- [ ] TabBar 有 ⚙️ 齿轮图标，点击弹出设置面板
- [ ] 设置面板列出所有 provider（DeepSeek, Kimi），显示已配置/未配置状态
- [ ] 可输入并保存 API Key
- [ ] 保存后模型下拉菜单的 "— no API key" 标签消失
- [ ] API Key 被持久化到 `~/.termworkspace/.env`
- [ ] 重启 .app 后 API Key 仍有效
- [ ] 不破坏现有功能

## 不在此任务范围

- 项目文件夹选择功能（B13 单独处理）
- 多 Tab 布局优化
