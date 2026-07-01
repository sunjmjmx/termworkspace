# Phase2-1 · 流式响应支持 · 知识沉淀

> 文档撰写时间：2026-07-01
> 撰写人：dark（自主操作员）
> 审核人：SUN（待审核）

---

## 一、工作全景

| 维度 | 内容 |
|------|------|
| Phase | Phase2-1 流式响应支持（Streaming Output） |
| 时间跨度 | 2026-06-30 21:59 → 2026-06-30 23:22 |
| 总投入 | 2 轮 Worker 运行，合计约 52 分钟 |
| 交付物 | feat/streaming-output 分支 / docs/streaming.md / docs/screenshots/streaming-verification.txt |
| 当前状态 | ⚠️ 待 SUN 审核（review-required） |

### 核心目标

AI 回复逐字输出（streaming），用户不用等全部生成才看到内容。涉及三层改动：
- providers.py → 返回 AsyncGenerator 逐 chunk 流
- app.py → async for 消费 generator，三路分支（content/done/error）
- window.py → stream_chunk/stream_end/stream_error API

---

## 二、工作过程记录

### 2.1 Worker 执行流水

| 轮次 | Worker Run | 起止时间 | 主要产出 | 结果 |
|------|-----------|---------|---------|------|
| #1 | run 11 | 21:59 → 22:14 (15min) | app.py 流式消费代码 + window.py 引用，scope creep 混入 | ❌ Speckit 审计未通过 |
| #2 | run 19 | 22:45 → 23:22 (37min) | window.py 补全 stream_chunk/end/error，scope creep 剥离，文档+验证文件生成 | ✅ 代码已修复，待审核 |

### 2.2 关键决策节点

| 时间 | 决策 | 依据 | 影响 |
|------|------|------|------|
| 22:14 | 不自动 complete，用 review-required 阻塞 | Speckit 循环验证策略——Worker 不能判断改动是否正确 | 阻止了错误代码进入 main |
| 22:14-22:44 | 人工 Speckit 审计 | 发现 window.py 缺 3 个 streaming 方法，代码运行会 AttributeError 崩溃 | 第二轮 Worker 针对性修复 |
| 22:44 | Audit 报告贴回任务后 reclaim | 让 Worker 带着审计反馈重跑 | Worker 读取 comment 线程后修复了全部问题 |

---

## 三、异常与处理

### 3.1 技术异常

| 异常 | 根因 | 处理方式 | 是否已修复 |
|------|------|---------|----------|
| window.py 缺失 stream_chunk/stream_end/stream_error 方法 | Worker #1 生成了 app.py 的调用代码但未定义被调用的方法；handoff 报告中声称已实现但实际代码不完整 | Speckit 审计发现 → 贴回任务 → Worker #2 补全 | ✅ 已修复 |
| app.py 运行时 AttributeError | 同上，代码逻辑不完整 | 同上 | ✅ 已修复 |
| 项目目录混入非 Phase2-1 的改动（pyproject, Formula, templates, tests） | Worker #1 在同一个分支上做了多 Phase 的工作 | scope creep 剥离提交（commit 0ad95e9）→ 各自独立分支 | ✅ 已剥离 |

### 3.2 流程异常

| 异常 | 根因 | 处理方式 | 预防措施 |
|------|------|---------|---------|
| Worker 误报 handoff 内容 | Worker 生成的 handoff JSON 看上去完整但代码实际不支持 | 人工 Speckit 审计 + 实际代码检查 | review-required 阻塞机制 + 审计必须在 complete 之前 |
| 旧 scratch Worker 遗留 feat 分支 | 初始使用 scratch workspace，worker cd 进项目目录创建了分支 | 清理 + 重建 dir workspace 任务 | 任务创建时必须指定正确的 workspace 类型 |
| 交付物截图缺失 | 截图要求在 Worker 完成之后才加入任务注释 | 第二轮补了验证日志 | 交付物要求在任务创建时就写在 body/comment 中 |

---

## 四、可沉淀解决方案

### 4.1 技术方案：Textual TUI 流式输出模式

```python
# window.py 核心实现模式

# 状态管理
self._streaming: bool = False          # 当前是否在 streaming 中
self._streaming_content: str = ""      # 累积的 streaming 内容

def stream_chunk(self, content: str) -> None:
    """逐 chunk 追加。第一 chunk 自动创建 assistant header。"""
    if not self._streaming:
        self._streaming = True
        self._streaming_content = content
        history.text += f"\n\n── assistant ──\n{content}"
    else:
        self._streaming_content += content
        history.text += content
    history.scroll_end(animate=False)

def stream_end(self) -> None:
    """结束 streaming，记录完整消息到 messages。"""
    if not self._streaming:
        return
    self.messages.append({"role": "assistant", "content": self._streaming_content})
    self._streaming = False
    self._streaming_content = ""

def stream_error(self, msg: str) -> None:
    """错误处理。无内容时清除空白 header，有内容时追加错误信息。"""
    if not self._streaming:
        self.messages.append({"role": "system", "content": f"Error: {msg}"})
        history.text += f"\n\n── system ──\nError: {msg}"
        return
    # 已有部分内容 → 追加错误信息
```

```python
# app.py 消费模式

async def do_send():
    generator = await send_message(..., stream=True)
    async for chunk in generator:
        if chunk.get("done"):
            panel.stream_end()
        elif chunk.get("error"):
            panel.stream_error(chunk["content"])
        else:
            content = chunk.get("content", "")
            if content:
                panel.stream_chunk(content)

asyncio.create_task(do_send())  # 不阻塞主循环
```

### 4.2 工程规范：Kanban Worker 审计门禁

- **review-required 阻塞模式**：所有代码改动任务的 Worker 必须用 `kanban_block(reason="review-required: ...")` 替代 `kanban_complete`，等人审核后再落地
- **Speckit 循环验证**：每个代码交付物必须经过三层检查——代码一致性（实际代码 vs handoff 报告）、交付物完整性（截图+文档+验证）、范围控制（不越界做其他 Phase 的事）
- **Handoff 报告必须可验证**：Worker 声称的改动必须能在对应文件的代码中找到，不能只写 JSON 摘要

### 4.3 验证方法

```bash
# Ollama 本地验证 streaming
curl http://localhost:11434/api/generate \
  -d '{"model":"qwen3.5","prompt":"Count to 3","stream":false}'

# Python 层验证 streaming 输出
python3 -c "
from src.termworkspace.providers import send_message
import asyncio
async def test():
    gen = await send_message(model_name='qwen3.5', ...)
    async for chunk in gen:
        print(chunk)
asyncio.run(test())
"
```

---

## 五、向下游传递的信息

### 5.1 已知问题（待后续 Phase 处理）

- **TUI layout bug（pre-existing）**：Textual 启动时存在布局渲染偏差，不影响 streaming 核心逻辑。建议在 Phase2-2（健壮性）或打包阶段处理
- **Ollama 集成未完成**：providers.py 原生的 DeepSeek/Anthropic streaming 路径已有，但项目中缺少一键配置 Ollama 本地测试的引导。建议 Phase2-4（会话持久化）时补上

### 5.2 架构决策

- **AsyncGenerator 模式**：providers.py 返回 AsyncGenerator，app.py 用 `async for` 消费，window.py 提供 `stream_*` 回调 API。三层分离清晰，各层可独立测试
- **多 panel 隔离**：每个 AIWindowPanel 有自己的 `_streaming` 状态变量，多 panel 同时 streaming 互不干扰
- **asyncio.create_task**：streaming 消费在后台协程中执行，不阻塞 Textual 主循环

### 5.3 后续建议

- Phase2-2（健壮性）开始时先读本 KB 文档的「异常与处理」章节，避免重复踩相同的坑
- Phase2-3（模板市场）和 Phase2-5（打包）可以利用本阶段剥离的独立分支（`feat/packaging`, `feat/template-market`）作为起点
- 后续所有 Worker 任务应在创建时就明确交付物清单（代码+截图+文档），不要等 Worker 跑完了才补

---

## 六、小结

Phase2-1 经历了典型的「2 轮迭代」模式——Worker 首轮产出有逻辑缺陷，Speckit 审计发现问题后修复。这个过程中验证了几个机制的有效性：

**值得保持的做法：**
- review-required 阻塞模式（阻止了错误代码流入 main）
- Speckit 循环验证审计（发现了代码不完整的问题）
- 审计报告贴回任务 + Worker 带着反馈重跑

**值得改进的流程：**
- 交付物要求在 Worker 启动前就明确（本轮截图要求是事后加的）
- Worker 的 handoff 报告应附带可执行的验证命令（本轮第二轮补充了）
- 公共知识库的建立可以使后续 Phase 复用前序经验
