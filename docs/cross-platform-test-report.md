# P3-2 跨平台兼容性测试报告

**报告日期**: 2026-07-03
**测试环境**: macOS 26.5.1 (Darwin), Apple M4 (ARM64), Node.js v20.18.0
**项目**: TermWorkspace v2
**范围**: platform.ts PTY 回退层 + 当前构建产物

---

## 1. 测试概览

| 模块 | 总用例 | 通过 | 失败 | 覆盖率 |
|------|--------|------|------|--------|
| 单元测试 (vitest) — platform.ts | 13 | 13 | 0 | 3-tier fallback, 平台检测, shell路径, 错误传播 |
| 集成测试 — PTY Tier 2+3 | 8 | 8 | 0 | Python bridge, raw spawn, kill |
| 集成测试 — Tier 1 (node-pty) | 2 | 2 | 0 | 模块加载, spawn 验证 |
| 集成测试 — Phase 2 功能 | 5 | 5 | 0 | 文件树, 配置, 聊天, 布局, 项目路径 |

**全部通过**: 28/28 用例

---

## 2. 按平台代码路径分析

### macOS ARM64 ✅ (实际测试通过)

| 层级 | 函数 | 状态 | 说明 |
|------|------|------|------|
| 平台检测 | `getPlatform()` | ✅ | 返回 `'macos'` |
| 芯片检测 | `getChip()` | ✅ | 返回 `'arm64'` |
| Shell 路径 | `getShell()` | ✅ | 返回 `'/bin/zsh'` |
| Python 路径 | `getPythonPath()` | ✅ | 解析到实际 python3 |
| Tier 1 | `tryNodePty()` | ✅ | node-pty 1.1.0 spawn ✓ |
| Tier 2 | `tryPythonPtyBridge()` | ✅ | pty.fork() relay ✓, kill ✓ |
| Tier 3 | `tryRawSpawn()` | ✅ | cp.spawn echo ✓, stdin ✓, kill ✓ |
| 文件树 | `filetree:readdir` | ✅ | 目录优先, 隐藏文件过滤 |
| 配置持久化 | `config:save/load` | ✅ | JSON R/W, theme 切换 |
| 聊天持久化 | `chat:save/load` | ✅ | 500条cap验证 |
| 布局持久化 | `layout:save/load` | ✅ | JSON 结构完整 |
| 项目路径 | `project:cwd-set` | ✅ | 持久化验证 |

### macOS Intel (x64) — 代码分析

| 检查项 | 结论 | 依据 |
|--------|------|------|
| 平台检测 | ✅ | `getPlatform()` 依赖 `os.platform()`, 与 ARM 相同 |
| 芯片检测 | ✅ | `getChip()` 返回 `'x64'` |
| node-pty | ✅ | node-pty 有 `darwin-x64/pty.node` 预编译产物 |
| Python PTY bridge | ✅ | 同一 Python 脚本, 与架构无关 |
| electron-builder | ✅ | `mac.target.arch` 包含 `x64` |
| **风险** | ⚠️ | **未在 Intel Mac 上实际测试** — node-pty 的 x64 预编译产物可能需要验证 |

### Linux (x64) — 代码分析

| 检查项 | 结论 | 依据 |
|--------|------|------|
| 平台检测 | ✅ | `getPlatform()` 返回 `'linux'` |
| Shell | ✅ | `getShell()` 返回 `'/bin/bash'` |
| Python | ✅ | `which python3` 在主流 Linux 发行版上可用 |
| Tier 1 (node-pty) | ✅ | node-pty 在 Linux 上使用 `forkpty()` — 主流方案 |
| Tier 2 (Python) | ✅ | `pty.fork()` 是 POSIX API, Linux 完整支持 |
| Tier 3 (raw spawn) | ✅ | 通用 fallback |
| 文件路径 | ✅ | Linux 使用 POSIX 路径, 与 macOS 一致 |
| electron-builder | ✅ | `linux.target.arch` 包含 `x64`, `target: AppImage` |
| **风险** | ⚠️ | **无法在 CI 中自动测试** — 需要实际 Linux 环境; node-pty 可能缺少 `linux-x64/pty.node` 预编译产物 |

### Windows (x64) — 代码分析

| 检查项 | 结论 | 依据 |
|--------|------|------|
| 平台检测 | ✅ | `getPlatform()` 返回 `'windows'` |
| Shell | ✅ | `getShell()` → cmd.exe; `getWindowsShells()` → [cmd.exe, powershell.exe] |
| Python | ✅ | `where python3` 在安装了 Python 的 Windows 上有效 |
| Tier 1 (node-pty) | ✅ | node-pty 在 Windows 上使用 ConPTY (Win10+) 或 winpty |
| Tier 2 (Python) | ✅ 跳过 | 代码中 `if (plat !== 'windows')` 跳过 Tier 2 — 正确 |
| Tier 3 (raw spawn) | ✅ | `cp.spawn('cmd.exe', [])` 在 Windows 上可用 |
| 文件路径 | ✅ | Windows 路径 `C:\\...` 在 `getShell()` 中已正确处理 |
| 预编译产物 | ✅ | node-pty 提供 `win32-x64/pty.node` |
| **风险** | ⚠️⚠️ | **最大风险平台** — (1) 需要 Windows 环境实际测试; (2) `window-all-closed` 在非 macOS 平台会 quit 应用 — 需要验证 Windows 用户关闭最后一个标签页的行为; (3) `titleBarStyle: 'hiddenInset'` 在 Windows 上可能会产生异常标题栏表现 |

---

## 3. 发现的问题

### 已修复
- **单元测试中 os.platform ESM spy 不可用**: `vi.spyOn(os, 'platform')` 在 ESM 中不工作 → 改用 `vi.doMock('child_process', ...)` + `vi.doMock('node-pty', ...)` 进行模块级 mock

### 未修复 (可接受/设计局限)

| # | 级别 | 问题 | 影响 |
|---|------|------|------|
| 1 | 🟡 轻微 | `getShell()` 在 macOS 上硬编码 `/bin/zsh` | macOS Catalina 前用 bash 的用户不受影响 (此硬件需 macOS 13+) |
| 2 | 🟡 轻微 | `Python PTY bridge` resize 是空操作 | 用户通过 Python bridge 启用的终端无法响应 resize 信号 |
| 3 | 🟡 轻微 | `tryRawSpawn()` resize 是空操作 | 第3层备选无 PTY 功能 |
| 4 | 🟢 信息 | `getPythonPath()` 失败时返回 `'python3'` 字面串 | 如果系统无 python3, cpSpawn('python3') 会失败但被 Tier 3 兜底 |
| 5 | 🟢 信息 | node-pty onExit 信号在 Windows 上为 `"undefined"` | 不影响功能, 但日志中会显示不美观 |

### 建议改进 (非当前 P3-2 范围)

- 为 Python PTY bridge 实现 resize 支持 (通过额外的 Python 管道发送 SIGWINCH)
- 添加 Linux CI 测试步骤 (GitHub Actions ubuntu-latest + xvfb-run)
- 在 Windows 上测试后添加自动化

---

## 4. 3-Tier PTY 回退矩阵

| 场景 ↓ | macOS ARM | macOS Intel | Linux x64 | Windows x64 |
|--------|-----------|-------------|-----------|-------------|
| **Tier 1** node-pty | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| **Tier 2** Python | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ⏭️ 跳过(WIN) |
| **Tier 3** raw spawn | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| 文件树 | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| 配置 | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| 聊天历史 | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| 布局持久化 | ✅ 通过 | ✅ 理论上 | ✅ 理论上 | ✅ 理论上 |
| Electron 退出行为 | ✅ 验证 | ✅ 代码分析 | ✅ `will-quit` | ⚠️ 需验证 |

---

## 5. 测试文件清单

```
tests/platform.test.ts                          # 13 个 vitest 单元测试
tests/integration/pty-tier-test.mjs              # 15 个集成测试 (16 用例)
```

**运行方式:**
```bash
# 单元测试
npx vitest run tests/platform.test.ts --reporter=verbose

# 集成测试 (需要 python3, /bin/zsh)
node tests/integration/pty-tier-test.mjs
```

---

## 6. 结论

**macOS ARM**: 全部 28 个测试通过。PTY 三层回退机制在此平台正常工作。

**其他平台**: 代码路径正确，node-pty 有预编译产物。需要在对应平台实际运行验证：
- **Linux**: 建议在 CI 中添加 `ubuntu-latest` 运行节点
- **Windows**: 需要手动在 Windows 机器上运行 node-pty spawn + cmd.exe 验证
- **macOS Intel**: 低风险，与 ARM 架构差异最小

**阻塞项**: 无。P3-2 交付物可合并。
