# Phase2-3: Workspace 模板市场

## 概述

为 TermWorkspace 添加 workspace 配置的导入/导出功能，让用户可以复用和分享工作区配置。

## 核心能力

### 1. 导出 Workspace（ConfigManager.export_workspace）

- 将当前配置中的 workspace(s) 导出为 YAML 文件
- 支持导出单个 workspace（按 key）或导出全部
- 输出格式兼容导入格式，可直接用于模板分享
- 失败时返回 False 并打日志（workspace 不存在、空 workspace 等）

```python
# 导出单个 workspace
ConfigManager.export_workspace("writing.yaml", workspace_key="writing")

# 导出全部 workspaces
ConfigManager.export_workspace("all-workspaces.yaml")
```

### 2. 导入 Workspace 模板（ConfigManager.import_workspace_template）

- 从 YAML 文件导入 workspace(s) 合并到当前配置
- 支持两种 YAML 格式：
  - **纯 workspaces**: 只有 workspaces 键
  - **含元数据**: 包含 template {name, description, ...} 和 workspaces
- 导入的 workspace 会覆盖同名的已有 workspace
- 返回 (imported_count, imported_keys)

```python
count, keys = ConfigManager.import_workspace_template("general-writing.yaml")
```

### 3. 列出可用模板（ConfigManager.list_template_dir）

- 扫描指定目录中的 YAML 文件
- 解析每个文件的 template 元信息
- 返回 name, description, filepath, workspace_count
- 跳过无效 YAML 文件（不会崩溃）

```python
templates = ConfigManager.list_template_dir("docs/templates")
```

## 内置模板

### 通用写作（general-writing.yaml）

| 窗口 | 模型 | 用途 |
|------|------|------|
| ✍️ 主写作 | DeepSeek Chat | 文章/报告/翻译 |
| 💡 头脑风暴 | DeepSeek Reasoner | 创意构思/大纲 |
| 🔍 精校润色 | GPT-4o | 语法校对/润色 |

### 编程调试（programming-debug.yaml）

| 窗口 | 模型 | 用途 |
|------|------|------|
| 👨‍💻 代码助手 | GPT-4o | 代码编写/调试 |
| 🧠 深度分析 | o1-mini | 架构/性能优化 |
| ⚡ 快速查询 | DeepSeek Chat | 快速技术问答 |

## 文件结构

```
docs/templates/
├── general-writing.yaml          # 通用写作模板
└── programming-debug.yaml        # 编程调试模板
tests/
└── test_config_templates.py      # 14 个测试用例
```

## 测试覆盖

14 个测试用例，覆盖：
- 导出：全部导出、单个导出、不存在 workspace、空 workspaces
- 导入：标准导入、覆盖同名、文件不存在、空模板、多 workspace 导入
- 列表：正常列出、跳过无效 YAML、空目录、文件名兜底
- 集成：导出→配置清空→再导入的 roundtrip

## 注意事项

- ConfigManager 的核心方法（export_workspace/import_workspace_template/list_template_dir）已存在于 main 分支的 config.py 中，仅模板 YAML 文件和测试文件是新提交
- 测试直接导入 config.py 模块（不依赖 __init__.py），无需启动完整应用
- 测试使用临时目录和路径monkey-patch，不会污染用户配置
- **本 Phase 严格限定在 P2-3 范围内**：不修改 window.py / app.py / __main__.py / Formula / install.sh / pyproject.toml

## 验证截图

截图文件位于 `docs/screenshots/template-market/01-export-output.txt`，演示了：
1. **导出** — 单个 + 全部 workspace 导出为 YAML，验证文件内容
2. **列出模板** — 扫描 docs/templates/ 找到 2 个模板并展示元信息
3. **导入** — 从 general-writing.yaml 导入，验证配置合并结果（3 个 pane 正确加载）
