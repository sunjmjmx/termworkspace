# TermWorkspace 使用指南

用终端写代码，累了转头问 AI，关掉再打开一切还在——这就是 TermWorkspace。

---

## 安装说明

### 前置条件

- 一台 **macOS** 电脑（Intel 或 Apple Silicon 均可）
- **Node.js 18+** — 下载地址：[nodejs.org](https://nodejs.org/)
- **Git** — macOS 一般自带，终端跑 `git --version` 检查

### 安装步骤

打开终端（系统自带的「终端.app」或 iTerm2 都行），逐条执行以下命令：

```bash
# 第 1 步：下载代码
git clone https://github.com/sunjmjmx/termworkspace.git

# 第 2 步：进入项目目录
cd termworkspace

# 第 3 步：安装依赖（首次约 1-2 分钟）
npm install

# 第 4 步：构建应用
npm run build

# 第 5 步：启动
npm start
```

> `npm install` 会自动编译 node-pty 原生模块，首次可能需要安装 Xcode Command Line Tools。如果提示安装，点「同意」等几分钟即可。

### 首次启动

启动后你会看到一个「选择项目文件夹」的对话框（见截图 `06-project-dialog.png`）。选一个你的代码目录，终端会自动 cd 到那里，左侧文件树也会展开该目录。

**之后每次启动**会自动恢复你上次选的项目，不用再选。

### Gatekeeper 拦截

因为是未签名的应用，macOS Gatekeeper 可能会弹窗说「无法验证开发者」。这是正常的，按下面的方法处理：

1. 打开 **系统设置 → 隐私与安全性**
2. 往下翻到「安全性」区域
3. 看到「TermWorkspace」被拦截的提示，点 **「仍然打开」**
4. 或者：启动时按住 `⌃Control` 键点应用图标，菜单里选「打开」

---

## 卸载说明

TermWorkspace 是绿色应用，不写系统注册表，卸载就是删文件：

```bash
# 1. 退出 TermWorkspace（⌘Q）
# 2. 删除项目文件夹
rm -rf ~/termworkspace

# 3. 删除配置和数据（AI 对话记录、Tab 布局等）
rm -rf ~/.termworkspace/

# 4. 如果配置过 PATH 别名，一并清理（编辑 ~/.zshrc 删除相关行）
```

完事。不留痕迹。

---

## API 密钥配置

AI 对话需要配置 API 密钥。两种方式二选一：

### 方式一：.env 文件（推荐）

在项目根目录创建 `.env` 文件：

```bash
# DeepSeek（推荐，速度快，性价比高）
# 申请密钥：https://platform.deepseek.com/api_keys
DEEPSEEK_API_KEY=sk-你的密钥

# 或者 Kimi（长上下文，适合读代码和文档）
# 申请密钥：https://kimi.moonshot.cn/console/api-key
KIMI_API_KEY=sk-你的密钥
```

**两个都填也行**，程序按 KIMI → DEEPSEEK 优先级选第一个可用的。`.env` 文件已经写在 `.gitignore` 里，不会提交到 GitHub。

项目目录里有个 `.env.example` 文件作为模板，可以复制一份来改：

```bash
cp .env.example .env
# 然后编辑 .env 填入密钥
```

### 验证是否生效

启动后打开 AI 面板（点终端右上角的 🤖 按钮，或按 `⌘I`），输入任意内容发送。如果看到 `❌ No API key found`，说明没读到密钥——检查 `.env` 文件名和位置（必须跟 `package.json` 同目录）。

---

## 日常使用指南

以下每个场景对应一张截图，可以在 `docs/screenshots/user-guide/` 目录找到。

### 场景 1：首次启动——选择项目文件夹

启动应用后自动弹出项目选择对话框（截图 `06-project-dialog.png`），选择一个代码目录。选好后：
- 终端自动 `cd` 到该目录
- 左侧文件树自动展开
- 下次启动自动恢复，不会重复弹窗

### 场景 2：多标签终端管理

TermWorkspace 支持多个独立终端 Tab。主界面见截图 `01-main-interface.png`。

| 操作 | 方法 |
|------|------|
| 新建 Tab | 点 Tab 栏右侧的 **+** 按钮，或按 `⌘N` |
| 关闭当前 Tab | 点 Tab 上的 **×** 按钮，或按 `⌘W` |
| 切换 Tab | 点 Tab 标签，或按 `⌘1` 到 `⌘9` |
| 重命名 Tab | 点 Tab 标题文字，直接编辑 |

**关掉所有 Tab 会怎样？** 以前关到最后一个 Tab 就不能再关了。现在你可以关掉所有 Tab，界面会显示一个空白状态（截图 `07-empty-tabs.png`），再点 **+** 或按 `⌘N` 新建一个即可。

### 场景 3：AI 对话

写代码遇到问题，不用切到浏览器搜了——直接在终端里问 AI：

1. 点当前终端右上角的 **🤖** 按钮（或按 `⌘I`）
2. 终端区域切换为 AI 对话面板（截图 `02-ai-chat.png`）
3. 输入你的问题，比如「这个报错是什么意思：Error: ENOENT」
4. 看完回答，点 **🖥️** 按钮切回终端继续干活

**自动保存：** 关闭 TermWorkspace 后，AI 对话记录会自动存到 `~/.termworkspace/chats/`，下次打开自动恢复，不用担心中间问了什么忘了存。

### 场景 4：主题切换

点 Tab 栏右侧的 **🌙/☀️** 按钮切换主题：
- 🌙 是深色主题（Dark），适合晚上写代码（截图 `03-dark-theme.png`）
- ☀️ 是浅色主题（Light），适合白天（截图 `04-light-theme.png`）

**选一次就记住了**，下次启动还是你选的主题。

### 场景 5：文件浏览器

左侧文件树（截图 `05-file-browser.png`）显示当前项目的目录结构。点击文件，终端里会显示文件的完整路径——方便你 `cat`、`vim` 或者在 AI 对话里引用。

文件树可以折叠收起，给终端腾更多空间。

### 场景 6：分屏模式——终端 + AI 同面板

单个 Tab 里，你可以在终端和 AI 对话之间快速切换（截图 `08-split-mode.png`）：
- 点 **🤖** 切换到 AI 面板
- 点 **🖥️** 切回终端
- 两边不互相影响：终端在跑的命令不会因为切到 AI 就中断

适合一边跑测试、一边问 AI 关于报错信息的问题。

---

## 界面导航

```
┌──────────────────────────────────────────────┐
│  [项目路径]  Tab 1 │ Tab 2 │ Tab 3 │ + │ 🌙 │  ← Tab 栏
├──────────┬───────────────────────────────────┤
│           │                                   │
│  📂 src   │  $ npm run dev                    │
│  📂 docs  │  > VITE v6.0.0  ready...          │
│    📄 ... │                                   │
│  📄 .env  │  [🤖 → AI 对话面板]               │
│           │                                   │
│  ← 收起   │                                   │
└──────────┴───────────────────────────────────┘
  文件树             终端 / AI 面板
```

| 区域 | 作用 |
|:-----|:-----|
| **文件树**（左侧） | 浏览项目文件，点击显示路径 |
| **终端**（主区域） | 命令行操作，支持多 Tab |
| **AI 面板**（终端内切换） | 流式 AI 对话，不离开应用 |
| **Tab 栏**（顶部） | Tab 管理、主题切换、项目路径 |
| **拖拽区域**（无标题栏） | 顶部任意位置拖拽移动窗口 |

---

## 配置存储位置

所有用户数据保存在 `~/.termworkspace/`：

```
~/.termworkspace/
├── app-config.json     # 主题、项目路径
├── layout.json         # Tab 布局、分屏结构
└── chats/
    ├── tab_1.json      # Tab 1 的 AI 对话记录
    ├── tab_2.json      # Tab 2 的 AI 对话记录
    └── ...             # 每个有 AI 对话的 Tab 一个文件
```

**重置出厂设置：** 关掉应用，终端跑 `rm -rf ~/.termworkspace/`，下次启动跟第一次一样。

---

## 常见问题

### 终端一点反应都没有，光标也不闪

首次启动 PTY 初始化需要一点时间，等 2-3 秒就好。如果超过 10 秒没反应，关掉重开。

PTY 初始化分三层尝试：先尝试原生 node-pty（最快），不行就降级到 Python PTY 桥接，还不行就用备用方案。这个过程会自动完成，不需要你干预。

### AI 对话提示 "No API key found"

`.env` 文件没生效。检查：
1. 文件名是 `.env` 不是 `.env.txt` 或 `.env.production`
2. 内容格式：`DEEPSEEK_API_KEY=sk-xxx`（等号两边不要空格）
3. 文件在项目根目录（跟 `package.json` 同目录）

### 启动时弹窗说「应用程序未签名」

macOS Gatekeeper 不认识这个应用。处理方式：
- 系统设置 → 隐私与安全性 → 点「仍然打开」
- 或按住 `⌃Control` 键点应用 → 打开

### 怎么更新到最新版？

```bash
cd termworkspace
git pull
npm install
npm run build
npm start
```

### 布局数据和对话记录存在哪？会不会丢？

存在 `~/.termworkspace/`，纯 JSON 文件，不会自己丢。担心数据安全可以定期备份这个目录：

```bash
cp -r ~/.termworkspace ~/termworkspace-backup-$(date +%Y%m%d)
```

### 退出时要不要手动保存？

不需要。关闭窗口时自动保存：Tab 布局 + AI 对话 + 主题 + 项目路径，下次打开一一恢复。

**注意：** 终端里正在运行的进程（如 dev server、测试监听等）在退出应用时会被终止——关了就没了。建议先用 `Ctrl+C` 停掉运行的进程，再退出应用。

### 关于数据安全

TermWorkspace 所有数据存储在本地文件系统中，没有远程服务器、没有数据上传、没有用户追踪。AI 对话通过你的 API 密钥直连 AI 服务商（DeepSeek 或 Kimi），不经过第三方中转。

---

## 已知限制

- **仅支持 macOS**（Electron × node-pty 目前主要测试 macOS，Linux/Windows 构建配置已准备但未充分测试）
- **终端不支持滚动回看**（后续版本会加）
- **分屏模式**是一个 Tab 内终端与 AI 面板切换，还不是真正的分屏并排展示
- **窗口关闭直接退出**，没有确认对话框
- **AI 对话最多保留 500 条**，超过后自动丢弃最早的
- **终端里正在运行的进程**不会随会话恢复——关了应用就是真的关了
