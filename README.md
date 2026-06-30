# TermWorkspace

> 终端原生多模型 AI 工作台。自带 API Key，自由组合模型。正在开发中。

## 定位

一个开源的、终端原生的多模型 AI 工作台。用户自带 API Key，自由组合模型，按 workspace 组织工作流。

对标 Poe / ChatGPT，但差异是：本地运行、终端原生、用户自己管理 Key、没有平台锁定。

## 项目结构

```
src/
├── app.py          # Textual 应用入口
├── workspace.py    # Workspace 管理（Tab + 窗口布局）
├── window.py       # AI 对话窗口（每个窗口独立模型绑定）
├── providers.py    # 模型 API 抽象层
├── config.py       # YAML 配置管理
└── storage.py      # 对话历史持久化
tests/
├── test_providers.py
├── test_config.py
└── test_window.py
docs/
