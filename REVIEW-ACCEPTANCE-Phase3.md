# Phase 3 开发团队验收报告

---

## 验收测试流程

**适用对象**: 研发审核团队  
**目标**: 在合并到 `main` 前，系统化验证 Phase 3 全部交付物的完整性、正确性和零缺陷移交。

---

### 一、前置条件确认

| 项目 | 状态 |
|:----|:-----|
| Git baseline (main) | ✅ commit `a57040c` base |
| 分支隔离 | ✅ 所有 Worker 在 `feat/` 分支工作 |
| Review 锁定 | ✅ Worker `block(review-required)` 后未 unblock |
| 构建产物 | ✅ `npm run build` 成功 |
| TypeScript 编译 | ✅ `tsc --noEmit` 零错误 |

---

### 二、验收测试执行步骤

请按以下顺序逐一执行：

**Step 1 — 拉取最新 main**

```bash
git checkout main && git pull --rebase
```

**Step 2 — 项目环境确认**

```bash
# Node 项目
npm ci
# 或 Python 项目
# source .venv/bin/activate && pip install -r requirements.txt
```

**Step 3 — 全量 Vitest 单元测试**

```bash
npx vitest run
```

> 当前基线: **53/54 通过**, 1 个失败详见 §2（行为变更待审核）

**Step 4 — TypeScript 编译检查**

```bash
npx tsc --noEmit
```

> 预期: 零错误

**Step 5 — 生产构建验证**

```bash
npm run build
```

> 确认产物完整:
> - `dist/index.html`
> - `dist/assets/*.js` + `*.css`
> - `dist-electron/main/index.js`
> - `dist-electron/preload/index.cjs`

**Step 6 — 运行时集成测试**

```bash
# 主进程持久化验证（布局/聊天/主题/文件浏览器）
node tests/integration/main-process-verify.mjs

# PTY 分层测试（Tier 2 Python bridge + Tier 3 raw spawn）
node tests/integration/pty-tier-test.mjs
```

> 预期: main-process-verify 19/19 通过, pty-tier-test 15/16 通过（Tier 1 node-pty 系环境限制）

---

### 三、审核要点（按优先级）

| 优先级 | 检查项 | 方法 |
|:------|:-------|:-----|
| 🔴 P0 | **代码真实性** | `git log feat/xxx --oneline` 确认有实际 commit；`git diff main...feat/xxx --stat` 确认 files changed ≠ 0 |
| 🔴 P1 | **交付链完整性** | 上游交付物是否被下游正确调用？每个 commit 对应哪个 Kanban 任务？ |
| 🟡 P2 | **行为变更审查** | `platform.test.ts onError` 调用 2 次（见 §2）— 接受新行为或还原，需决策 |
| 🟢 P3 | **范围控制** | 只改了任务指定的文件，无 scope creep |
| 🟢 P4 | **Pitfall 检查** | 分支从最新 main fork？preload 签名与 renderer 传参一致？守卫移除检查了全部 7 级联层？ |

---

### 四、决策链

```
审核团队结论
    │
    ├─ ✅ 接受新行为（onError 调 2 次合理）
    │   → 更新 test expectation
    │   → 全量 54/54 通过 → merge → done
    │
    └─ ❌ 拒绝新行为（需还原 fallback 设计）
        → 创建修复 Kanban 任务
        → Worker 还原行为
        → 测试自动恢复
        → 审核通过后 merge
```

---

### 五、回滚路径

```bash
# 如有必要，回退 main 到验证前状态
git checkout backup-main-before-reset
# 或
git reset --hard a57040c
```

---

## Phase 3 开发团队验收报告

**项目**: TermWorkspace  
**阶段**: Phase 3 — 平台抽象 + 多 AI 提供者 + 多窗口/标签页修复  
**构建**: `main` (commit `a57040c` base，回退重做后)  
**日期**: 2026-07-03  

---

## 1. 测试结果总览

| 测试套件 | 通过/总数 | 状态 |
|:---------|:---------|:-----|
| Vitest 单元测试 | 53/54 | ⚠️ 1 失败（见 §2） |
| 集成测试 — 主进程验证 | 19/19 | ✅ |
| 集成测试 — PTY 分层 | 15/16 | ✅ (Tier 1 node-pty 不可用，已知环境限制) |
| TypeScript 编译 (`tsc --noEmit`) | 0 errors | ✅ |
| Vite 构建 | 成功 | ✅ |

## 2. 唯一失败 — 需审核

### `tests/platform.test.ts > createPTY fallback chain > Tier 1 error propagates to onError callback`

- **预期**: `onError` 被调用 **1** 次
- **实际**: `onError` 被调用 **2** 次
- **根因**: Tier 1 (node-pty) 抛出 `NATIVE_MODULE_FAIL` 后 fallback 到 Tier 2 (Python PTY bridge)；Tier 2 也失败（execSync 抛出 `no python`）。Fallback chain 在每个 tier 失败时均触发 `onError` 回调。因此当 2 个 tier 都失败时，`onError` 被调用 2 次。
- **行为变更**: P3-2 引入了 3-tier fallback chain（node-pty → Python bridge → raw spawn），而该测试编写于单 tier 时代，仅考虑了一个错误源。这不是回归，而是测试精度未随行为变更更新。
- **审核点**: `onError` 被调用 **2 次** 是正确行为还是过度？如果 AI 提供者端以 onError 计数做重试判断，过多回调可能触发不必要的重试逻辑。建议审核团队确认：
  1. 是否应改为仅最后一次 fallback 失败时触发 `onError`（抑制中间层错误回调）？
  2. 是否需要 `onError` 携带 tier 信息以便调用者区分错误源？

### 当前测试代码（行 170-188）

```typescript
// Tier 1 throws NATIVE_MODULE_FAIL, Tier 2 also fails (no python)
// Both tiers call onError → 2 calls total
expect(onError).toHaveBeenCalledTimes(1); // stale — should be 2 or redesign
```

## 3. 已知环境限制（非代码问题）

| 限制项 | 说明 |
|:------|:-----|
| node-pty (macOS Intel) | 因系统级 posix_spawnp 失败，node-pty 在集成测试环境不可用。Tier 1 自动 fallback 到 Tier 2。不影响运行时行为。 |
| Chunk size warning | 构建时 JS chunk 546KB > 500KB 阈值，可后续用 dynamic import 优化，非阻塞项。 |

## 4. 交付清单

| 交付物 | 路径 | 大小 |
|:------|:-----|:-----|
| Renderer bundle | `dist/index.html` + `dist/assets/` | 16.76KB CSS + 546KB JS |
| 主进程 | `dist-electron/main/index.js` | 14.95KB |
| Preload | `dist-electron/preload/index.cjs` | (从 src 复制) |

## 5. 回滚信息

- **备份分支**: `backup-main-before-reset` (commit `f6933df`)
- **回退方案**: `git reset --hard backup-main-before-reset`
