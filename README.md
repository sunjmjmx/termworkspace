# TermWorkspace

一个 macOS 终端工作台——集成多标签终端、AI 对话、文件浏览器，让你写代码、查文档、问 AI 都在一个窗口里完成。

## 截图

| 截图文件 | 场景描述 |
|:---------|:---------|
| `01-main-interface.png` | 主界面全貌——多标签终端 + 文件浏览器 + AI 对话面板 |
| `02-ai-chat.png` | AI 对话面板——与 AI 交流报错或代码问题 |
| `03-dark-theme.png` | 深色主题（Dark）——夜间编码模式 |
| `04-light-theme.png` | 浅色主题（Light）——日间编码模式 |
| `05-file-browser.png` | 文件浏览器——左侧文件树，点击显示路径 |
| `06-project-dialog.png` | 项目选择对话框——首次启动时选择代码目录 |
| `07-empty-tabs.png` | 空标签状态——所有 Tab 关闭后的占位界面 |
| `08-split-mode.png` | 分屏模式——终端和 AI 同面板快速切换 |

## 快速开始

```bash
# 1. 下载代码
git clone https://github.com/sunjmjmx/termworkspace.git

# 2. 安装依赖（首次约 1-2 分钟）
cd termworkspace && npm install

# 3. 构建并启动
npm run build && npm start
```

> **需要什么？** 一台 macOS 电脑，装好 **Node.js 18+** 和 **Git**。

## 功能一览

- **多标签终端** — 多个独立 Tab，每个 Tab 一个终端会话，支持新建、关闭、切换、重命名
- **分屏模式** — 单个 Tab 内终端和 AI 对话面板切换，不用切窗口
- **AI 对话** — 内置流式 AI 助手（支持 DeepSeek / Kimi），对话自动保存
- **文件浏览器** — 左侧文件树，点击文件自动显示路径
- **项目向导** — 启动时选择项目目录，自动 cd 到项目根
- **主题切换** — Dark / Light 双主题，关闭后自动记忆
- **会话持久化** — 关掉再打开，Tab 布局、AI 对话、主题全部恢复

## 技术栈

Electron 33 + Vite 6 + React 19 + TypeScript / xterm.js + node-pty / Vitest + Testing Library

## 项目结构

```
termworkspace/
├── src/
│   ├── main/          # Electron 主进程
│   ├── renderer/      # React UI 组件
│   ├── preload/       # 预加载脚本
│   └── types/         # TypeScript 类型定义
├── tests/             # Vitest 单元测试
├── docs/              # 文档和截图
└── package.json
```

## 许可证

MIT
