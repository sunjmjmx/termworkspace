# Phase2-2 · 代码健壮性提升 · 知识沉淀

> 文档撰写时间：2026-07-01
> 撰写人：dark（自主操作员）
> 审核人：SUN

---

## 一、工作全景

| 维度 | 内容 |
|------|------|
| Phase | P2-2 代码健壮性提升 |
| 时间跨度 | 2026-06-30 → 2026-07-01 |
| 总投入 | 2 个 Worker 运行 |
| 交付物 | 功能已包含在 main 分支（经 Phase2-1 流式响应合并带入） |
| 当前状态 | ⚠️ 待审核 |

### 核心目标

使 TermWorkspace 适应各种用户的配置环境，做到：网络断开/API key 无效/配置缺失都不崩溃，首次运行自动引导配置，所有模块有日志。

---

## 二、工作过程记录

### 2.1 背景

Phase2-2 的代码修改实际上在 Phase2-1（流式响应支持）合并到 main 时已经附带引入。P2-1 开发过程中重构了 `app.py` 的 `main()` 入口（加入了配置自检 → init_wizard 自动启动），改进了 `do_send()` 的错误处理（区分 ValueError / aiohttp.ClientError / asyncio.TimeoutError），并为 `app.py`、`window.py`、`workspace.py` 补充了 logging。

P2-2 Worker #1 从 Phase1 MVP 分支 fork 产生了 5 项审计不符，被 Speckit Audit 驳回。Worker #2（本轮）从当前 main 重新分支，发现功能已就位，转入验证 + 文档阶段。

### 2.2 Worker 执行流水

| 轮次 | Worker | 起止时间 | 主要产出 | 结果 |
|------|--------|---------|---------|------|
| #1 | default | 06-30 21:59 → 06-30 22:14 | feat/robustness 分支 | ❌ Speckit Audit 不通过 |
| #2 | default | 07-01 11:57 → 至今 | feat/robustness-v2 验证+文档 | ⚠️ 待审核 |

### 2.3 关键决策节点

| 时间 | 决策 | 依据 | 影响 |
|------|------|------|------|
| 06-30 22:37 | 要求交付附截图+文档 | 之前缺乏可视交付物 | 本次补齐 3 张错误场景截图 |
| 07-01 08:21 | 增加知识沉淀文档 | 知识管理体系建立 | 本文件 |
| 07-01 11:57 | Speckit Audit 驳回 Worker #1 | 5 项声明不实（见下） | Worker #2 重新从 main 开始 |

---

## 三、Speckit Audit 分析（Worker #1 驳回项）

Worker #1 的 5 项不符的根本原因是：分支从 Phase1 MVP fork，没有包含 Phase2-1（流式响应）的代码改进。Phase2-1 合并时已经修复了大部分健壮性问题。

| # | 驳回项 | 根因 | 当前状态 |
|---|--------|------|---------|
| 1 | 声称6模块全加logging，实际缺3 | 旧分支代码未更新 | ✅ main 上全部6模块都有 logging |
| 2 | 声称do_send()区分错误类型，实际仅 blanket except | 旧分支代码 | ✅ main 上已区分 ValueError/ClientError/TimeoutError/Exception |
| 3 | 声称main()自动检测配置，实际仅app.run() | 旧分支 | ✅ main() 已有配置自检逻辑（app.py:845-854） |
| 4 | 声称支持--init，实际无参数处理 | 旧分支 | ✅ --init 已实现（app.py:827-840） |
| 5 | 分支从Phase1 MVP fork，与main冲突 | 分支基线错误 | ✅ 本分支从 main HEAD 创建，无冲突 |

---

## 四、已就绪的健壮性功能

### 4.1 日志（所有6个模块）

| 模块 | logging 状态 |
|------|-------------|
| `app.py` | ✅ `import logging` + `logger = logging.getLogger(__name__)` + `logging.basicConfig()` in `main()` |
| `config.py` | ✅ 完整 |
| `providers.py` | ✅ 完整 |
| `storage.py` | ✅ 完整 |
| `window.py` | ✅ 完整 |
| `workspace.py` | ✅ 完整 |

### 4.2 错误边界（do_send 异常处理链）

```python
# src/termworkspace/app.py (lines 722-756)
async def do_send():
    try:
        generator = await send_message(...)
        async for chunk in generator:
            ...
    except ValueError as e:
        # 配置缺失（无 API key / base URL / 模型名）
        panel.stream_error(str(e))
    except aiohttp.ClientError as e:
        # 网络连接失败
        panel.stream_error(f"网络连接失败: {e}")
    except asyncio.TimeoutError:
        # 请求超时
        panel.stream_error("请求超时，请检查网络连接")
    except Exception as e:
        # 未知错误
        panel.stream_error(f"未知错误: {e}")
    finally:
        panel.status = "idle"
```

### 4.3 首次运行配置向导

- `app.py main()` 入口自动检测 `~/.termworkspace/config.yaml`
- 不存在时自动调用 `ConfigManager.init_wizard()` 交互式引导用户配置 API Key
- 也支持 `termworkspace --init` 手动触发
- 用户跳过所有 provider 仍然能启动（有限功能模式）

---

## 五、截图证据

### 5.1 配置向导
```
文件：docs/screenshots/robustness/01-config-wizard.txt
内容：termworkspace --init 交互式引导过程
展示：3个 provider 逐一配置 → 模型选择 → 工作区命名 → 主题选择
```

### 5.2 API Key 无效
```
文件：docs/screenshots/robustness/02-invalid-api-key.txt
内容：send_message() 抛出 ValueError("无法找到模型 'xxx' 的 API key")
展示：错误消息格式为中文，app 不崩溃
```

### 5.3 网络断开
```
文件：docs/screenshots/robustness/03-network-down.txt
内容：aiohttp.ClientError 被捕获 → 友好中文提示
展示：网络连接失败 + 请求超时两种场景都有区分
```

---

## 六、可沉淀解决方案

### 6.1 多级异常处理模式

TermWorkspace 使用三层异常处理模式：

1. **底层（providers.py）**：`_send_sync_openai` / `_send_stream_openai` 捕获 `aiohttp.ClientError` / `asyncio.TimeoutError`，返回标准错误字典（非异常流）
2. **中间层（providers.py send_message）**：配置校验（无 API key、无 base URL）直接抛出 `ValueError`
3. **顶层（app.py do_send）**：捕获所有异常类型，通过 `panel.stream_error()` 在 UI 中显示中文友好提示

这种分层设计保证了：
- 底层网络错误不会导致整个 app 崩溃
- 配置错误有明确的异常类型可区分
- UI 层统一处理用户可见的错误展示

### 6.2 首次运行引导模式

`ConfigManager.init_wizard()` 的设计模式可复用：

1. 检测配置文件是否存在 → 存在则跳过
2. 确保配置目录存在
3. 深拷贝默认配置模板
4. 交互式引导用户输入（三层循环：provider → 地址 → key）
5. 保存到 YAML 文件
6. 可被 `main()` 入口自动检测调用，也可被 `--init` 标志手动触发

---

## 七、下游传递信息

### 7.1 分支信息

- 分支：`feat/robustness-v2`
- 基线：`main` (aca43e0)
- 工作区：`/Users/sunjmj/20260701_termworkspace`

### 7.2 对本阶段后续工作的建议

1. **日志文件持久化**：当前 logging 仅输出到 stderr，生产使用应考虑写入日志文件（`RotatingFileHandler`）
2. **错误通知增强**：目前错误在 UI 中展示后即消失，建议增加错误计数/通知历史
3. **配置热重载**：`ConfigManager` 支持运行时重新加载配置的功能
