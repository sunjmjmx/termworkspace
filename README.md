# TermWorkspace

> 终端原生多模型 AI 工作台。自带 API Key，自由组合模型。

## 快速开始

### 方式 1：pip 安装（推荐）

```bash
pip install termworkspace
termworkspace --init   # 首次配置 API Key
termworkspace           # 启动
```

### 方式 2：GitHub + install.sh

```bash
git clone https://github.com/termworkspace/termworkspace.git
cd termworkspace
./install.sh
```

### 方式 3：Homebrew

```bash
brew tap termworkspace/termworkspace
brew install termworkspace
termworkspace --init
termworkspace
```

### 方式 4：本地开发

```bash
git clone https://github.com/termworkspace/termworkspace.git
cd termworkspace
pip install -e .
termworkspace
```

## 命令行参数

| 参数 | 说明 |
|------|------|
| `--help` | 显示帮助信息 |
| `--version` | 显示版本号 |
| `-c, --config PATH` | 指定配置文件路径 |
| `--theme {dark,light}` | 覆盖主题 |
| `--init` | 运行首次配置向导 |

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 新建工作区 Tab |
| `Ctrl+W` | 关闭当前 Tab |
| `Ctrl+Q` | 退出 |

## 项目结构

```
src/termworkspace/
├── __init__.py      # 包入口
├── __main__.py      # python -m termworkspace 入口
├── app.py           # Textual 应用入口 + CLI
├── workspace.py     # Workspace 管理（Tab + 窗口布局）
├── window.py        # AI 对话窗口（每个窗口独立模型绑定）
├── providers.py     # 模型 API 抽象层
├── config.py        # YAML 配置管理
└── storage.py       # 对话历史持久化
Formula/
└── termworkspace.rb # Homebrew Formula
install.sh           # 一键安装脚本
config.yaml.example  # 配置示例
pyproject.toml       # Python 打包配置
```

## 配置

配置文件在 `~/.termworkspace/config.yaml`，运行 `termworkspace --init` 交互式生成，
或手动编辑 `config.yaml.example` 为模板。

## 技术支持

- 定位：开源、终端原生、用户管理自己的 API Key、无平台锁定
- 对标：Poe / ChatGPT，但本地运行、终端原生、自由组合模型
- 依赖：Python 3.12+，Textual TUI 框架
