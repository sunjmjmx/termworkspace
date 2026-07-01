# Phase2-4 · 会话持久化与恢复 · 知识沉淀

> 文档撰写时间：2026-07-01
> 撰写人：dark（自主操作员）
> 审核人：SUN

---

## 一、工作全景

| 维度 | 内容 |
|------|------|
| Phase | P2-4 会话持久化与恢复 |
| 时间跨度 | 2026-06-30 → 2026-07-01 |
| 总投入 | 3 个 Worker 运行（#1 timed_out, #2 Speckit驳回, #3 通过） |
| 交付物 | `window.py` 持久化API + `app.py` 启动恢复 + `storage.py` DB对接 |
| 当前状态 | ✅ 已合并至 main |

### 核心目标

关闭 TermWorkspace 后重新打开，对话历史不丢失——每条消息自动保存到 SQLite，启动时自动加载上次会话。

---

## 二、工作过程记录

### 2.1 Worker 执行流水

| 轮次 | Worker | 起止时间 | 主要产出 | 结果 |
|------|--------|---------|---------|------|
| #1 | default | 06-30 21:59 → 06-30 22:21 | feat/session-persistence 分支（window.py + app.py 改造） | ⏳ timed_out（80次迭代耗尽） |
| #2 | default | 06-30 22:21 → 06-30 22:37 | 同上 + 截图 + 文档 | ❌ Speckit Audit 不通过（scope creep混入P2-3/P2-5内容） |
| #3 | default | 07-01 12:20 → 07-01 12:27 | feat/session-persistence-v2 从main重做 | ✅ 审核通过已合并 |

### 2.2 关键决策节点

| 时间 | 决策 | 依据 | 影响 |
|------|------|------|------|
| 06-30 22:37 | 要求交付附截图+文档 | 之前缺乏可视交付物 | 补齐3张错误场景截图 |
| 07-01 08:21 | 增加知识沉淀文档 | 知识管理体系建立 | 本文件 |
| 07-01 12:20 | Speckit Audit驳回Worker #2 | scope creep（混入模板/打包文件） | Worker #3从main重做 |

---

## 三、核心实现

### 3.1 数据架构

```sql
-- SQLite conversations 表（StorageManager 自动创建）
CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ws_name     TEXT NOT NULL,       -- 工作区名
    tab_name    TEXT NOT NULL,       -- 标签页名
    window_id   TEXT NOT NULL,       -- 面板 UID
    role        TEXT NOT NULL,       -- user / assistant / system
    content     TEXT NOT NULL,
    model       TEXT DEFAULT '',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 三层层级结构

```
TermWorkspace
 └─ Workspace (e.g. "通用写作")
     └─ Tab (e.g. "写作工作区")
         └─ Panel (AIWindowPanel, 含独立UID)
             └─ Messages (role + content + model)
```

每条消息以 `(ws_name, tab_name, window_id)` 三元组区分所属，确保多工作区、多标签页、多面板场景下数据不串。

### 3.3 数据流

```
用户输入
   → action_send_message()
   → add_message("user", text)
   → _save_callback("user", text, model)      # 自动保存到 SQLite
   → post_message(SendRequested)
   → app.py do_send()
   → stream_chunk(chunk)                       # 行内追加到 TextArea
   → stream_end()
   → add_message("assistant", full_content)
   → _save_callback("assistant", full, model)  # 完成消息自动保存

Clear
   → clear_conversation()
   → _clear_callback()                         # 清除 SQLite 记录
   → post_message(ConversationCleared)         # 通知 app 层

启动
   → app.py on_mount → init_persistence()
   → StorageManager.init_db()                   # 创建表
   → _restore_one_panel(panel)                  # 加载历史
   → _wire_one_panel(panel)                     # 注册回调
```

### 3.4 流式消息保存策略

| 阶段 | 行为 | 保存时机 |
|------|------|---------|
| streaming 中 | `stream_chunk` 累加内容到 `_streaming_content` | 流结束前不持久化 |
| streaming 结束 | `stream_end` 提交完整消息到 `self.messages` + 触发 `_save_callback` | 完整消息一次性写入DB |
| streaming 出错 | `stream_error` 提交 system 错误消息 | 错误消息立即保存 |

这种"延迟保存"策略避免了每条流式chunk都写DB的开销，同时确保错误中断时用户能看到失败原因。

---

## 四、API 参考

### 4.1 AIWindowPanel 新增接口

| 方法 | 参数 | 说明 |
|------|------|------|
| `ws_name` | property | 工作区名（存储作用域） |
| `tab_name` | property | 标签页名（存储作用域） |
| `set_storage_callbacks(on_save, on_clear)` | `on_save(role, content, model)`, `on_clear()` | 注册存储回调 |
| `load_messages(msgs)` | `list[dict]` | 从存储恢复会话到面板 |
| `stream_chunk(content)` | str | 追加流式文本块 |
| `stream_end()` | — | 完成流：flush buffer → 提交消息 → 保存 |
| `stream_error(msg)` | str | 流错误处理 |

### 4.2 StorageManager 核心 API

| 方法 | 说明 |
|------|------|
| `init_db()` | 创建 `conversations` 和 `workspaces` 表 |
| `save_message(ws_name, tab_name, window_id, role, content, model)` | 写入一条消息 |
| `get_history(ws_name, tab_name, window_id)` | 按创建时间升序加载全部消息 |
| `clear_history(ws_name, tab_name, window_id)` | 删除该面板的全部历史 |

---

## 五、工程规范

### 5.1 回调注册模式

Panel 不持有 StorageManager 引用，通过回调解耦：

```
app.py  _wire_one_panel()
  ├── 创建 on_save 闭包（持有 ws_name/tab_name/window_id）
  ├── 创建 on_clear 闭包
  └── panel.set_storage_callbacks(on_save=..., on_clear=...)
```

**优势**：Panel 不需要 import storage 模块，不需要了解 SQLite。替换存储后端只需改 app.py 中的回调创建逻辑，Panel 层零改动。

### 5.2 异步保存

回调内使用 `asyncio.create_task` 异步写入 DB，不阻塞 UI 线程：

```python
def on_save(role: str, content: str, model: str) -> None:
    asyncio.create_task(
        StorageManager.save_message(ws_name, tab_name, window_id, role, content, model)
    )
```

### 5.3 验证方法

```bash
# 启动应用
python -m termworkspace

# 发送一条消息 → 关闭 (Ctrl+C) → 重新启动
# 验证：历史消息应自动恢复

# 按 ✕ Clear → 关闭 → 重新启动
# 验证：对话历史应为空
```

---

## 六、已知问题与下游传递

### 6.1 无归档/导出功能

当前仅支持 SQLite 内持久化。用户无法将聊天记录导出为文件。建议 P2-6+ 考虑。

### 6.2 无消息搜索

不支持在历史会话中搜索关键词。当前仅按创建时间顺序加载全部消息。

### 6.3 架构决策

| 决策 | 理由 |
|------|------|
| SQLite 而非文件存储 | SQLite 单文件、零依赖、支持结构化查询、适合 1k-10k 条消息规模 |
| 回调解耦 Panel ↔ Storage | 保持 Panel 层纯净，不引入存储依赖 |
| 流式延迟保存 | 避免每条 chunk 写 DB，减少 I/O 开销 |
| 三元组作用域 (ws/tab/window) | 支持未来多工作区/多标签页场景，不改 schema 即可横向扩展 |

---

## 七、小结

P2-4 实现了 TermWorkspace 的会话持久化基础能力。核心设计是回调解耦 + 异步写入 + 延迟保存的组合，兼顾了实时性（用户输入立即显示）和持久化可靠性（消息完整落盘）。代码量约 167 行（window.py 层 + app.py 对接 + storage.py 原有基础），修改集中在 `app.py` 的启动流程和 `window.py` 的流式 API 增强，对已有架构侵入小。
