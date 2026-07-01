# TermWorkspace

> 终端原生多模型 AI 工作台 · 自备 API Key · 零平台锁定

**TermWorkspace** 是一款开源、终端原生的多模型 AI 工作台。它运行在你的终端里，支持同时接入 DeepSeek、OpenAI、Anthropic 等多个模型提供商，所有对话历史和配置数据均存储在本地。你自带 API Key，没有任何平台锁定——数据归你，模型由你选。

---

## 🚀 快速安装

### pip 安装（推荐开发/本地使用）

```bash
cd ~/20260701_termworkspace
pip install -e .
```

### Homebrew

```bash
brew tap termworkspace/tap
brew install termworkspace
```

### curl 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/termworkspace/termworkspace/main/install.sh | bash
```

### 验证安装

```bash
termworkspace --version
```

---

## ⚙️ 首次配置

TermWorkspace 需要配置至少一个 API Key 才能使用。提供两种配置方式：

### 方式一：交互式向导

```bash
termworkspace --init
```

向导会提示你依次输入 DeepSeek / OpenAI / Anthropic 的 API Key，并自动生成配置文件。

### 方式二：手动编辑

配置文件位于 `~/.termworkspace/config.yaml`，参考以下结构：

```yaml
providers:
  deepseek:
    api_key: "sk-xxx"
    base_url: "https://api.deepseek.com/v1"
    default_model: "deepseek-chat"
  openai:
    api_key: "sk-xxx"
    base_url: "https://api.openai.com/v1"
    default_model: "gpt-4o"
```

详情参见仓库中的 `config.yaml.example`。

---

## ✨ 功能特性

| 特性 | 说明 |
|------|------|
| **多 Tab 多窗口** | `Ctrl+T` 新建标签页，`Ctrl+W` 关闭，独立管理多个对话会话 |
| **流式输出** | 基于 SSE 逐 token 实时显示，响应即时可见 |
| **多模型支持** | DeepSeek / OpenAI / Anthropic 一屏切换，下拉菜单自由选择 |
| **分屏布局** | 支持四种布局：`single`（单窗口）、`horizontal`（左右分屏）、`vertical`（上下分屏）、`grid`（2×2 四格） |
| **会话持久化** | SQLite 自动保存对话历史，重启后一键恢复 |
| **工作区模板** | 支持 YAML 格式导入/导出，分享和备份工作流配置 |
| **首次运行向导** | 首次启动自动检测配置，缺失时引导完成设置 |

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 新建标签页 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Q` | 退出程序 |
| `Ctrl+Enter` | 发送消息 |
| `Ctrl+Shift+E` | 导出当前工作区为 YAML |
| `Ctrl+Shift+I` | 从 YAML 导入工作区配置 |

---

## 🏗️ 架构说明

```
src/termworkspace/
├── __init__.py    # 包入口 & 公开 API
├── __main__.py    # CLI 入口（argparse 解析，--init / --help / --version）
├── app.py         # Textual 应用主循环（窗口管理器、Tab 切换、快捷键分发）
├── config.py      # YAML 配置读写 & 首次运行交互式向导
├── providers.py   # 模型 API 抽象层（OpenAI 兼容 / Anthropic 流式接入）
├── storage.py     # SQLite 对话历史持久化（异步 aiosqlite）
├── window.py      # AI 对话面板（独立模型绑定、输入/输出区域）
└── workspace.py   # 工作区管理（Tab 生命周期、分屏布局、模板导入/导出）
```

---

## 📁 项目配置

配置文件 `~/.termworkspace/config.yaml` 支持以下字段：

```yaml
providers:
  deepseek:
    api_key: ""            # API Key
    base_url: ""           # API 端点地址
    default_model: ""      # 默认模型
    models:                # 可用模型列表
      - name: "deepseek-chat"
        context_window: 65536
        max_tokens: 8192
workspaces:                # 可选：预定义工作区模板
  my_workspace:
    name: "我的工作区"
    panes:
      - id: pane1
        provider: deepseek
        model: deepseek-chat
settings:
  theme: catppuccin        # 主题
  temperature: 0.7         # 默认温度
  auto_save_interval: 60   # 自动保存间隔（秒）
```

---

## 🧪 开发和测试

确保已安装 Python 3.12+，克隆仓库后执行：

```bash
# 安装开发依赖
pip install -e ".[dev]"

# 运行测试
pytest tests/ -v

# 代码检查
ruff check src/termworkspace/

# 类型检查
mypy src/termworkspace/
```

项目使用 `ruff` 做 lint 和格式化，`mypy` 做类型检查，`pytest` 做单元测试。提交前请确保上述命令均通过。

---

## ❓ FAQ

**Q: 如何获取 API Key？**

- **DeepSeek**: [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

**Q: 如何更改模型？**

每个对话面板顶部都有一个下拉菜单，点击即可在当前 provider 的可用模型间切换。

**Q: 数据存储在哪里？**

所有对话历史和会话配置存储在 `~/.termworkspace/data.db`（SQLite 数据库），配置存储在 `~/.termworkspace/config.yaml`。

**Q: 如何备份？**

使用 `Ctrl+Shift+E` 导出工作区为 YAML 文件，之后再通过 `Ctrl+Shift+I` 或命令行恢复。建议定期备份 `~/.termworkspace/` 目录。

**Q: 支持哪些操作系统？**

macOS 12+（Monterey 及以上）和 Linux。需要 Python 3.12+ 和一个兼容的终端模拟器。
