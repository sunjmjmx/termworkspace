# 🚀 TermWorkspace 快速上手指南

## 什么是 TermWorkspace？

**TermWorkspace** 是一个终端 AI 工作区管理工具。它让你在同一个终端界面中同时管理多个 AI 对话窗口，每个窗口可以绑定不同的 AI 模型，适用于写作、编程、分析等多种场景。

### 核心特性

- **多窗口管理** — 一个工作区内可创建多个 AI 对话窗口，每个窗口绑定不同的模型
- **多工作区** — 为不同任务（写作、编程、研究）创建独立工作区
- **多模型支持** — 同时使用 DeepSeek、OpenAI 等多个提供商的不同模型
- **纯终端界面** — 基于 Textual 构建，轻量快速，支持 SSH 远程使用
- **会话持久化** — 自动保存对话历史，随时恢复

---

## 安装步骤

### 前置要求

- **Python 3.12+**（推荐从 [python.org](https://www.python.org/downloads/) 下载安装）
- **pip**（通常随 Python 一起安装）
- 一个终端模拟器（macOS 自带 Terminal，推荐 iTerm2；Linux 推荐 GNOME Terminal 或 Konsole）

### 一键安装

```bash
# 1. 克隆或下载项目
git clone https://github.com/termworkspace/termworkspace.git
cd termworkspace

# 2. 运行安装脚本
chmod +x install.sh
./install.sh
```

安装脚本会自动完成以下操作：

1. ✅ 检查 Python 版本是否为 3.12+
2. ✅ 创建 `~/.termworkspace/` 配置目录
3. ✅ 安装所需的 Python 依赖
4. ✅ 复制示例配置文件（如果 `~/.termworkspace/config.yaml` 不存在）
5. 🔧 提示你编辑配置文件填入 API Key
6. 🚀 询问是否立即启动 TermWorkspace

### 安装过程示意

```
━━━ Step 1: 检查 Python 版本 ━━━
[INFO] Python 版本 3.12.4 ✓

━━━ Step 2: 创建配置目录 ━━━
[INFO] 已创建配置目录: /Users/username/.termworkspace

━━━ Step 3: 安装 Python 依赖 ━━━
[INFO] 正在安装依赖...
[INFO] 依赖安装完成 ✓

━━━ Step 4: 初始化配置文件 ━━━
[INFO] 已复制示例配置文件到: /Users/username/.termworkspace/config.yaml

━━━ ✅ 安装完成！━━━

请在启动前配置你的 API Key：
   nano ~/.termworkspace/config.yaml
```

### 手动安装

如果你偏好手动安装：

```bash
# 创建配置目录
mkdir -p ~/.termworkspace/sessions

# 安装依赖
pip install -r requirements.txt

# 复制配置文件
cp config.yaml.example ~/.termworkspace/config.yaml

# 启动
python -m termworkspace
```

---

## 首次配置

### 获取 API Key

TermWorkspace 默认支持以下 AI 模型提供商。你需要注册账号并获取 API Key。

#### 1. DeepSeek API Key

1. 访问 [DeepSeek 开发者平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入 **API Keys** 页面
4. 点击 **创建 API Key**
5. 复制生成的 Key（以 `sk-` 开头）

#### 2. OpenAI API Key

1. 访问 [OpenAI 开发者平台](https://platform.openai.com/)
2. 注册/登录账号（需要绑定支付方式）
3. 进入 **API Keys** → **Create new secret key**
4. 复制生成的 Key（以 `sk-` 开头）

### 编辑配置文件

```bash
# 用你喜欢的编辑器打开配置文件
nano ~/.termworkspace/config.yaml
# 或
vim ~/.termworkspace/config.yaml
```

找到以下部分，替换占位符：

```yaml
providers:
  deepseek:
    api_key: "你的 DeepSeek API Key"    # ← 替换这里

  openai:
    api_key: "你的 OpenAI API Key"      # ← 替换这里
```

保存后即可启动。

> **注意**：API Key 是敏感信息，请勿分享或提交到版本控制系统。`config.yaml` 文件默认位于 `~/.termworkspace/` 下，不会被 git 追踪。

---

## 界面说明

TermWorkspace 的界面由以下几个区域组成：

```
┌──────────────────────────────────────────────────┐
│  📝 写作工作区     ✍️ 主写作    💡 头脑风暴      │ ← 标签栏
├──────────────────────────────────────────────────┤
│                                                  │
│  用户: 帮我润色这段文字...                        │
│  AI: 好的，以下是我的润色建议...                  │
│                                                   │ ← 对话区
│  用户: 能否更简洁一些？                          │
│  AI: 当然，精简版本如下...                       │
│                                                   │
├──────────────────────────────────────────────────┤
│  > 输入你的消息...                                │ ← 输入栏
├──────────────────────────────────────────────────┤
│  Ctrl+W 切换窗口  Ctrl+T 切换工作区  Ctrl+S 设置│ ← 状态栏
└──────────────────────────────────────────────────┘
```

- **标签栏** — 当前工作区和打开的窗口标签，高亮当前活动窗口
- **对话区** — 当前窗口的对话历史，用户消息和 AI 回复交替显示
- **输入栏** — 在此输入你的问题或指令，按 Enter 发送
- **状态栏** — 显示快捷键提示、当前工作区/窗口状态

---

## 快捷键列表

### 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Q` | 退出 TermWorkspace |
| `Ctrl+S` | 打开设置面板 |
| `Ctrl+/` | 显示快捷键帮助 |

### 窗口管理

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Tab` | 切换到下一个窗口 |
| `Ctrl+Shift+Tab` | 切换到上一个窗口 |
| `Alt+1` ~ `Alt+9` | 直接切换到第 1~9 号窗口 |
| `Ctrl+W` | 关闭当前窗口 |

### 工作区管理

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 切换到下一个工作区 |
| `Ctrl+Shift+T` | 切换到上一个工作区 |
| `Ctrl+N` | 创建新工作区 |

### 对话操作

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` | 输入换行（多行消息） |
| `Ctrl+L` | 清空当前对话历史 |
| `Ctrl+R` | 重新生成上一条 AI 回复 |
| `Ctrl+C` | 复制当前选中的代码块或文本 |
| `Ctrl+D` | 删除当前选中的对话轮次 |
| `Up` / `Down` | 浏览历史输入（类似 shell 的 history） |

### 界面操作

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 搜索并跳转到指定的对话/窗口 |
| `Ctrl+F` | 在当前对话中搜索文本 |
| `Ctrl+E` | 导出当前对话为 Markdown 文件 |
| `Ctrl+Z` | 暂停/恢复 AI 回复（当模型正在生成时） |

---

## 常见问题

### Q: 启动后界面空白或报错？

**可能原因：**
- 配置文件格式有误（YAML 格式错误）
- API Key 未配置或配置错误
- Python 版本低于 3.12

**解决方法：**
1. 检查 YAML 格式：运行 `python -c "import yaml; yaml.safe_load(open('~/.termworkspace/config.yaml'))"`
2. 确认 API Key 是否正确填写（没有多余空格或引号）
3. 运行 `python --version` 确认 Python 版本

### Q: 如何添加更多的 AI 模型提供商？

编辑 `~/.termworkspace/config.yaml`，在 `providers` 下新增一个条目即可：

```yaml
providers:
  # ... 已有 provider ...
  
  anthropic:
    api_base: "https://api.anthropic.com/v1"
    api_key: "YOUR_API_KEY_HERE"
    default_model: "claude-3-opus-20240229"
    models:
      - name: "claude-3-opus-20240229"
        context_window: 200000
        max_tokens: 4096
```

### Q: 对话历史保存在哪里？

所有对话历史保存在 `~/.termworkspace/sessions/` 目录下，以 SQLite 数据库形式存储。你可以随时删除该目录中的文件来重置对话历史。

### Q: 如何更换界面主题？

在 `~/.termworkspace/config.yaml` 中设置 `settings.theme` 字段。支持的主题包括：
- `default` — 默认主题
- `dark` — 暗色主题
- `light` — 亮色主题
- `flexoki` — 暖色高对比
- `gruvbox` — Gruvbox 风格
- `catppuccin` — 猫猫主题（默认）
- `monokai` — Monokai 风格
- `solarized-light` — Solarized 浅色

### Q: 可以在 SSH 远程服务器上使用吗？

可以。TermWorkspace 基于终端文本界面（TUI），通过 SSH 连接即可正常使用。确保远程服务器上安装了 Python 3.12+ 及相应的依赖即可。

### Q: 如何升级 TermWorkspace？

```bash
# 更新代码
git pull

# 更新依赖
pip install -r requirements.txt --upgrade
```

### Q: 遇到问题如何反馈？

- **GitHub Issues**: https://github.com/termworkspace/termworkspace/issues
- **讨论区**: https://github.com/termworkspace/termworkspace/discussions

---

## 进阶使用

### 自定义工作区

你可以根据自己的需求创建任意数量的工作区和窗口。详细配置方式请参考 `config.yaml.example` 中的注释。

### 分享会话

使用 `Ctrl+E` 导出当前对话为 Markdown 文件，方便分享给同事或存档。

---

**现在你已经准备好开始使用 TermWorkspace 了！** 🎉

启动后输入你的第一条消息，体验多模型、多窗口的 AI 协作工作流。

```bash
./install.sh
```
