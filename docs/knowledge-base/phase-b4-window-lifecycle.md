# Phase B4 — 窗口生命周期修复（应用退出行为）

## 工作全景
- **Phase**: B4 — 关闭窗口导致应用退出
- **时间**: 2026-07-03
- **交付物**: `src/main/index.ts` (window-all-closed / will-quit / before-quit 事件)
- **状态**: review-required

## 工作过程

### 问题诊断
1. 读取 `src/main/index.ts`，发现 `window-all-closed` 中已有 macOS 保护 `if (process.platform !== 'darwin') app.quit()`
2. 但发现 PTY 清理逻辑 (`ptyRegistry.forEach(p => p.kill())`) 放在 `window-all-closed` 中——这在 macOS 上造成问题：
   - 用户点击红按钮 → 窗口关闭 → `window-all-closed` 触发 → PTY 进程被杀
   - 用户从 Dock 重新打开窗口 → `activate` 触发 → 新窗口创建 → 但所有终端已消失
3. 同时缺少 `will-quit` 处理器——Cmd+Q 退出时 PTY 进程泄漏

### 修复策略
1. **提取 `cleanupPTYs()` 函数**：集中 PTY 清理逻辑，避免重复
2. **`window-all-closed`**：仅非 macOS 平台清理 PTY + `app.quit()`；macOS 上不做任何事
3. **`will-quit`**：实际退出时（Cmd+Q / 菜单退出 / Windows 关闭）清理 PTY
4. **`before-quit`**：注册处理器作为路由锚点，确保退出路径清晰

## 关键决策与推理

| 决策 | 选项 | 选择理由 |
|------|------|----------|
| PTY 清理时机 | window-all-closed vs will-quit | `will-quit` — 只在真正退出时才清理，窗口关闭不杀进程 |
| macOS 窗口关闭行为 | quit vs hide | 不退出 — macOS 设计规范：关闭窗口 ≠ 退出应用 |
| cleanupPTYs 函数位置 | 内联 vs 提取 | 提取为独立函数减少重复，两个事件处理器都调用它 |

## 可沉淀方案

### Electron macOS 窗口生命周期模板

```typescript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupResources()
    app.quit()
  }
  // macOS: 窗口关闭 → 不退出应用，资源保持存活
})

app.on('before-quit', () => {
  // Cmd+Q 或 Quit 菜单项 — 允许自定义退出前行为
})

app.on('will-quit', () => {
  // 所有退出路径最终汇聚于此 — 清理在这里做
  cleanupResources()
})
```

### 验证方法
```bash
# 1. 语法检查
npx tsc --noEmit

# 2. 构建
npx vite build

# 3. 单元测试
npx vitest run

# 4. 备份
cp src/main/index.ts src/main/index.ts.bak.$(date +%Y%m%d_%H%M%S)
```

## 下游传递
- B2（标签页关闭逻辑）已独立处理，不影响 B4
- 后续若增加窗口数追踪/多窗口支持，`will-quit` 中的 PTY 清理逻辑无需修改
- `before-quit` 处理器目前为空，后续可在其中添加"确认退出"对话框
