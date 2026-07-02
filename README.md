# TermWorkspace

一个 macOS 终端工作台 —— 集成了文件树、AI 对话和会话持久化，让你在终端里写代码、查文档、问 AI，不用频繁切窗口。

## 截图

> 🖼️ *正在测试，截图待补充*

## 快速开始

```bash
git clone https://github.com/sunjmjmx/termworkspace.git
cd termworkspace
npm install
npm run build
npm start
```

> 首次使用需在项目根目录创建 `.env` 文件配置 AI API 密钥

详细的使用说明（安装、配置 API 密钥、日常场景、常见问题）见：

➡️ **[docs/user-guide.md](docs/user-guide.md)**

## 功能一览

- **多标签终端** — 多个 Tab，每个 Tab 一个独立终端会话
- **分屏模式** — 单个 Tab 内终端/AI 双面板
- **AI 对话** — 内置流式 AI 助手（支持 DeepSeek / Kimi）
- **文件浏览器** — 左侧文件树，点击文件显示路径
- **项目向导** — 启动时选择项目目录，自动 cd 到项目根目录
- **主题切换** — Dark / Light 双主题，关闭后自动记忆
- **会话持久化** — 关闭再打开，Tab 布局、AI 对话、主题设置全部恢复

## 技术栈

- Electron 33 + Vite 6 + React 19
- TypeScript + xterm.js + node-pty
- Vitest + Testing Library（36 个单元测试）

## 许可证

MIT
