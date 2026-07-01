# Phase2-2: 代码健壮性提升 · 知识沉淀

> 文档撰写时间：2026-07-01
> 审核人：SUN

---

## 一、工作全景

| 维度 | 内容 |
|------|------|
| Phase | P2-2 代码健壮性提升 |
| 时间跨度 | 2026-06-30 → 2026-07-01 |
| 总投入 | 3 次 Worker 运行（#12 blocked→unblocked, #23 blocked→unblocked, #28 当前轮） |
| 交付物 | 代码修复（__main__.py 去重）+ 3 份异常场景证据 + 本文档 |
| 当前状态 | ⚠️ 待审核 |

### 核心目标

项目能适应各种用户的配置环境：优雅处理网络断开、API key 无效、配置缺失等异常情况，所有模块有日志记录。

---

## 二、工作过程记录

### 2.1 Worker 执行流水

| 轮次 | Worker | 起止时间 | 主要产出 | 结果 |
|------|--------|---------|---------|------|
| #1 | default | 6/30 21:59 | 在 feat/robustness 分支实现 logging/error边界/wizard；因从 Phase1 MVP fork 导致与 main 冲突 | ❌ Speckit 审计未通过 |
| #2 | default | 7/1 11:57 | 验证代码已在 main 分支，产出文档+证据；未修复 main 上的 merge residue | ❌ 仍有残余问题 |
| #3 | default | 7/1 14:11 | 修复 __main__.py 重复 --init 代码；产出完整证据+本文档 | ⚠️ review-required |

### 2.2 关键决策节点

| 时间 | 决策 | 依据 | 影响 |
|------|------|------|------|
| 6/30 | 从 Phase1 MVP 分支开发 | 错误 — 应从 main 最新 HEAD 分支 | 导致与 main 冲突，Speckit 审计不通过 |
| 7/1 | 直接验证 main 包含的功能 | 代码已经通过 streaming merge 合入 main | 但遗漏了 merge residue（重复方法） |
| 7/1 | 修复 __main__.py 重复 --init 代码 | 两份相同的 init 处理逻辑会导致重复运行 | 删除冗余代码块 |

---

## 三、异常与处理

### 3.1 技术异常

| 异常 | 根因 | 处理方式 | 是否已修复 |
|------|------|---------|----------|
| __main__.py 重复 --init 代码 | merge conflict 解决不完整，双方代码被保留 | 删除重复的 Block（lines 72-76） | ✅ 已修复 |
| window.py 重复方法（推测） | P2-4 合并时双方改动冲突 | merge commit e473671 已处理，文件干净 | ✅ 已修复 |

### 3.2 流程异常

| 异常 | 根因 | 处理方式 | 预防措施 |
|------|------|---------|---------|
| branch 基线错误 | Worker 从 Phase1 MVP 分支，不是 main HEAD | rebase 到 main | preflight.py 已纳入 baseline 检查 |
| Speckit 审计未通过 | 代码功能在分支上但未合并到 main | 合入 main 后重新验证 | 确保 worker 基于正确的 baseline |
| 第三次运行发现 merge residue | 前两次 Worker 都未检查 merge 状态的完整性 | 修复并验证 | 需要在 handoff 前检查 git status 完整性 |

---

## 四、可沉淀解决方案

### 4.1 技术方案

#### 错误边界模式

```python
async def do_send():
    panel.status = "thinking"
    try:
        generator = await send_message(...)
        async for chunk in generator:
            # handle streaming...
    except ValueError as e:
        # 配置缺失（无 API key / base URL / 模型名）
        logger.warning("send_message config error: %s", e)
        panel.stream_error(str(e))
    except aiohttp.ClientError as e:
        # 网络连接失败
        logger.error("send_message network error: %s", e)
        panel.stream_error(f"网络连接失败: {e}")
    except asyncio.TimeoutError:
        logger.error("send_message timeout")
        panel.stream_error("请求超时，请检查网络连接")
    except Exception as e:
        logger.exception("send_message unexpected error")
        panel.stream_error(f"未知错误: {e}")
    finally:
        panel.status = "idle"
```

#### 配置初始化向导自动启动

```python
# app.py main() — 首次运行自动检测
from .config import ConfigManager as _CM
if not _CM.exists():
    _CM.init_wizard()
```

### 4.2 工程规范

- **所有模块必须 logging**：每个 .py 文件开头 `import logging; logger = logging.getLogger(__name__)`
- **错误必须分类**：对不同异常类型，用不同的 except 分支，而非笼统的 `except Exception`
- **配置缺失不应崩溃**：`TermWorkspaceApp.__init__` 中对 `_load_user_config()` 做 try/except，失败后仍可启动

### 4.3 验证方法

```bash
# 1. 语法检查
for f in src/termworkspace/*.py; do
  python3 -c "import ast; ast.parse(open('$f').read()); echo 'OK $f'"
done

# 2. 日志覆盖检查
for mod in app config providers storage window workspace; do
  grep -q "logging" src/termworkspace/$mod.py && echo "✅ $mod has logging"
done

# 3. 错误边界检查
grep -c "except ValueError\|except aiohttp.ClientError\|except asyncio.TimeoutError\|except Exception" src/termworkspace/app.py

# 4. 配置向导检查
grep -c "init_wizard" src/termworkspace/app.py  # → should be ≥2
grep "ConfigManager.exists" src/termworkspace/app.py  # → auto-detect path

# 5. preflight 基线检查
python3 preflight.py --task-id <task> --branch main --target main
```

---

## 五、向下游传递的信息

### 5.1 已知问题（待后续 Phase 处理）

- `preflight.py` 的 style 检查（code-reviewer）报告 18 个问题，主要为：API key 参数名被标记为"硬编码敏感信息"、`__init__.py`/`__main__.py` 文件名不符合 snake_case（实为 Python 标准约定）。这些是误报，可在 style rules 中添加例外处理
- 本地 Ollama 测试需先确认 `ollama serve` 是否运行

### 5.2 架构决策

- **错误优先中文提示**：网络错误 `"网络连接失败"`、超时 `"请求超时"` 等用中文给用户友好提示，logger 用英文便于调试
- **config load 优雅降级**：配置文件损坏或缺失时，app 仍可启动（有限功能），而非直接崩溃

### 5.3 后续建议

- 新增异常场景截图可使用 `computer_use` 工具抓取真实的 TUI 界面（本 Worker 为 headless 环境，用文本证据替代）
- 考虑为 `providers.py` 的 `_build_error_response()` 添加测试覆盖（当前只有代码存在，无单元测试）

---

## 六、小结

- **基线错误是最大的成本**：#1 Worker 从 Phase1 MVP 分支开发导致所有代码不被 main 接受，浪费整轮产出。preflight.py 的 baseline 检查是必要的拦路虎
- **merge 后必须验证完整性**：#2 Worker 假设 main 上的代码已经正确，未检查 merge conflict residue，导致问题遗留到下一轮
- **多轮迭代的价值**：Speckit Auditt 发现的 5 个问题，逐轮修正推动了质量上升。关键是从每个拒绝中提取明确的修改方向，而非重做同一套内容
